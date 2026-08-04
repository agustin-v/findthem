defmodule FindThemApiWeb.SearchVolunteerControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches, Volunteers}

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

    {:ok, owner} =
      Accounts.get_or_provision("user_owner_searchvol", %{email: "owner@example.com"})

    token =
      sign_token(keypair.private, keypair.kid, %{
        "sub" => "user_owner_searchvol",
        "iss" => issuer,
        "azp" => "http://localhost:5173",
        "iat" => now(),
        "nbf" => now(),
        "exp" => now() + 3600
      })

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{
      conn: put_req_header(conn, "authorization", "Bearer #{token}"),
      owner: owner,
      search: search
    }
  end

  test "GET /api/searches/:id/volunteers lists volunteers with zones_searched", %{
    conn: conn,
    search: search
  } do
    {:ok, _pending} =
      Volunteers.join_volunteer(search.id, %{name: "Pending", phone: "+390698765"})

    conn = get(conn, ~p"/api/searches/#{search.id}/volunteers")

    assert %{"data" => [volunteer]} = json_response(conn, 200)
    assert volunteer["name"] == "Pending"
    assert volunteer["status"] == "pending"
    assert volunteer["zones_searched"] == 0
  end

  test "GET /api/searches/:id/volunteers for a search owned by another user returns 404", %{
    conn: conn
  } do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_searchvol", %{email: "other@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = get(conn, ~p"/api/searches/#{theirs.id}/volunteers")

    assert json_response(conn, 404)
  end

  test "PATCH /api/searches/:id/volunteers/:vid approves a pending volunteer", %{
    conn: conn,
    search: search
  } do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+390698765"})

    conn =
      patch(conn, ~p"/api/searches/#{search.id}/volunteers/#{volunteer.id}", %{
        "status" => "approved"
      })

    assert %{"data" => data} = json_response(conn, 200)
    assert data["status"] == "approved"
  end

  test "PATCH /api/searches/:id/volunteers/:vid with an invalid status returns 422", %{
    conn: conn,
    search: search
  } do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+390698765"})

    conn =
      patch(conn, ~p"/api/searches/#{search.id}/volunteers/#{volunteer.id}", %{
        "status" => "pending"
      })

    assert json_response(conn, 422)
  end

  test "PATCH cannot be used to affect a volunteer belonging to a different search", %{
    conn: conn,
    search: search
  } do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_searchvol2", %{email: "other2@example.com"})

    {:ok, other_search} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    {:ok, other_volunteer} =
      Volunteers.join_volunteer(other_search.id, %{name: "Luca", phone: "+390698766"})

    conn =
      patch(conn, ~p"/api/searches/#{search.id}/volunteers/#{other_volunteer.id}", %{
        "status" => "approved"
      })

    assert json_response(conn, 404)

    {:ok, unaffected} = Volunteers.get_volunteer_in_search(other_search.id, other_volunteer.id)
    assert unaffected.status == "pending"
  end

  test "POST /api/searches/:id/join_token/rotate returns a new token and invalidates the old one",
       %{conn: conn, search: search} do
    old_token = search.join_token

    conn = post(conn, ~p"/api/searches/#{search.id}/join_token/rotate")

    assert %{"data" => %{"join_token" => new_token}} = json_response(conn, 200)
    assert new_token != old_token
    assert {:error, :not_found} = Searches.get_by_join_token(old_token)
  end

  test "POST /api/searches/:id/join_token/rotate for a foreign search returns 404", %{
    conn: conn
  } do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_searchvol3", %{email: "other3@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = post(conn, ~p"/api/searches/#{theirs.id}/join_token/rotate")

    assert json_response(conn, 404)
  end
end
