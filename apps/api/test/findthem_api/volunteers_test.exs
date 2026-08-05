defmodule FindThemApi.VolunteersTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Volunteers}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner2", %{email: "o2@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{search: search}
  end

  test "join_volunteer/2 broadcasts {:volunteer_joined, volunteer} on search:#{"{search_id}"}", %{
    search: search
  } do
    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    assert volunteer.search_id == search.id
    assert volunteer.status == "pending"
    assert_receive {:volunteer_joined, %{id: id}}
    assert id == volunteer.id
  end

  test "join_volunteer/2 rejects an oversized name or phone", %{search: search} do
    {:error, changeset} =
      Volunteers.join_volunteer(search.id, %{
        name: String.duplicate("a", 201),
        phone: String.duplicate("1", 33)
      })

    assert "should be at most 200 character(s)" in errors_on(changeset).name
    assert "should be at most 32 character(s)" in errors_on(changeset).phone
  end

  test "sign_token/2 and verify_token/2 round-trip to the same volunteer", %{search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, volunteer.id)

    assert {:ok, found} = Volunteers.verify_token(FindThemApiWeb.Endpoint, token)
    assert found.id == volunteer.id
  end

  test "verify_token/2 rejects a garbage token", %{search: _search} do
    assert {:error, :invalid} = Volunteers.verify_token(FindThemApiWeb.Endpoint, "garbage")
  end

  test "verify_token/2 rejects a well-formed token for a volunteer that no longer exists", %{
    search: search
  } do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, volunteer.id)
    Repo.delete(volunteer)

    assert {:error, :invalid} = Volunteers.verify_token(FindThemApiWeb.Endpoint, token)
  end

  test "touch_last_active/1 updates last_active_at without broadcasting", %{search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    {:ok, touched} = Volunteers.touch_last_active(volunteer)

    assert touched.last_active_at != nil
    refute_receive {:volunteer_updated, _}
  end

  test "get_volunteer_in_search/2 returns the volunteer when it belongs to that search", %{
    search: search
  } do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    assert {:ok, found} = Volunteers.get_volunteer_in_search(search.id, volunteer.id)
    assert found.id == volunteer.id
  end

  test "get_volunteer_in_search/2 returns :not_found for a volunteer from a different search", %{
    search: search
  } do
    {:ok, owner2} = Accounts.get_or_provision("user_owner2b", %{email: "o2b@example.com"})

    {:ok, other_search} =
      Searches.create_search(owner2.id, %{
        subject_type: "person",
        subject_name: "Other",
        contact_phone: "+390612345"
      })

    {:ok, other_volunteer} =
      Volunteers.join_volunteer(other_search.id, %{name: "Luca", phone: "+390698766"})

    assert {:error, :not_found} =
             Volunteers.get_volunteer_in_search(search.id, other_volunteer.id)
  end

  test "get_volunteer_in_search/2 returns :not_found for a garbage id" do
    assert {:error, :not_found} = Volunteers.get_volunteer_in_search("nope", "not-a-uuid")
  end

  test "set_status/2 approves a pending volunteer and stamps approved_at", %{search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    {:ok, approved} = Volunteers.set_status(volunteer, "approved")

    assert approved.status == "approved"
    assert approved.approved_at != nil
    assert_receive {:volunteer_updated, %{status: "approved"}}
  end

  test "set_status/2 removes a volunteer and stamps removed_at", %{search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    {:ok, removed} = Volunteers.set_status(volunteer, "removed")

    assert removed.status == "removed"
    assert removed.removed_at != nil
  end

  test "set_status/2 rejects any status other than approved/removed", %{search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    assert {:error, :invalid_status} = Volunteers.set_status(volunteer, "pending")
    assert {:error, :invalid_status} = Volunteers.set_status(volunteer, "anything-else")
  end

  test "list_by_search_with_stats/1 includes pending volunteers and their segments-searched count",
       %{
         search: search
       } do
    {:ok, pending} =
      Volunteers.join_volunteer(search.id, %{name: "Pending Person", phone: "+390698765"})

    {:ok, active} =
      Volunteers.join_volunteer(search.id, %{name: "Active Person", phone: "+390698766"})

    Volunteers.set_status(active, "approved")

    {:ok, _} = FindThemApi.Segments.seed_segments(search.id, [%{segment_id: 0}, %{segment_id: 1}])

    FindThemApi.Segments.update_segment_status(search.id, 0, %{
      status: "searched",
      searched_by_volunteer_id: active.id
    })

    FindThemApi.Segments.update_segment_status(search.id, 1, %{
      status: "searched",
      searched_by_volunteer_id: active.id
    })

    results = Volunteers.list_by_search_with_stats(search.id)
    by_id = Map.new(results, fn {v, count} -> {v.id, count} end)

    assert by_id[pending.id] == 0
    assert by_id[active.id] == 2
  end

  test "list_by_search_with_stats/1 orders volunteers by joined_at, oldest first", %{
    search: search
  } do
    {:ok, first} =
      Volunteers.join_volunteer(search.id, %{
        name: "First",
        phone: "+390698761",
        joined_at: ~U[2026-08-01 10:00:00Z]
      })

    {:ok, second} =
      Volunteers.join_volunteer(search.id, %{
        name: "Second",
        phone: "+390698762",
        joined_at: ~U[2026-08-01 11:00:00Z]
      })

    {:ok, third} =
      Volunteers.join_volunteer(search.id, %{
        name: "Third",
        phone: "+390698763",
        joined_at: ~U[2026-08-01 09:00:00Z]
      })

    ids = search.id |> Volunteers.list_by_search_with_stats() |> Enum.map(fn {v, _} -> v.id end)

    assert ids == [third.id, first.id, second.id]
  end
end
