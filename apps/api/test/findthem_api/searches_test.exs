defmodule FindThemApi.SearchesTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.Searches
  alias FindThemApi.Accounts

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner1", %{email: "o@example.com", name: "O"})
    %{owner: owner}
  end

  test "create_search/2 persists a search owned by the given user with a generated join_token", %{
    owner: owner
  } do
    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    assert search.owner_id == owner.id
    assert search.subject_name == "Marco Rossi"
    assert is_binary(search.join_token)
    assert search.join_token != ""
  end

  test "update_search/2 broadcasts {:search_updated, search} on search:#{"{id}"}", %{
    owner: owner
  } do
    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    {:ok, updated} = Searches.update_search(search, %{status: "resolved"})

    assert_receive {:search_updated, %{id: id, status: "resolved"}}
    assert id == search.id
    assert updated.status == "resolved"
  end

  test "create_search/2 rejects a future lkp_at", %{owner: owner} do
    future = DateTime.utc_now() |> DateTime.add(3600, :second) |> DateTime.truncate(:second)

    {:error, changeset} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345",
        lkp_at: future
      })

    assert "cannot be in the future" in errors_on(changeset).lkp_at
  end

  test "get_search_for_owner/2 returns the search when owned", %{owner: owner} do
    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    assert {:ok, found} = Searches.get_search_for_owner(owner.id, search.id)
    assert found.id == search.id
  end

  test "get_search_for_owner/2 returns :not_found for a foreign owner", %{owner: owner} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_owner_other", %{email: "other@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    assert {:error, :not_found} = Searches.get_search_for_owner(other_owner.id, search.id)
  end

  test "get_search_for_owner/2 returns :not_found for a garbage id", %{owner: owner} do
    assert {:error, :not_found} = Searches.get_search_for_owner(owner.id, "not-a-uuid")
  end

  test "aggregates_for/1 reports rebalance_suggested: false with zero volunteers", %{
    owner: owner
  } do
    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    aggregates = Searches.aggregates_for(search)

    assert aggregates.volunteer_count == 0
    assert aggregates.pending_count == 0
    assert aggregates.approved_counts == %{}
    assert aggregates.rebalance_suggested == false
  end
end
