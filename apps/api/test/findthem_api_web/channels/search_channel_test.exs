defmodule FindThemApiWeb.SearchChannelTest do
  use FindThemApiWeb.ChannelCase, async: false

  alias FindThemApi.{Accounts, Messages, Remarks, Searches, Volunteers}
  alias FindThemApi.ClerkFixtures
  alias FindThemApiWeb.UserSocket

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_channel_owner", %{email: "owner@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345",
        lkp_address: "Via del Corso, Roma"
      })

    {:ok, other_search} =
      Searches.create_search(owner.id, %{
        subject_type: "object",
        subject_name: "Camera drone",
        contact_phone: "+390612346",
        lkp_address: "Monte Mario, Roma"
      })

    %{owner: owner, search: search, other_search: other_search}
  end

  defp approved_volunteer(search) do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
    {approved, Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)}
  end

  defp connect_coordinator(owner) do
    token = ClerkFixtures.authed_token(owner.clerk_user_id)
    {:ok, socket} = connect(UserSocket, %{"token" => token})
    socket
  end

  test "a coordinator can join their own search's channel", %{owner: owner, search: search} do
    socket = connect_coordinator(owner)

    assert {:ok, _reply, _socket} = subscribe_and_join(socket, "search:#{search.id}", %{})
  end

  test "a coordinator cannot join a search they don't own", %{owner: owner} do
    {:ok, other_owner} = Accounts.get_or_provision("someone_else", %{email: "else@example.com"})

    {:ok, not_mine} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Not mine",
        contact_phone: "+390600000",
        lkp_address: "Elsewhere"
      })

    socket = connect_coordinator(owner)

    assert {:error, %{reason: "unauthorized"}} =
             subscribe_and_join(socket, "search:#{not_mine.id}", %{})
  end

  test "an approved volunteer can join their own search's channel", %{search: search} do
    {_volunteer, token} = approved_volunteer(search)
    {:ok, socket} = connect(UserSocket, %{"token" => token})

    assert {:ok, _reply, _socket} = subscribe_and_join(socket, "search:#{search.id}", %{})
  end

  test "a volunteer cannot join a different search's channel", %{
    search: search,
    other_search: other_search
  } do
    {_volunteer, token} = approved_volunteer(search)
    {:ok, socket} = connect(UserSocket, %{"token" => token})

    assert {:error, %{reason: "unauthorized"}} =
             subscribe_and_join(socket, "search:#{other_search.id}", %{})
  end

  test "relays a volunteer_updated broadcast to a joined coordinator, shaped like the REST response",
       %{
         owner: owner,
         search: search
       } do
    # approved_volunteer/1 itself broadcasts :volunteer_updated (join ->
    # approve) — join the channel only after that settles, so the only
    # push this test observes is the "removed" transition below.
    {volunteer, _token} = approved_volunteer(search)

    socket = connect_coordinator(owner)
    {:ok, _reply, socket} = subscribe_and_join(socket, "search:#{search.id}", %{})

    {:ok, updated} = Volunteers.update_volunteer(volunteer, %{status: "removed"})

    assert_push "volunteer_updated", %{data: data}
    assert data.id == updated.id
    assert data.status == "removed"
    # Shaped through SearchVolunteerJSON, not a raw struct dump.
    refute Map.has_key?(data, :__struct__)
    _ = socket
  end

  test "relays a remark_created broadcast to a joined volunteer", %{search: search} do
    {volunteer, token} = approved_volunteer(search)
    {:ok, socket} = connect(UserSocket, %{"token" => token})
    {:ok, _reply, socket} = subscribe_and_join(socket, "search:#{search.id}", %{})

    {:ok, remark} =
      Remarks.create_remark(search.id, %{
        "id" => Ecto.UUID.generate(),
        "volunteer_id" => volunteer.id,
        "kind" => "hazard",
        "text" => "Bridge is down",
        "lat" => 41.9,
        "lng" => 12.5,
        "reported_at" => DateTime.utc_now()
      })

    assert_push "remark_created", %{data: data}
    assert data.id == remark.id
    assert data.text == "Bridge is down"
    _ = socket
  end

  test "relays a message_created broadcast to a joined coordinator", %{
    owner: owner,
    search: search
  } do
    {volunteer, _token} = approved_volunteer(search)

    socket = connect_coordinator(owner)
    {:ok, _reply, socket} = subscribe_and_join(socket, "search:#{search.id}", %{})

    {:ok, message} =
      Messages.create_message(search.id, %{
        "id" => Ecto.UUID.generate(),
        "volunteer_id" => volunteer.id,
        "sender" => "volunteer",
        "text" => "On my way"
      })

    assert_push "message_created", %{data: data}
    assert data.id == message.id
    assert data.text == "On my way"
    _ = socket
  end

  test "does NOT relay another volunteer's private message thread", %{search: search} do
    {_recipient, recipient_token} = approved_volunteer(search)
    {:ok, socket} = connect(UserSocket, %{"token" => recipient_token})
    {:ok, _reply, socket} = subscribe_and_join(socket, "search:#{search.id}", %{})

    {:ok, other_volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Andrea", phone: "+390698766"})

    {:ok, _approved} = Volunteers.update_volunteer(other_volunteer, %{status: "approved"})

    Messages.create_message(search.id, %{
      "id" => Ecto.UUID.generate(),
      "volunteer_id" => other_volunteer.id,
      "sender" => "coordinator",
      "text" => "PRIVATE: for Andrea only"
    })

    refute_push "message_created", %{}
    _ = socket
  end

  test "does NOT relay join_token or coordinator-only fields to a volunteer", %{search: search} do
    {_volunteer, token} = approved_volunteer(search)
    {:ok, socket} = connect(UserSocket, %{"token" => token})
    {:ok, _reply, socket} = subscribe_and_join(socket, "search:#{search.id}", %{})

    Searches.update_search(search, %{subject_name: "Renamed"})

    refute_push "search_updated", %{}
    _ = socket
  end

  test "does NOT relay another volunteer's name/phone to a volunteer", %{search: search} do
    {_recipient, recipient_token} = approved_volunteer(search)
    {:ok, socket} = connect(UserSocket, %{"token" => recipient_token})
    {:ok, _reply, socket} = subscribe_and_join(socket, "search:#{search.id}", %{})

    Volunteers.join_volunteer(search.id, %{name: "Andrea", phone: "+390698766"})

    refute_push "volunteer_joined", %{}
    _ = socket
  end

  test "relays a segment_assignment_removed broadcast (a plain map, not a struct)", %{
    owner: owner,
    search: search
  } do
    socket = connect_coordinator(owner)
    {:ok, _reply, socket} = subscribe_and_join(socket, "search:#{search.id}", %{})

    Phoenix.PubSub.broadcast(
      FindThemApi.PubSub,
      "search:#{search.id}",
      {:segment_assignment_removed, %{search_id: search.id, segment_id: 3, volunteer_id: "v1"}}
    )

    assert_push "segment_assignment_removed", %{data: %{segment_id: 3}}
    _ = socket
  end

  test "a coordinator removing a volunteer broadcasts a disconnect on that volunteer's socket id",
       %{search: search} do
    {volunteer, token} = approved_volunteer(search)
    {:ok, socket} = connect(UserSocket, %{"token" => token})
    {:ok, _reply, socket} = subscribe_and_join(socket, "search:#{search.id}", %{})

    # Phoenix's real transport (not exercised by ChannelTest, which drives
    # the channel process directly) is what actually terminates a socket
    # subscribed to its own `id/1` topic on receiving this — that part is
    # Phoenix library behavior, not this app's code. What this app is
    # responsible for is firing the broadcast on the right topic at the
    # right time, which is what this asserts.
    {:ok, _removed} = Volunteers.update_volunteer(volunteer, %{status: "removed"})

    assert_receive %Phoenix.Socket.Broadcast{
      topic: "volunteer_socket:" <> _,
      event: "disconnect"
    }

    _ = socket
  end
end
