defmodule FindThemApi.SearchesGenerateTest do
  use FindThemApi.DataCase, async: true

  import Mox

  alias FindThemApi.{Accounts, Searches, Volunteers, Segments}
  alias FindThemApi.Geo.ClientMock

  setup :verify_on_exit!

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_gen", %{email: "gen@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345",
        lkp_lat: 41.9028,
        lkp_lng: 12.4964
      })

    %{search: search}
  end

  defp geo_response(segment_ids) do
    %{
      "segments" => %{
        "type" => "FeatureCollection",
        "features" =>
          Enum.map(segment_ids, fn segment_id ->
            %{
              "type" => "Feature",
              "geometry" => %{"type" => "Polygon", "coordinates" => []},
              "properties" => %{
                "segment_id" => segment_id,
                "cell_count" => 12
              }
            }
          end)
      },
      "restricted_areas" => %{"type" => "FeatureCollection", "features" => []},
      "meta" => %{"total_segments" => length(segment_ids)}
    }
  end

  test "generate/2 persists a generation and seeds segments", %{search: search} do
    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response([0, 1])} end)

    {:ok, generation} = Searches.generate(search, %{"radius_km" => 1.0})

    assert generation.search_id == search.id

    segments = Segments.list_by_search(search.id) |> Enum.sort_by(& &1.segment_id)
    assert length(segments) == 2
    assert Enum.map(segments, & &1.status) == ["not_assigned", "not_assigned"]
    assert Enum.map(segments, & &1.segment_id) == [0, 1]
  end

  test "generate/2 no longer requests or persists cells (segments carry their own polygon geometry)",
       %{search: search} do
    expect(ClientMock, :generate_segments, fn params ->
      refute Map.has_key?(params, "include_cells")
      {:ok, geo_response([0])}
    end)

    {:ok, generation} = Searches.generate(search, %{"radius_km" => 1.0})

    [feature] = generation.response["segments"]["features"]
    refute Map.has_key?(feature["properties"], "cells")
    assert length(Segments.list_by_search(search.id)) == 1
  end

  test "regenerating resets segment progress (segment numbering isn't stable across regenerates)",
       %{search: search} do
    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response([0, 1])} end)

    {:ok, _} = Searches.generate(search, %{"radius_km" => 1.0})
    {:ok, _} = Segments.update_segment_status(search.id, 0, %{status: "searched"})

    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response([0, 1])} end)

    # Re-fetch — generate/2 persists radius_km onto the search row, and (like
    # the real controller, which re-fetches per request) a "later call" here
    # must see that, not the stale in-memory struct from before the update.
    refreshed_search = Searches.get_search!(search.id)
    {:ok, _second_generation} = Searches.generate(refreshed_search, %{})

    segments = Segments.list_by_search(search.id)
    reseeded = Enum.find(segments, &(&1.segment_id == 0))
    assert reseeded.status == "not_assigned"
  end

  test "regenerating clears segment assignments (segment numbering isn't stable across regenerates)",
       %{search: search} do
    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response([0, 1])} end)
    {:ok, _} = Searches.generate(search, %{"radius_km" => 1.0})

    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+390698765"})

    {:ok, volunteer} = Volunteers.set_status(volunteer, "approved")
    {:ok, _} = FindThemApi.SegmentAssignments.assign(search.id, 0, volunteer.id)

    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response([0, 1])} end)
    refreshed_search = Searches.get_search!(search.id)
    {:ok, _} = Searches.generate(refreshed_search, %{})

    assert FindThemApi.SegmentAssignments.list_by_search(search.id) == []
  end

  test "generate/2 propagates :geo_unavailable and persists nothing", %{search: search} do
    expect(ClientMock, :generate_segments, fn _params -> {:error, :geo_unavailable} end)

    assert {:error, :geo_unavailable} = Searches.generate(search, %{"radius_km" => 1.0})
    assert Searches.latest_generation(search.id) == nil
    assert Segments.list_by_search(search.id) == []
  end

  test "generate/2 requires radius_km on the first call for a search that has none", %{
    search: search
  } do
    assert {:error, :radius_km_required} = Searches.generate(search, %{})
  end

  test "generate/2 reuses the persisted radius_km when omitted on a later call", %{
    search: search
  } do
    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response([])} end)
    {:ok, _} = Searches.generate(search, %{"radius_km" => 2.5})

    expect(ClientMock, :generate_segments, fn params ->
      assert params["radius_km"] == 2.5
      {:ok, geo_response([])}
    end)

    refreshed_search = Searches.get_search!(search.id)
    assert {:ok, _} = Searches.generate(refreshed_search, %{})
  end

  test "generate/2 defaults resources to current approved volunteer counts when omitted", %{
    search: search
  } do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{
        name: "Giulia",
        phone: "+390698765",
        resource_type: "people"
      })

    {:ok, _} = Volunteers.set_status(volunteer, "approved")

    expect(ClientMock, :generate_segments, fn params ->
      assert params["resources"] == [%{"type" => "people", "count" => 1}]
      {:ok, geo_response([])}
    end)

    assert {:ok, _} = Searches.generate(search, %{"radius_km" => 1.0})
  end

  test "generate/2 omits resources entirely (letting geo default) when there are no approved volunteers",
       %{search: search} do
    expect(ClientMock, :generate_segments, fn params ->
      refute Map.has_key?(params, "resources")
      {:ok, geo_response([])}
    end)

    assert {:ok, _} = Searches.generate(search, %{"radius_km" => 1.0})
  end

  test "generate/2 broadcasts {:generation_created, generation}", %{search: search} do
    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response([])} end)

    {:ok, generation} = Searches.generate(search, %{"radius_km" => 1.0})

    assert_receive {:generation_created, %{id: id}}
    assert id == generation.id
  end
end
