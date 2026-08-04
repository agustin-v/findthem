defmodule FindThemApi.SearchesGenerateTest do
  use FindThemApi.DataCase, async: true

  import Mox

  alias FindThemApi.{Accounts, Searches, Volunteers, Zones}
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

  defp geo_response(segments) do
    %{
      "segments" => %{
        "type" => "FeatureCollection",
        "features" =>
          Enum.map(segments, fn {segment_id, cells} ->
            %{
              "type" => "Feature",
              "geometry" => %{"type" => "Polygon", "coordinates" => []},
              "properties" => %{
                "segment_id" => segment_id,
                "cell_count" => length(cells),
                "cells" => cells
              }
            }
          end)
      },
      "restricted_areas" => %{"type" => "FeatureCollection", "features" => []},
      "meta" => %{"total_cells" => Enum.sum(Enum.map(segments, fn {_, c} -> length(c) end))}
    }
  end

  test "generate/2 persists a generation and seeds zones with segment ids", %{search: search} do
    expect(ClientMock, :generate_segments, fn _params ->
      {:ok, geo_response([{0, ["891f1d48177ffff", "891f1d48178ffff"]}])}
    end)

    {:ok, generation} = Searches.generate(search, %{"radius_km" => 1.0})

    assert generation.search_id == search.id

    zones = Zones.list_by_search(search.id) |> Enum.sort_by(& &1.h3_index)
    assert length(zones) == 2
    assert Enum.map(zones, & &1.status) == ["not_assigned", "not_assigned"]
    assert Enum.map(zones, & &1.segment_id) == ["0", "0"]
  end

  test "generate/2 strips cells from the persisted response but still seeds zones from them", %{
    search: search
  } do
    expect(ClientMock, :generate_segments, fn _params ->
      {:ok, geo_response([{0, ["891f1d48177ffff"]}])}
    end)

    {:ok, generation} = Searches.generate(search, %{"radius_km" => 1.0})

    [feature] = generation.response["segments"]["features"]
    refute Map.has_key?(feature["properties"], "cells")
    assert length(Zones.list_by_search(search.id)) == 1
  end

  test "regenerating preserves an existing zone's searched status (must not wipe volunteer progress)",
       %{search: search} do
    expect(ClientMock, :generate_segments, fn _params ->
      {:ok, geo_response([{0, ["891f1d48177ffff", "891f1d48178ffff"]}])}
    end)

    {:ok, _} = Searches.generate(search, %{"radius_km" => 1.0})
    {:ok, _} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})

    expect(ClientMock, :generate_segments, fn _params ->
      {:ok, geo_response([{0, ["891f1d48177ffff", "891f1d48178ffff"]}])}
    end)

    # Re-fetch — generate/2 persists radius_km onto the search row, and (like
    # the real controller, which re-fetches per request) a "later call" here
    # must see that, not the stale in-memory struct from before the update.
    refreshed_search = Searches.get_search!(search.id)
    {:ok, _second_generation} = Searches.generate(refreshed_search, %{})

    zones = Zones.list_by_search(search.id)
    searched = Enum.find(zones, &(&1.h3_index == "891f1d48177ffff"))
    assert searched.status == "searched"
  end

  test "generate/2 propagates :geo_unavailable and persists nothing", %{search: search} do
    expect(ClientMock, :generate_segments, fn _params -> {:error, :geo_unavailable} end)

    assert {:error, :geo_unavailable} = Searches.generate(search, %{"radius_km" => 1.0})
    assert Searches.latest_generation(search.id) == nil
    assert Zones.list_by_search(search.id) == []
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
