defmodule FindThemApi.RemarksTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Remarks, Volunteers}

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

  test "create_remark/2 accepts a volunteer_id that belongs to the same search", %{
    search: search
  } do
    {:ok, volunteer} = Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+39061"})

    {:ok, remark} =
      Remarks.create_remark(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: volunteer.id,
        kind: "sighting",
        text: "Saw someone",
        reported_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })

    assert remark.volunteer_id == volunteer.id
  end

  test "create_remark/2 rejects a volunteer_id that belongs to a different search", %{
    search: search
  } do
    {:ok, owner2} = Accounts.get_or_provision("user_owner3b", %{email: "o3b@example.com"})

    {:ok, other_search} =
      Searches.create_search(owner2.id, %{
        subject_type: "person",
        subject_name: "Someone Else",
        contact_phone: "+390612345"
      })

    {:ok, other_volunteer} =
      Volunteers.join_volunteer(other_search.id, %{name: "Luca", phone: "+39062"})

    {:error, changeset} =
      Remarks.create_remark(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: other_volunteer.id,
        kind: "sighting",
        text: "Saw someone",
        reported_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })

    assert "must belong to the same search" in errors_on(changeset).volunteer_id
  end

  test "create_remark/2 replaying the same client-supplied id is a safe no-op, not a crash", %{
    search: search
  } do
    id = Ecto.UUID.generate()

    attrs = %{
      id: id,
      kind: "sighting",
      text: "Saw someone",
      reported_at: DateTime.utc_now() |> DateTime.truncate(:second)
    }

    {:ok, _first} = Remarks.create_remark(search.id, attrs)
    {:ok, _replay} = Remarks.create_remark(search.id, attrs)

    assert length(Remarks.list_by_search(search.id)) == 1
  end
end
