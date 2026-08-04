defmodule FindThemApi.RemarksTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Remarks}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner3", %{email: "o3@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{search: search}
  end

  test "create_remark/2 broadcasts {:remark_created, remark} on search:#{"{search_id}"}", %{
    search: search
  } do
    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    id = Ecto.UUID.generate()

    {:ok, remark} =
      Remarks.create_remark(search.id, %{
        id: id,
        kind: "sighting",
        text: "Saw someone matching description",
        reported_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })

    assert remark.id == id
    assert remark.search_id == search.id
    assert_receive {:remark_created, %{id: ^id}}
  end
end
