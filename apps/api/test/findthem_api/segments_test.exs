defmodule FindThemApi.SegmentsTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Segments, Volunteers}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_segments", %{email: "z@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 3}])

    %{search: search, owner: owner}
  end

  defp approved_volunteer(search, name \\ "Giulia") do
    {:ok, volunteer} = Volunteers.join_volunteer(search.id, %{name: name, phone: "+390698765"})
    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
    approved
  end

  test "update_segment_status/3 returns :not_found for a segment that was never seeded", %{
    search: search
  } do
    assert {:error, :not_found} =
             Segments.update_segment_status(search.id, 99, %{status: "assigned"})

    assert Segments.list_by_search(search.id) |> Enum.map(& &1.segment_id) == [3]
  end

  test "update_segment_status/3 updates an existing segment's status", %{search: search} do
    {:ok, segment} = Segments.update_segment_status(search.id, 3, %{status: "assigned"})

    assert segment.search_id == search.id
    assert segment.segment_id == 3
    assert segment.status == "assigned"
    assert segment.searched_at == nil
  end

  test "update_segment_status/3 rejects an invalid status", %{search: search} do
    {:error, changeset} = Segments.update_segment_status(search.id, 3, %{status: "bogus"})

    assert "is invalid" in errors_on(changeset).status
  end

  test "update_segment_status/3 sets searched_at when status becomes searched", %{search: search} do
    {:ok, segment} = Segments.update_segment_status(search.id, 3, %{status: "searched"})

    assert segment.status == "searched"
    assert segment.searched_at != nil
  end

  test "update_segment_status/3 clears searched_at when status moves off searched", %{
    search: search
  } do
    {:ok, _} = Segments.update_segment_status(search.id, 3, %{status: "searched"})
    {:ok, segment} = Segments.update_segment_status(search.id, 3, %{status: "not_assigned"})

    assert segment.status == "not_assigned"
    assert segment.searched_at == nil
  end

  test "update_segment_status/3 is idempotent — calling twice with the same status doesn't error",
       %{search: search} do
    {:ok, _} = Segments.update_segment_status(search.id, 3, %{status: "searched"})
    {:ok, segment} = Segments.update_segment_status(search.id, 3, %{status: "searched"})

    assert segment.status == "searched"
  end

  test "update_segment_status/3 broadcasts {:segment_updated, segment} on search:#{"{search_id}"}",
       %{search: search} do
    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    {:ok, segment} = Segments.update_segment_status(search.id, 3, %{status: "assigned"})

    assert_receive {:segment_updated, %{segment_id: 3}}
    assert segment.status == "assigned"
  end

  test "update_segment_status/3 with an empty attrs map does not reset an existing status", %{
    search: search
  } do
    {:ok, _} = Segments.update_segment_status(search.id, 3, %{status: "searched"})
    {:ok, segment} = Segments.update_segment_status(search.id, 3, %{})

    assert segment.status == "searched"
    assert segment.searched_at != nil
  end

  test "update_segment_status/3 keeps searched_at stable across repeated identical PATCHes", %{
    search: search
  } do
    {:ok, first} = Segments.update_segment_status(search.id, 3, %{status: "searched"})
    Process.sleep(1100)
    {:ok, second} = Segments.update_segment_status(search.id, 3, %{status: "searched"})

    assert first.searched_at == second.searched_at
  end

  test "list_by_search/1 returns segments for the search", %{search: search} do
    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 0}, %{segment_id: 1}])

    segments = Segments.list_by_search(search.id)

    assert length(segments) == 2
  end

  test "seed_segments/2 bulk-creates not_assigned segments", %{search: search} do
    entries = [%{segment_id: 0}, %{segment_id: 1}]

    {:ok, count} = Segments.seed_segments(search.id, entries)

    assert count == 2
    segments = Segments.list_by_search(search.id) |> Enum.sort_by(& &1.segment_id)
    assert Enum.map(segments, & &1.status) == ["not_assigned", "not_assigned"]
    assert Enum.map(segments, & &1.segment_id) == [0, 1]
  end

  test "seed_segments/2 resets an existing segment's progress (segment numbering isn't stable across regenerates)",
       %{search: search} do
    {:ok, _} = Segments.update_segment_status(search.id, 3, %{status: "searched"})

    {:ok, count} = Segments.seed_segments(search.id, [%{segment_id: 3}])

    assert count == 1
    [segment] = Segments.list_by_search(search.id)
    assert segment.status == "not_assigned"
  end

  test "seed_segments/2 removes segments that no longer exist in the new generation", %{
    search: search
  } do
    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 0}, %{segment_id: 1}])

    {:ok, count} = Segments.seed_segments(search.id, [%{segment_id: 0}])

    assert count == 1
    assert Enum.map(Segments.list_by_search(search.id), & &1.segment_id) == [0]
  end

  describe "lock/4" do
    test "locks a segment for an explicitly-given volunteer", %{search: search, owner: owner} do
      volunteer = approved_volunteer(search)

      {:ok, segment} =
        Segments.lock(search.id, 3, owner.id, %{
          "locked_for_volunteer_id" => volunteer.id,
          "lock_reason" => "went offline mid-sweep"
        })

      assert segment.locked_at != nil
      assert segment.locked_by_user_id == owner.id
      assert segment.locked_for_volunteer_id == volunteer.id
      assert segment.lock_reason == "went offline mid-sweep"
    end

    test "returns :not_found for a segment that was never seeded", %{search: search, owner: owner} do
      assert {:error, :not_found} =
               Segments.lock(search.id, 99, owner.id, %{
                 "locked_for_volunteer_id" => approved_volunteer(search).id
               })
    end

    test "requires an explicit locked_for_volunteer_id — never inferred from the segment's own searched_by_volunteer_id",
         %{search: search, owner: owner} do
      assert {:error, :volunteer_required} = Segments.lock(search.id, 3, owner.id)
      assert {:error, :volunteer_required} = Segments.lock(search.id, 3, owner.id, %{})
    end

    test "H1 regression: a volunteer touching the segment's status first must not make lock/4 default to them",
         %{search: search, owner: owner} do
      volunteer = approved_volunteer(search)

      {:ok, _} =
        Segments.update_segment_status(search.id, 3, %{
          "status" => "in_progress",
          "searched_by_volunteer_id" => volunteer.id
        })

      assert {:error, :volunteer_required} = Segments.lock(search.id, 3, owner.id)

      segment = Segments.list_by_search(search.id) |> hd()
      assert segment.locked_at == nil
      assert segment.locked_for_volunteer_id == nil
    end

    test "rejects a locked_for_volunteer_id that doesn't belong to an approved volunteer of this search",
         %{search: search, owner: owner} do
      {:ok, other_owner} =
        Accounts.get_or_provision("user_owner_lock2", %{email: "lock2@example.com"})

      {:ok, other_search} =
        Searches.create_search(other_owner.id, %{
          subject_type: "person",
          subject_name: "Someone Else",
          contact_phone: "+390612345"
        })

      other_volunteer = approved_volunteer(other_search, "Andrea")

      assert {:error, :volunteer_not_approved} =
               Segments.lock(search.id, 3, owner.id, %{
                 "locked_for_volunteer_id" => other_volunteer.id
               })
    end

    test "broadcasts {:segment_updated, segment}", %{search: search, owner: owner} do
      volunteer = approved_volunteer(search)
      Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

      {:ok, _} =
        Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => volunteer.id})

      assert_receive {:segment_updated, %{segment_id: 3, locked_at: locked_at}}
      assert locked_at != nil
    end
  end

  describe "unlock/2" do
    test "clears every lock field", %{search: search, owner: owner} do
      volunteer = approved_volunteer(search)

      {:ok, _} =
        Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => volunteer.id})

      {:ok, segment} = Segments.unlock(search.id, 3)

      assert segment.locked_at == nil
      assert segment.locked_by_user_id == nil
      assert segment.locked_for_volunteer_id == nil
      assert segment.lock_reason == nil
    end

    test "returns :not_found for a segment that was never seeded", %{search: search} do
      assert {:error, :not_found} = Segments.unlock(search.id, 99)
    end
  end

  describe "update_segment_status/4 with locking" do
    test "rejects a volunteer PATCH from anyone other than the volunteer the segment is locked for",
         %{search: search, owner: owner} do
      reserved = approved_volunteer(search, "Giulia")
      someone_else = approved_volunteer(search, "Luca")

      {:ok, _} =
        Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

      assert {:error, :segment_locked} =
               Segments.update_segment_status(
                 search.id,
                 3,
                 %{"status" => "searched", "searched_by_volunteer_id" => someone_else.id},
                 actor: :volunteer
               )
    end

    test "allows the reserved volunteer's own PATCH and auto-clears the lock", %{
      search: search,
      owner: owner
    } do
      reserved = approved_volunteer(search)

      {:ok, _} =
        Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

      {:ok, segment} =
        Segments.update_segment_status(
          search.id,
          3,
          %{"status" => "searched", "searched_by_volunteer_id" => reserved.id},
          actor: :volunteer
        )

      assert segment.status == "searched"
      assert segment.locked_at == nil
      assert segment.locked_by_user_id == nil
      assert segment.locked_for_volunteer_id == nil
      assert segment.lock_reason == nil
    end

    test "never blocks the coordinator's own PATCH, even for a segment locked for someone else",
         %{search: search, owner: owner} do
      reserved = approved_volunteer(search)

      {:ok, _} =
        Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

      {:ok, segment} =
        Segments.update_segment_status(search.id, 3, %{"status" => "searched"},
          actor: :coordinator
        )

      assert segment.status == "searched"
      # The coordinator's own edit doesn't auto-clear the lock either — only
      # the reserved volunteer's own successful PATCH does that.
      assert segment.locked_at != nil
    end

    test "an unlocked segment is unaffected by the lock check", %{search: search} do
      volunteer = approved_volunteer(search)

      assert {:ok, %{status: "in_progress"}} =
               Segments.update_segment_status(
                 search.id,
                 3,
                 %{"status" => "in_progress", "searched_by_volunteer_id" => volunteer.id},
                 actor: :volunteer
               )
    end

    test "the reserved volunteer resuming to in_progress does not clear the lock", %{
      search: search,
      owner: owner
    } do
      reserved = approved_volunteer(search)

      {:ok, _} =
        Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

      {:ok, segment} =
        Segments.update_segment_status(
          search.id,
          3,
          %{"status" => "in_progress", "searched_by_volunteer_id" => reserved.id},
          actor: :volunteer
        )

      assert segment.status == "in_progress"
      assert segment.locked_at != nil
      assert segment.locked_for_volunteer_id == reserved.id
    end

    test "an empty-body PATCH from the reserved volunteer does not clear the lock", %{
      search: search,
      owner: owner
    } do
      reserved = approved_volunteer(search)

      {:ok, _} =
        Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

      {:ok, segment} =
        Segments.update_segment_status(
          search.id,
          3,
          %{"searched_by_volunteer_id" => reserved.id},
          actor: :volunteer
        )

      assert segment.locked_at != nil
      assert segment.locked_for_volunteer_id == reserved.id
    end
  end

  test "seed_segments/2 clears an existing lock (segment numbering isn't stable across regenerates)",
       %{search: search, owner: owner} do
    volunteer = approved_volunteer(search)

    {:ok, _} =
      Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => volunteer.id})

    {:ok, _count} = Segments.seed_segments(search.id, [%{segment_id: 3}])

    [segment] = Segments.list_by_search(search.id)
    assert segment.locked_at == nil
  end
end
