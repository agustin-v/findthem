defmodule FindThemApiWeb.ZoneSeedControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches, Zones}

  setup %{conn: conn} do
    {:ok, owner} = Accounts.get_or_provision("user_owner_zoneseed", %{email: "zs@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{conn: authed_conn(conn, "user_owner_zoneseed"), search: search}
  end

  test "POST /api/searches/:id/zones/seed creates zones from the given cells", %{
    conn: conn,
    search: search
  } do
    conn =
      post(conn, ~p"/api/searches/#{search.id}/zones/seed", %{
        "cells" => [
          %{"h3_index" => "891f1d48177ffff", "segment_id" => 0},
          %{"h3_index" => "891f1d48178ffff", "segment_id" => 1}
        ]
      })

    assert %{"data" => %{"seeded" => 2}} = json_response(conn, 200)
    assert length(Zones.list_by_search(search.id)) == 2
  end

  test "does not reset a zone that already has progress", %{conn: conn, search: search} do
    {:ok, _} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})

    conn =
      post(conn, ~p"/api/searches/#{search.id}/zones/seed", %{
        "cells" => [%{"h3_index" => "891f1d48177ffff", "segment_id" => 0}]
      })

    assert %{"data" => %{"seeded" => 0}} = json_response(conn, 200)
    [zone] = Zones.list_by_search(search.id)
    assert zone.status == "searched"
  end

  test "rejects a malformed cell entry", %{conn: conn, search: search} do
    conn =
      post(conn, ~p"/api/searches/#{search.id}/zones/seed", %{
        "cells" => [%{"h3_index" => ""}]
      })

    assert json_response(conn, 422)
  end

  test "rejects an h3_index that isn't a valid 15-char hex cell", %{conn: conn, search: search} do
    conn =
      post(conn, ~p"/api/searches/#{search.id}/zones/seed", %{
        "cells" => [%{"h3_index" => "ffffffffffffffff", "segment_id" => 0}]
      })

    assert json_response(conn, 422)
    assert Zones.list_by_search(search.id) == []
  end

  test "rejects a missing cells param", %{conn: conn, search: search} do
    conn = post(conn, ~p"/api/searches/#{search.id}/zones/seed", %{})

    assert json_response(conn, 422)
  end

  test "seeding for a search owned by another user returns 404", %{conn: conn} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_zoneseed", %{email: "other@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn =
      post(conn, ~p"/api/searches/#{theirs.id}/zones/seed", %{
        "cells" => [%{"h3_index" => "891f1d48177ffff", "segment_id" => 0}]
      })

    assert json_response(conn, 404)
  end
end
