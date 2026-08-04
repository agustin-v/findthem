defmodule FindThemApiWeb.JoinControllerTest do
  use FindThemApiWeb.ConnCase, async: true

  alias FindThemApi.{Accounts, Searches}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_join", %{email: "join@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345",
        lkp_address: "Via del Corso, Roma"
      })

    %{search: search}
  end

  defp with_ip(conn, ip), do: %{conn | remote_ip: ip}

  test "GET /join/:code/preview returns a minimal summary for a valid code", %{
    conn: conn,
    search: search
  } do
    conn = conn |> with_ip({203, 0, 113, 1}) |> get(~p"/join/#{search.join_token}/preview")

    assert %{"data" => data} = json_response(conn, 200)
    assert data["subject_type"] == "person"
    assert data["subject_name"] == "Marco Rossi"
  end

  test "GET /join/:code/preview returns 404 for an unknown code", %{conn: conn} do
    conn = conn |> with_ip({203, 0, 113, 2}) |> get(~p"/join/does-not-exist/preview")

    assert json_response(conn, 404)
  end

  test "GET /join/:code/preview returns the same 404 shape for a non-active search's code", %{
    conn: conn,
    search: search
  } do
    Searches.update_search(search, %{status: "resolved"})

    conn = conn |> with_ip({203, 0, 113, 3}) |> get(~p"/join/#{search.join_token}/preview")

    assert json_response(conn, 404) ==
             %{"errors" => %{"detail" => "Not Found"}}
  end

  test "POST /join creates a pending volunteer and returns a token", %{
    conn: conn,
    search: search
  } do
    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    conn =
      conn
      |> with_ip({203, 0, 113, 4})
      |> post(~p"/join", %{
        "code" => search.join_token,
        "name" => "Giulia Bianchi",
        "phone" => "+390698765",
        "resource_type" => "people",
        "consent_name" => true,
        "consent_location" => true,
        "consent_phone" => false
      })

    assert %{"data" => data, "token" => token} = json_response(conn, 201)
    assert data["status"] == "pending"
    assert data["name"] == "Giulia Bianchi"
    assert is_binary(token)

    assert_receive {:volunteer_joined, %{name: "Giulia Bianchi"}}
  end

  test "POST /join with no code param returns 422 instead of crashing", %{conn: conn} do
    conn =
      conn
      |> with_ip({203, 0, 113, 7})
      |> post(~p"/join", %{"name" => "Giulia Bianchi", "phone" => "+390698765"})

    assert json_response(conn, 422)
  end

  test "POST /join with an unknown code returns the same 404 shape as preview", %{conn: conn} do
    conn =
      conn
      |> with_ip({203, 0, 113, 5})
      |> post(~p"/join", %{"code" => "does-not-exist", "name" => "X", "phone" => "+3901"})

    assert json_response(conn, 404) == %{"errors" => %{"detail" => "Not Found"}}
  end

  test "the 11th request in a minute from the same IP is rate limited with 429", %{
    conn: conn,
    search: search
  } do
    ip = {203, 0, 113, 6}

    responses =
      for _ <- 1..11 do
        conn
        |> with_ip(ip)
        |> get(~p"/join/#{search.join_token}/preview")
        |> then(& &1.status)
      end

    assert Enum.count(responses, &(&1 == 200)) == 10
    assert List.last(responses) == 429
  end
end
