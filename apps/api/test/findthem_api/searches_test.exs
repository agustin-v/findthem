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
end
