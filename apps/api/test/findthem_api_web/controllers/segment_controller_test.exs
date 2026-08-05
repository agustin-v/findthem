defmodule FindThemApiWeb.SegmentControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches, Segments}

  setup %{conn: conn} do
    {:ok, owner} =
      Accounts.get_or_provision("user_owner_segments_ctrl", %{email: "z@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 3}])

    %{conn: authed_conn(conn, "user_owner_segments_ctrl"), search: search}
  end

  test "PATCH for a segment_id that was never generated returns 404", %{
    conn: conn,
    search: search
  } do
    conn =
      patch(conn, ~p"/api/searches/#{search.id}/segments/99", %{
        "status" => "searched"
      })

    assert json_response(conn, 404)
  end

  test "PATCH /api/searches/:id/segments/:segment_id sets searched_at when status is searched", %{
    conn: conn,
    search: search
  } do
    conn =
      patch(conn, ~p"/api/searches/#{search.id}/segments/3", %{
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
      patch(conn, ~p"/api/searches/#{search.id}/segments/3", %{
        "status" => "searched"
      })

    assert json_response(conn1, 200)

    conn2 =
      patch(conn, ~p"/api/searches/#{search.id}/segments/3", %{
        "status" => "searched"
      })

    assert %{"data" => data} = json_response(conn2, 200)
    assert data["status"] == "searched"
  end

  test "PATCH rejects a non-integer segment_id instead of persisting it", %{
    conn: conn,
    search: search
  } do
    conn =
      patch(conn, ~p"/api/searches/#{search.id}/segments/not-a-number", %{
        "status" => "searched"
      })

    assert json_response(conn, 422)
  end

  test "GET /api/searches/:id/segments lists segments for the search", %{
    conn: conn,
    search: search
  } do
    patch(conn, ~p"/api/searches/#{search.id}/segments/3", %{"status" => "assigned"})

    conn = get(conn, ~p"/api/searches/#{search.id}/segments")

    assert %{"data" => [segment]} = json_response(conn, 200)
    assert segment["segment_id"] == 3
  end

  test "segments for a search owned by another user return 404", %{conn: conn} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_segments_ctrl", %{email: "other@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = get(conn, ~p"/api/searches/#{theirs.id}/segments")

    assert json_response(conn, 404)
  end
end
