defmodule FindThemApi.SegmentsTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Segments}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_segments", %{email: "z@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 3}])

    %{search: search}
  end

  test "update_segment_status/3 returns :not_found for a segment that was never seeded", %{
    search: search
  } do
    assert {:error, :not_found} = Segments.update_segment_status(search.id, 99, %{status: "assigned"})
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
end
