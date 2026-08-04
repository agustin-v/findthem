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

  test "POST /api/searches/:id/remarks round-trips a client-supplied uuid and reported_at", %{
    conn: conn,
    search: search
  } do
    id = Ecto.UUID.generate()
    reported_at = "2026-08-01T10:00:00Z"

    conn =
      post(conn, ~p"/api/searches/#{search.id}/remarks", %{
        "remark" => %{
          "id" => id,
          "kind" => "sighting",
          "text" => "Saw someone matching description",
          "reported_at" => reported_at
        }
      })

    assert %{"data" => data} = json_response(conn, 201)
    assert data["id"] == id
    assert data["reported_at"] == reported_at
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
