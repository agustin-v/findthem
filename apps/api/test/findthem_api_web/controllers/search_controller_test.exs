defmodule FindThemApiWeb.SearchControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches}

  setup %{conn: conn} do
    bypass = Bypass.open()
    issuer = "http://localhost:#{bypass.port}"
    previous = Application.get_env(:findthem_api, :clerk)

    Application.put_env(:findthem_api, :clerk,
      issuer: issuer,
      authorized_parties: ["http://localhost:5173"]
    )

    on_exit(fn -> Application.put_env(:findthem_api, :clerk, previous) end)

    keypair = rsa_keypair("test-kid-1")
    serve_jwks(bypass, [keypair.public_jwks_entry])

    {:ok, owner} = Accounts.get_or_provision("user_owner_ctrl", %{email: "owner@example.com"})

    token =
      sign_token(keypair.private, keypair.kid, %{
        "sub" => "user_owner_ctrl",
        "iss" => issuer,
        "azp" => "http://localhost:5173",
        "iat" => now(),
        "nbf" => now(),
        "exp" => now() + 3600
      })

    %{conn: put_req_header(conn, "authorization", "Bearer #{token}"), owner: owner}
  end

  test "POST /api/searches creates a search owned by the current user", %{conn: conn} do
    conn =
      post(conn, ~p"/api/searches", %{
        "search" => %{
          "subject_type" => "person",
          "subject_name" => "Marco Rossi",
          "contact_phone" => "+390612345"
        }
      })

    assert %{"data" => data} = json_response(conn, 201)
    assert data["subject_name"] == "Marco Rossi"
    assert data["volunteer_count"] == 0
    assert data["rebalance_suggested"] == false
  end

  test "POST /api/searches with a future lkp_at returns 422", %{conn: conn} do
    future = DateTime.utc_now() |> DateTime.add(3600, :second) |> DateTime.to_iso8601()

    conn =
      post(conn, ~p"/api/searches", %{
        "search" => %{
          "subject_type" => "person",
          "subject_name" => "Marco Rossi",
          "contact_phone" => "+390612345",
          "lkp_at" => future
        }
      })

    assert %{"errors" => %{"lkp_at" => ["cannot be in the future"]}} = json_response(conn, 422)
  end

  test "GET /api/searches lists only the current user's searches", %{conn: conn, owner: owner} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_ctrl", %{email: "other@example.com"})

    {:ok, mine} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Mine",
        contact_phone: "+390612345"
      })

    {:ok, _theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = get(conn, ~p"/api/searches")

    assert %{"data" => data} = json_response(conn, 200)
    assert [%{"id" => id}] = data
    assert id == mine.id
  end

  test "GET /api/searches/:id for a search owned by another user returns 404", %{conn: conn} do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_ctrl2", %{email: "other2@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = get(conn, ~p"/api/searches/#{theirs.id}")

    assert json_response(conn, 404)
  end
end
