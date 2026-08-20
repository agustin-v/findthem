defmodule FindThemApiWeb.SegmentControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches, Segments, Volunteers}

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

  describe "POST /api/searches/:id/segments/:segment_id/lock" do
    test "locks the segment for a given volunteer with a reason", %{conn: conn, search: search} do
      {:ok, volunteer} =
        Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+390698765"})

      {:ok, volunteer} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

      conn =
        post(conn, ~p"/api/searches/#{search.id}/segments/3/lock", %{
          "locked_for_volunteer_id" => volunteer.id,
          "lock_reason" => "went offline mid-sweep"
        })

      assert %{"data" => data} = json_response(conn, 200)
      assert data["locked_at"] != nil
      assert data["locked_for_volunteer_id"] == volunteer.id
      assert data["lock_reason"] == "went offline mid-sweep"
    end

    test "for a segment_id that was never generated returns 404", %{conn: conn, search: search} do
      conn = post(conn, ~p"/api/searches/#{search.id}/segments/99/lock", %{})

      assert json_response(conn, 404)
    end

    test "for a search owned by another user returns 404", %{conn: conn} do
      {:ok, other_owner} =
        Accounts.get_or_provision("user_other_segments_lock", %{email: "otherlock@example.com"})

      {:ok, theirs} =
        Searches.create_search(other_owner.id, %{
          subject_type: "person",
          subject_name: "Theirs",
          contact_phone: "+390612345"
        })

      {:ok, _} = Segments.seed_segments(theirs.id, [%{segment_id: 3}])

      conn = post(conn, ~p"/api/searches/#{theirs.id}/segments/3/lock", %{})

      assert json_response(conn, 404)
      refute Segments.list_by_search(theirs.id) |> hd() |> Map.get(:locked_at)
    end
  end

  describe "POST /api/searches/:id/segments/:segment_id/unlock" do
    test "clears the lock", %{conn: conn, search: search} do
      {:ok, volunteer} =
        Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+390698765"})

      {:ok, volunteer} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

      post(conn, ~p"/api/searches/#{search.id}/segments/3/lock", %{
        "locked_for_volunteer_id" => volunteer.id
      })

      conn = post(conn, ~p"/api/searches/#{search.id}/segments/3/unlock", %{})

      assert %{"data" => data} = json_response(conn, 200)
      assert data["locked_at"] == nil
    end
  end

  test "POST .../lock without a locked_for_volunteer_id returns 422", %{
    conn: conn,
    search: search
  } do
    conn = post(conn, ~p"/api/searches/#{search.id}/segments/3/lock", %{})

    assert json_response(conn, 422)
  end

  test "a locked segment does not block the coordinator's own status PATCH", %{
    conn: conn,
    search: search
  } do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+390698765"})

    {:ok, volunteer} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

    post(conn, ~p"/api/searches/#{search.id}/segments/3/lock", %{
      "locked_for_volunteer_id" => volunteer.id
    })

    conn = patch(conn, ~p"/api/searches/#{search.id}/segments/3", %{"status" => "searched"})

    assert %{"data" => data} = json_response(conn, 200)
    assert data["status"] == "searched"
  end
end
