defmodule FindThemApiWeb.SegmentAssignmentControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches, Segments, Volunteers}

  setup %{conn: conn} do
    {:ok, owner} =
      Accounts.get_or_provision("user_owner_assign_ctrl", %{email: "a@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 0}])

    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

    %{conn: authed_conn(conn, "user_owner_assign_ctrl"), search: search, volunteer: approved}
  end

  test "POST creates an assignment", %{conn: conn, search: search, volunteer: volunteer} do
    conn =
      post(conn, ~p"/api/searches/#{search.id}/segment_assignments", %{
        "segment_id" => 0,
        "volunteer_id" => volunteer.id
      })

    assert %{"data" => data} = json_response(conn, 201)
    assert data["segment_id"] == 0
    assert data["volunteer_id"] == volunteer.id
  end

  test "POST for a segment_id that doesn't exist returns 422", %{
    conn: conn,
    search: search,
    volunteer: volunteer
  } do
    conn =
      post(conn, ~p"/api/searches/#{search.id}/segment_assignments", %{
        "segment_id" => 99,
        "volunteer_id" => volunteer.id
      })

    assert json_response(conn, 422)
  end

  test "POST for a pending (not approved) volunteer returns 422", %{conn: conn, search: search} do
    {:ok, pending} =
      Volunteers.join_volunteer(search.id, %{name: "Pending", phone: "+390698766"})

    conn =
      post(conn, ~p"/api/searches/#{search.id}/segment_assignments", %{
        "segment_id" => 0,
        "volunteer_id" => pending.id
      })

    assert json_response(conn, 422)
  end

  test "POST without volunteer_id returns 422", %{conn: conn, search: search} do
    conn =
      post(conn, ~p"/api/searches/#{search.id}/segment_assignments", %{"segment_id" => 0})

    assert json_response(conn, 422)
  end

  test "POST for a search owned by another user returns 404", %{conn: conn, volunteer: volunteer} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_assign_ctrl", %{email: "other@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn =
      post(conn, ~p"/api/searches/#{theirs.id}/segment_assignments", %{
        "segment_id" => 0,
        "volunteer_id" => volunteer.id
      })

    assert json_response(conn, 404)
  end

  test "GET lists assignments for the search", %{conn: conn, search: search, volunteer: volunteer} do
    post(conn, ~p"/api/searches/#{search.id}/segment_assignments", %{
      "segment_id" => 0,
      "volunteer_id" => volunteer.id
    })

    conn = get(conn, ~p"/api/searches/#{search.id}/segment_assignments")

    assert %{"data" => [assignment]} = json_response(conn, 200)
    assert assignment["segment_id"] == 0
    assert assignment["volunteer_id"] == volunteer.id
  end

  test "DELETE removes an assignment", %{conn: conn, search: search, volunteer: volunteer} do
    post(conn, ~p"/api/searches/#{search.id}/segment_assignments", %{
      "segment_id" => 0,
      "volunteer_id" => volunteer.id
    })

    conn = delete(conn, ~p"/api/searches/#{search.id}/segment_assignments/0/#{volunteer.id}")

    assert response(conn, 204)

    conn2 = get(conn, ~p"/api/searches/#{search.id}/segment_assignments")
    assert %{"data" => []} = json_response(conn2, 200)
  end

  test "DELETE with a malformed volunteer_id returns 404 instead of crashing", %{
    conn: conn,
    search: search
  } do
    conn = delete(conn, ~p"/api/searches/#{search.id}/segment_assignments/0/not-a-uuid")

    assert json_response(conn, 404)
  end

  test "DELETE for a search owned by another user returns 404", %{conn: conn, volunteer: volunteer} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_assign_del", %{email: "other2@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = delete(conn, ~p"/api/searches/#{theirs.id}/segment_assignments/0/#{volunteer.id}")

    assert json_response(conn, 404)
  end
end
