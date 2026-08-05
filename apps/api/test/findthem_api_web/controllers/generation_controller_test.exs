defmodule FindThemApiWeb.GenerationControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures
  import Mox

  alias FindThemApi.{Accounts, Searches, Segments}
  alias FindThemApi.Geo.ClientMock

  setup :verify_on_exit!

  setup %{conn: conn} do
    {:ok, owner} = Accounts.get_or_provision("user_owner_gen_ctrl", %{email: "genc@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345",
        lkp_lat: 41.9028,
        lkp_lng: 12.4964
      })

    %{conn: authed_conn(conn, "user_owner_gen_ctrl"), search: search}
  end

  defp geo_response do
    %{
      "segments" => %{
        "type" => "FeatureCollection",
        "features" => [
          %{
            "type" => "Feature",
            "geometry" => %{"type" => "Polygon", "coordinates" => []},
            "properties" => %{
              "segment_id" => 0,
              "cell_count" => 1
            }
          }
        ]
      },
      "restricted_areas" => %{"type" => "FeatureCollection", "features" => []},
      "meta" => %{"total_segments" => 1}
    }
  end

  test "POST /api/searches/:id/generate persists a generation and seeds segments", %{
    conn: conn,
    search: search
  } do
    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response()} end)

    conn = post(conn, ~p"/api/searches/#{search.id}/generate", %{"radius_km" => 1.0})

    assert %{"data" => data} = json_response(conn, 201)
    [feature] = data["response"]["segments"]["features"]
    refute Map.has_key?(feature["properties"], "cells")
    assert length(Segments.list_by_search(search.id)) == 1
  end

  test "POST without radius_km on a search that has none returns 422", %{
    conn: conn,
    search: search
  } do
    conn = post(conn, ~p"/api/searches/#{search.id}/generate", %{})

    assert json_response(conn, 422)
  end

  test "POST propagates a geo 503 as 503", %{conn: conn, search: search} do
    expect(ClientMock, :generate_segments, fn _params -> {:error, :geo_unavailable} end)

    conn = post(conn, ~p"/api/searches/#{search.id}/generate", %{"radius_km" => 1.0})

    assert json_response(conn, 503)
  end

  test "POST propagates geo's rejection status without leaking its raw response body", %{
    conn: conn,
    search: search
  } do
    expect(ClientMock, :generate_segments, fn _params ->
      {:error, {422, %{"detail" => "internal pydantic validation internals"}}}
    end)

    conn = post(conn, ~p"/api/searches/#{search.id}/generate", %{"radius_km" => 1.0})

    assert %{"errors" => %{"geo" => [message]}} = json_response(conn, 422)
    refute message =~ "pydantic"
  end

  test "POST for a search owned by another user returns 404", %{conn: conn} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_gen_ctrl", %{email: "otherc@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = post(conn, ~p"/api/searches/#{theirs.id}/generate", %{"radius_km" => 1.0})

    assert json_response(conn, 404)
  end

  test "GET /api/searches/:id/generations/latest returns nil when none exist", %{
    conn: conn,
    search: search
  } do
    conn = get(conn, ~p"/api/searches/#{search.id}/generations/latest")

    assert %{"data" => nil} = json_response(conn, 200)
  end

  test "GET /api/searches/:id/generations/latest returns the most recent generation", %{
    conn: conn,
    search: search
  } do
    expect(ClientMock, :generate_segments, fn _params -> {:ok, geo_response()} end)
    post(conn, ~p"/api/searches/#{search.id}/generate", %{"radius_km" => 1.0})

    conn = get(conn, ~p"/api/searches/#{search.id}/generations/latest")

    assert %{"data" => data} = json_response(conn, 200)
    refute is_nil(data)
    assert data["meta"]["total_segments"] == 1
  end

  test "GET generations/latest for a search owned by another user returns 404", %{conn: conn} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_gen_ctrl2", %{email: "otherc2@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = get(conn, ~p"/api/searches/#{theirs.id}/generations/latest")

    assert json_response(conn, 404)
  end
end
