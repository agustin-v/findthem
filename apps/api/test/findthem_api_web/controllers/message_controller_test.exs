defmodule FindThemApiWeb.MessageControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches, Volunteers}

  setup %{conn: conn} do
    {:ok, owner} =
      Accounts.get_or_provision("user_owner_messages_ctrl", %{email: "m@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    {:ok, volunteer} = Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+39061"})

    %{conn: authed_conn(conn, "user_owner_messages_ctrl"), search: search, volunteer: volunteer}
  end

  test "POST /api/searches/:id/messages round-trips a client-supplied uuid and forces sender to coordinator",
       %{conn: conn, search: search, volunteer: volunteer} do
    id = Ecto.UUID.generate()

    conn =
      post(conn, ~p"/api/searches/#{search.id}/messages", %{
        "message" => %{
          "id" => id,
          "volunteer_id" => volunteer.id,
          "sender" => "volunteer",
          "text" => "Check the north fence line"
        }
      })

    assert %{"data" => data} = json_response(conn, 201)
    assert data["id"] == id
    assert data["volunteer_id"] == volunteer.id
    # sender is never trusted from the request body.
    assert data["sender"] == "coordinator"
  end

  test "POST /api/searches/:id/messages without a volunteer_id returns 422", %{
    conn: conn,
    search: search
  } do
    conn =
      post(conn, ~p"/api/searches/#{search.id}/messages", %{
        "message" => %{"id" => Ecto.UUID.generate(), "text" => "Hello"}
      })

    assert json_response(conn, 422)
  end

  test "POST /api/searches/:id/messages with a non-map message value returns 422 instead of crashing",
       %{conn: conn, search: search} do
    conn = post(conn, ~p"/api/searches/#{search.id}/messages", %{"message" => nil})

    assert json_response(conn, 422)
  end

  test "GET /api/searches/:id/messages?volunteer_id= with a malformed value returns an empty list instead of crashing",
       %{conn: conn, search: search} do
    conn = get(conn, ~p"/api/searches/#{search.id}/messages?volunteer_id=not-a-uuid")

    assert %{"data" => []} = json_response(conn, 200)
  end

  test "GET /api/searches/:id/messages lists every thread when volunteer_id is omitted", %{
    conn: conn,
    search: search,
    volunteer: volunteer
  } do
    {:ok, other_volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Andrea", phone: "+39063"})

    post(conn, ~p"/api/searches/#{search.id}/messages", %{
      "message" => %{"id" => Ecto.UUID.generate(), "volunteer_id" => volunteer.id, "text" => "A"}
    })

    post(conn, ~p"/api/searches/#{search.id}/messages", %{
      "message" => %{
        "id" => Ecto.UUID.generate(),
        "volunteer_id" => other_volunteer.id,
        "text" => "B"
      }
    })

    conn = get(conn, ~p"/api/searches/#{search.id}/messages")

    assert %{"data" => data} = json_response(conn, 200)
    assert length(data) == 2
  end

  test "GET /api/searches/:id/messages?volunteer_id= scopes to one thread", %{
    conn: conn,
    search: search,
    volunteer: volunteer
  } do
    {:ok, other_volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Andrea", phone: "+39063"})

    post(conn, ~p"/api/searches/#{search.id}/messages", %{
      "message" => %{
        "id" => Ecto.UUID.generate(),
        "volunteer_id" => volunteer.id,
        "text" => "For Giulia"
      }
    })

    post(conn, ~p"/api/searches/#{search.id}/messages", %{
      "message" => %{
        "id" => Ecto.UUID.generate(),
        "volunteer_id" => other_volunteer.id,
        "text" => "For Andrea"
      }
    })

    conn = get(conn, ~p"/api/searches/#{search.id}/messages?volunteer_id=#{volunteer.id}")

    assert %{"data" => [message]} = json_response(conn, 200)
    assert message["text"] == "For Giulia"
  end

  test "messages for a search owned by another user return 404", %{conn: conn} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_messages_ctrl", %{email: "other@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = get(conn, ~p"/api/searches/#{theirs.id}/messages")

    assert json_response(conn, 404)
  end
end
