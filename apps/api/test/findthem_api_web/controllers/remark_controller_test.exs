defmodule FindThemApiWeb.RemarkControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches}

  setup %{conn: conn} do
    {:ok, owner} =
      Accounts.get_or_provision("user_owner_remarks_ctrl", %{email: "r@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{conn: authed_conn(conn, "user_owner_remarks_ctrl"), search: search}
  end

  test "POST /api/searches/:id/remarks round-trips a client-supplied uuid, reported_at, and position", %{
    conn: conn,
    search: search
  } do
    id = Ecto.UUID.generate()
    reported_at = "2026-08-01T10:00:00Z"

    conn =
      post(conn, ~p"/api/searches/#{search.id}/remarks", %{
        "remark" => %{
          "id" => id,
          "kind" => "hazard",
          "text" => "Bridge is down",
          "lat" => 41.9,
          "lng" => 12.5,
          "reported_at" => reported_at
        }
      })

    assert %{"data" => data} = json_response(conn, 201)
    assert data["id"] == id
    assert data["reported_at"] == reported_at
    assert data["lat"] == 41.9
    assert data["lng"] == 12.5
  end

  # A map notice with no position doesn't make sense — unlike the volunteer
  # flow (a denied/failed GPS fix still lets a report through with no pin),
  # this path requires lat/lng specifically so a coordinator's notice never
  # silently lands at (0,0) or gets dropped from the map entirely.
  test "POST /api/searches/:id/remarks requires lat and lng", %{conn: conn, search: search} do
    conn =
      post(conn, ~p"/api/searches/#{search.id}/remarks", %{
        "remark" => %{
          "id" => Ecto.UUID.generate(),
          "kind" => "hazard",
          "text" => "Bridge is down",
          "reported_at" => "2026-08-01T10:00:00Z"
        }
      })

    assert %{"errors" => errors} = json_response(conn, 422)
    assert errors["lat"]
    assert errors["lng"]
  end

  test "GET /api/searches/:id/remarks lists remarks for the search", %{
    conn: conn,
    search: search
  } do
    post(conn, ~p"/api/searches/#{search.id}/remarks", %{
      "remark" => %{
        "id" => Ecto.UUID.generate(),
        "kind" => "sighting",
        "text" => "Note",
        "lat" => 41.9,
        "lng" => 12.5,
        "reported_at" => "2026-08-01T10:00:00Z"
      }
    })

    conn = get(conn, ~p"/api/searches/#{search.id}/remarks")

    assert %{"data" => [remark]} = json_response(conn, 200)
    assert remark["kind"] == "sighting"
  end

  test "remarks for a search owned by another user return 404", %{conn: conn} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_remarks_ctrl", %{email: "other@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = get(conn, ~p"/api/searches/#{theirs.id}/remarks")

    assert json_response(conn, 404)
  end
end
