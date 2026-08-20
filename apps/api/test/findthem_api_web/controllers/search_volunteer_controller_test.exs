defmodule FindThemApiWeb.SearchVolunteerControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Locations, Searches, Volunteers}

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

  test "GET /api/searches/:id/volunteers lists volunteers with segments_searched", %{
    conn: conn,
    search: search
  } do
    {:ok, _pending} =
      Volunteers.join_volunteer(search.id, %{name: "Pending", phone: "+390698765"})

    conn = get(conn, ~p"/api/searches/#{search.id}/volunteers")

    assert %{"data" => [volunteer]} = json_response(conn, 200)
    assert volunteer["name"] == "Pending"
    assert volunteer["status"] == "pending"
    assert volunteer["segments_searched"] == 0
  end

  test "GET /api/searches/:id/volunteers folds in last-known location for a consenting volunteer",
       %{conn: conn, search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{
        name: "Giulia",
        phone: "+390698765",
        consent_location: true
      })

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

    {:ok, _location} =
      Locations.record_ping(approved, %{
        "lat" => 41.9,
        "lng" => 12.5,
        "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
      })

    conn = get(conn, ~p"/api/searches/#{search.id}/volunteers")

    assert %{"data" => [data]} = json_response(conn, 200)
    assert data["consent_location"] == true
    assert data["last_location"]["lat"] == 41.9
    assert data["last_location"]["lng"] == 12.5
  end

  test "GET /api/searches/:id/volunteers omits last_location for a volunteer who declined consent, even with stored pings",
       %{conn: conn, search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{
        name: "Luca",
        phone: "+390698766",
        consent_location: true
      })

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

    {:ok, _location} =
      Locations.record_ping(approved, %{
        "lat" => 41.9,
        "lng" => 12.5,
        "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
      })

    # Consent withdrawn after the ping was already stored.
    {:ok, _withdrawn} = Volunteers.update_volunteer(approved, %{consent_location: false})

    conn = get(conn, ~p"/api/searches/#{search.id}/volunteers")

    assert %{"data" => [data]} = json_response(conn, 200)
    assert data["consent_location"] == false
    assert data["last_location"] == nil
  end

  test "GET /api/searches/:id/volunteers reports last_location as nil for a consenting volunteer with no pings yet",
       %{conn: conn, search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{
        name: "Giulia",
        phone: "+390698765",
        consent_location: true
      })

    {:ok, _approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

    conn = get(conn, ~p"/api/searches/#{search.id}/volunteers")

    assert %{"data" => [data]} = json_response(conn, 200)
    assert data["consent_location"] == true
    assert data["last_location"] == nil
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

  # Regression: this response used to have no last_location key at all
  # (the shared, plain volunteer_data/1 didn't compute one) — a
  # coordinator's frontend naively merging this response into cached
  # roster state would wipe an already-tracked volunteer's live dot on
  # every unrelated approve/remove.
  test "PATCH /api/searches/:id/volunteers/:vid response carries this volunteer's current last-known location",
       %{conn: conn, search: search} do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{
        name: "Giulia",
        phone: "+390698765",
        consent_location: true
      })

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

    {:ok, _location} =
      Locations.record_ping(approved, %{
        "lat" => 41.9,
        "lng" => 12.5,
        "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
      })

    conn =
      patch(conn, ~p"/api/searches/#{search.id}/volunteers/#{approved.id}", %{
        "status" => "removed"
      })

    assert %{"data" => data} = json_response(conn, 200)
    assert data["status"] == "removed"
    assert data["last_location"]["lat"] == 41.9
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

  describe "GET /api/searches/:id/volunteers/:volunteer_id/locations" do
    test "returns the volunteer's breadcrumb trail oldest first", %{conn: conn, search: search} do
      {:ok, volunteer} =
        Volunteers.join_volunteer(search.id, %{
          name: "Giulia",
          phone: "+390698765",
          consent_location: true
        })

      {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      Locations.record_ping(approved, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

      Locations.record_ping(approved, %{
        "lat" => 41.95,
        "lng" => 12.55,
        "recorded_at" => DateTime.add(now, 60, :second)
      })

      conn = get(conn, ~p"/api/searches/#{search.id}/volunteers/#{approved.id}/locations")

      assert %{"data" => [first, second]} = json_response(conn, 200)
      assert first["lat"] == 41.9
      assert second["lat"] == 41.95
    end

    test "for a search owned by another user returns 404", %{conn: conn} do
      {:ok, other_owner} =
        Accounts.get_or_provision("user_other_searchvol4", %{email: "other4@example.com"})

      {:ok, theirs} =
        Searches.create_search(other_owner.id, %{
          subject_type: "person",
          subject_name: "Theirs",
          contact_phone: "+390612345"
        })

      {:ok, volunteer} =
        Volunteers.join_volunteer(theirs.id, %{
          name: "Giulia",
          phone: "+390698765",
          consent_location: true
        })

      conn = get(conn, ~p"/api/searches/#{theirs.id}/volunteers/#{volunteer.id}/locations")

      assert json_response(conn, 404)
    end

    test "for a volunteer_id belonging to a different search returns 404, not that volunteer's trail",
         %{conn: conn, search: search} do
      {:ok, other_owner} =
        Accounts.get_or_provision("user_other_searchvol5", %{email: "other5@example.com"})

      {:ok, other_search} =
        Searches.create_search(other_owner.id, %{
          subject_type: "person",
          subject_name: "Theirs",
          contact_phone: "+390612345"
        })

      {:ok, other_volunteer} =
        Volunteers.join_volunteer(other_search.id, %{
          name: "Andrea",
          phone: "+390698767",
          consent_location: true
        })

      {:ok, other_approved} = Volunteers.update_volunteer(other_volunteer, %{status: "approved"})

      Locations.record_ping(other_approved, %{
        "lat" => 45.0,
        "lng" => 9.0,
        "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
      })

      conn = get(conn, ~p"/api/searches/#{search.id}/volunteers/#{other_approved.id}/locations")

      assert json_response(conn, 404)
    end

    test "with a malformed volunteer_id returns 404 instead of crashing", %{
      conn: conn,
      search: search
    } do
      conn = get(conn, ~p"/api/searches/#{search.id}/volunteers/not-a-uuid/locations")

      assert json_response(conn, 404)
    end

    test "omits a consent-withdrawn volunteer's trail, even though the rows still exist", %{
      conn: conn,
      search: search
    } do
      {:ok, volunteer} =
        Volunteers.join_volunteer(search.id, %{
          name: "Giulia",
          phone: "+390698765",
          consent_location: true
        })

      {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})

      Locations.record_ping(approved, %{
        "lat" => 41.9,
        "lng" => 12.5,
        "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
      })

      {:ok, withdrawn} = Volunteers.update_volunteer(approved, %{consent_location: false})

      conn = get(conn, ~p"/api/searches/#{search.id}/volunteers/#{withdrawn.id}/locations")

      assert %{"data" => []} = json_response(conn, 200)
    end
  end
end
