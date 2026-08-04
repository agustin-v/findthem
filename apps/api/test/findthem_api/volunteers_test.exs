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
end
