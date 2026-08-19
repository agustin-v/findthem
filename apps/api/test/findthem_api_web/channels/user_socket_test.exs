defmodule FindThemApiWeb.UserSocketTest do
  use FindThemApiWeb.ChannelCase, async: false

  alias FindThemApi.{Accounts, Searches, Volunteers}
  alias FindThemApi.ClerkFixtures
  alias FindThemApiWeb.UserSocket

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_socket_owner", %{email: "owner@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345",
        lkp_address: "Via del Corso, Roma"
      })

    %{owner: owner, search: search}
  end

  defp approved_volunteer(search) do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
    {approved, Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)}
  end

  test "connects a coordinator with a valid Clerk token", %{owner: owner} do
    token = ClerkFixtures.authed_token(owner.clerk_user_id)

    assert {:ok, socket} = connect(UserSocket, %{"token" => token})
    assert {:coordinator, connected_user} = socket.assigns.identity
    assert connected_user.id == owner.id
  end

  test "connects an approved volunteer with a valid volunteer token", %{search: search} do
    {volunteer, token} = approved_volunteer(search)

    assert {:ok, socket} = connect(UserSocket, %{"token" => token})
    assert {:volunteer, connected_volunteer} = socket.assigns.identity
    assert connected_volunteer.id == volunteer.id
  end

  test "rejects a pending (not yet approved) volunteer's token", %{search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Pending Person", phone: "+390698766"})

    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, volunteer.id)

    assert :error = connect(UserSocket, %{"token" => token})
  end

  test "rejects a removed volunteer's still-unexpired token", %{search: search} do
    {volunteer, token} = approved_volunteer(search)
    {:ok, _removed} = Volunteers.update_volunteer(volunteer, %{status: "removed"})

    assert :error = connect(UserSocket, %{"token" => token})
  end

  test "rejects garbage tokens" do
    assert :error = connect(UserSocket, %{"token" => "not-a-real-token"})
  end

  test "rejects a connect with no token param" do
    assert :error = connect(UserSocket, %{})
  end
end
