defmodule FindThemApiWeb.ZoneControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches}

  setup %{conn: conn} do
    {:ok, owner} = Accounts.get_or_provision("user_owner_zones_ctrl", %{email: "z@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{conn: authed_conn(conn, "user_owner_zones_ctrl"), search: search}
  end

  test "PATCH /api/searches/:id/zones/:h3_index sets searched_at when status is searched", %{
    conn: conn,
    search: search
  } do
    conn =
      patch(conn, ~p"/api/searches/#{search.id}/zones/891f1d48177ffff", %{
        "status" => "searched"
      })

    assert %{"data" => data} = json_response(conn, 200)
    assert data["status"] == "searched"
    assert data["searched_at"] != nil
  end

  test "PATCH is idempotent — calling it twice succeeds both times", %{
    conn: conn,
    search: search
  } do
    conn1 =
      patch(conn, ~p"/api/searches/#{search.id}/zones/891f1d48177ffff", %{
        "status" => "searched"
      })

    assert json_response(conn1, 200)

    conn2 =
      patch(conn, ~p"/api/searches/#{search.id}/zones/891f1d48177ffff", %{
        "status" => "searched"
      })

    assert %{"data" => data} = json_response(conn2, 200)
    assert data["status"] == "searched"
  end

  test "GET /api/searches/:id/zones lists zones for the search", %{conn: conn, search: search} do
    patch(conn, ~p"/api/searches/#{search.id}/zones/891f1d48177ffff", %{"status" => "assigned"})

    conn = get(conn, ~p"/api/searches/#{search.id}/zones")

    assert %{"data" => [zone]} = json_response(conn, 200)
    assert zone["h3_index"] == "891f1d48177ffff"
  end

  test "zones for a search owned by another user return 404", %{conn: conn} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_zones_ctrl", %{email: "other@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = get(conn, ~p"/api/searches/#{theirs.id}/zones")

    assert json_response(conn, 404)
  end
end
