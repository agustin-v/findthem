defmodule FindThemApi.SegmentAssignmentsTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Segments, SegmentAssignments, Volunteers}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_assignments", %{email: "a@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 0}, %{segment_id: 1}])

    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

    %{search: search, volunteer: approved}
  end

  test "assign/3 creates an assignment for an existing segment and an approved volunteer", %{
    search: search,
    volunteer: volunteer
  } do
    {:ok, assignment} = SegmentAssignments.assign(search.id, 0, volunteer.id)

    assert assignment.search_id == search.id
    assert assignment.segment_id == 0
    assert assignment.volunteer_id == volunteer.id
    assert assignment.assigned_at != nil
  end

  test "assign/3 returns :segment_not_found for a segment_id that was never generated", %{
    search: search,
    volunteer: volunteer
  } do
    assert {:error, :segment_not_found} = SegmentAssignments.assign(search.id, 99, volunteer.id)
  end

  test "assign/3 returns :not_found for a volunteer from a different search", %{
    search: search
  } do
    {:ok, other_owner} = Accounts.get_or_provision("user_other_assign", %{email: "o@example.com"})

    {:ok, other_search} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Other",
        contact_phone: "+390612345"
      })

    {:ok, foreign_volunteer} =
      Volunteers.join_volunteer(other_search.id, %{name: "Luca", phone: "+390698766"})

    {:ok, approved_foreign} = Volunteers.update_volunteer(foreign_volunteer, %{status: "approved"})

    assert {:error, :not_found} = SegmentAssignments.assign(search.id, 0, approved_foreign.id)
  end

  test "assign/3 returns :volunteer_not_approved for a pending volunteer", %{search: search} do
    {:ok, pending} =
      Volunteers.join_volunteer(search.id, %{name: "Pending Person", phone: "+390698767"})

    assert {:error, :volunteer_not_approved} = SegmentAssignments.assign(search.id, 0, pending.id)
  end

  test "assign/3 is idempotent — assigning the same pair twice doesn't error or duplicate", %{
    search: search,
    volunteer: volunteer
  } do
    {:ok, _} = SegmentAssignments.assign(search.id, 0, volunteer.id)
    {:ok, _} = SegmentAssignments.assign(search.id, 0, volunteer.id)

    assert length(SegmentAssignments.list_by_search(search.id)) == 1
  end

  test "assign/3 allows multiple different volunteers on the same segment", %{
    search: search,
    volunteer: volunteer
  } do
    {:ok, other} = Volunteers.join_volunteer(search.id, %{name: "Drone Op", phone: "+390698768"})
    {:ok, other} = Volunteers.update_volunteer(other, %{status: "approved"})

    {:ok, _} = SegmentAssignments.assign(search.id, 0, volunteer.id)
    {:ok, _} = SegmentAssignments.assign(search.id, 0, other.id)

    volunteer_ids =
      SegmentAssignments.list_by_search(search.id) |> Enum.map(& &1.volunteer_id) |> Enum.sort()

    assert volunteer_ids == Enum.sort([volunteer.id, other.id])
  end

  test "assign/3 broadcasts {:segment_assignment_created, assignment}", %{
    search: search,
    volunteer: volunteer
  } do
    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    {:ok, _} = SegmentAssignments.assign(search.id, 0, volunteer.id)

    assert_receive {:segment_assignment_created, %{segment_id: 0, volunteer_id: vid}}
    assert vid == volunteer.id
  end

  test "unassign/3 removes an assignment", %{search: search, volunteer: volunteer} do
    {:ok, _} = SegmentAssignments.assign(search.id, 0, volunteer.id)

    {:ok, 1} = SegmentAssignments.unassign(search.id, 0, volunteer.id)

    assert SegmentAssignments.list_by_search(search.id) == []
  end

  test "unassign/3 is idempotent — removing a nonexistent assignment doesn't error", %{
    search: search,
    volunteer: volunteer
  } do
    assert {:ok, 0} = SegmentAssignments.unassign(search.id, 0, volunteer.id)
  end

  test "unassign/3 returns :not_found instead of crashing on a malformed volunteer_id", %{
    search: search
  } do
    assert {:error, :not_found} = SegmentAssignments.unassign(search.id, 0, "not-a-uuid")
  end

  test "list_segment_ids_for_volunteer/2 only returns this volunteer's segments", %{
    search: search,
    volunteer: volunteer
  } do
    {:ok, other} = Volunteers.join_volunteer(search.id, %{name: "Other", phone: "+390698769"})
    {:ok, other} = Volunteers.update_volunteer(other, %{status: "approved"})

    {:ok, _} = SegmentAssignments.assign(search.id, 0, volunteer.id)
    {:ok, _} = SegmentAssignments.assign(search.id, 1, other.id)

    assert SegmentAssignments.list_segment_ids_for_volunteer(search.id, volunteer.id) == [0]
  end

  test "clear_for_search/1 removes all assignments for the search", %{
    search: search,
    volunteer: volunteer
  } do
    {:ok, _} = SegmentAssignments.assign(search.id, 0, volunteer.id)
    {:ok, _} = SegmentAssignments.assign(search.id, 1, volunteer.id)

    :ok = SegmentAssignments.clear_for_search(search.id)

    assert SegmentAssignments.list_by_search(search.id) == []
  end
end
