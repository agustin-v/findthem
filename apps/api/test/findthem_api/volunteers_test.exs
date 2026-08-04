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
end
