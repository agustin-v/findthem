defmodule FindThemApi.LocationsTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Locations, Volunteers}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_loc", %{email: "loc@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{
        name: "Giulia",
        phone: "+390698765",
        consent_location: true
      })

    {:ok, declined} =
      Volunteers.join_volunteer(search.id, %{
        name: "Luca",
        phone: "+390698766",
        consent_location: false
      })

    %{search: search, volunteer: volunteer, declined: declined}
  end

  describe "record_ping/2" do
    test "persists a ping and broadcasts {:location_updated, location} on search:#{"{search_id}"}",
         %{search: search, volunteer: volunteer} do
      Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

      recorded_at = DateTime.utc_now() |> DateTime.truncate(:second)

      {:ok, location} =
        Locations.record_ping(volunteer, %{
          "lat" => 41.9,
          "lng" => 12.5,
          "recorded_at" => recorded_at
        })

      assert location.search_id == search.id
      assert location.volunteer_id == volunteer.id
      assert location.lat == 41.9
      assert location.lng == 12.5
      assert_receive {:location_updated, %{id: id}}
      assert id == location.id
    end

    test "rejects a ping from a volunteer who declined location consent, server-side", %{
      declined: declined
    } do
      assert {:error, :location_consent_declined} =
               Locations.record_ping(declined, %{
                 "lat" => 41.9,
                 "lng" => 12.5,
                 "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
               })

      assert Locations.list_trail(declined) == []
    end

    test "rejects an out-of-range lat/lng instead of crashing", %{volunteer: volunteer} do
      {:error, changeset} =
        Locations.record_ping(volunteer, %{
          "lat" => 999.0,
          "lng" => -999.0,
          "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
        })

      assert "must be less than or equal to 90" in errors_on(changeset).lat
      assert "must be greater than or equal to -180" in errors_on(changeset).lng
    end

    test "rejects a missing recorded_at", %{volunteer: volunteer} do
      {:error, changeset} = Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5})
      assert "can't be blank" in errors_on(changeset).recorded_at
    end

    # Regression: last_known_by_search/1 orders by recorded_at, which is
    # entirely client-supplied. A far-future timestamp would otherwise win
    # that ordering forever and freeze the coordinator's live dot at a
    # stale/forged position no later genuine ping could ever displace.
    test "rejects a recorded_at far in the future instead of letting it poison ordering forever",
         %{volunteer: volunteer} do
      far_future = DateTime.utc_now() |> DateTime.add(365, :day)

      {:error, changeset} =
        Locations.record_ping(volunteer, %{
          "lat" => 41.9,
          "lng" => 12.5,
          "recorded_at" => far_future
        })

      assert "cannot be in the future" in errors_on(changeset).recorded_at
    end

    test "accepts a recorded_at within normal clock-skew tolerance of now", %{
      volunteer: volunteer
    } do
      slightly_ahead = DateTime.utc_now() |> DateTime.add(60, :second)

      assert {:ok, _location} =
               Locations.record_ping(volunteer, %{
                 "lat" => 41.9,
                 "lng" => 12.5,
                 "recorded_at" => slightly_ahead
               })
    end
  end

  describe "list_trail/1" do
    test "returns a volunteer's pings oldest first", %{volunteer: volunteer} do
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      {:ok, _first} =
        Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

      {:ok, _second} =
        Locations.record_ping(volunteer, %{
          "lat" => 41.91,
          "lng" => 12.51,
          "recorded_at" => DateTime.add(now, 60, :second)
        })

      trail = Locations.list_trail(volunteer)

      assert length(trail) == 2
      assert [%{lat: 41.9}, %{lat: 41.91}] = trail
    end

    test "does not leak another volunteer's pings, same search", %{
      search: search,
      volunteer: volunteer
    } do
      {:ok, other_volunteer} =
        Volunteers.join_volunteer(search.id, %{
          name: "Andrea",
          phone: "+390698768",
          consent_location: true
        })

      now = DateTime.utc_now() |> DateTime.truncate(:second)
      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})
      Locations.record_ping(other_volunteer, %{"lat" => 45.0, "lng" => 9.0, "recorded_at" => now})

      assert Locations.list_trail(volunteer) |> length() == 1
      assert Locations.list_trail(other_volunteer) |> length() == 1
    end

    test "does not leak another search's pings", %{volunteer: volunteer} do
      {:ok, owner2} = Accounts.get_or_provision("user_owner_loc2", %{email: "loc2@example.com"})

      {:ok, other_search} =
        Searches.create_search(owner2.id, %{
          subject_type: "person",
          subject_name: "Someone Else",
          contact_phone: "+390612345"
        })

      {:ok, other_volunteer} =
        Volunteers.join_volunteer(other_search.id, %{
          name: "Andrea",
          phone: "+390698767",
          consent_location: true
        })

      now = DateTime.utc_now() |> DateTime.truncate(:second)
      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})
      Locations.record_ping(other_volunteer, %{"lat" => 45.0, "lng" => 9.0, "recorded_at" => now})

      assert Locations.list_trail(volunteer) |> length() == 1
      assert Locations.list_trail(other_volunteer) |> length() == 1
    end

    # Regression: SearchVolunteerJSON's roster view hides last_location the
    # moment consent_location flips to false, even for older pings — the
    # trail endpoint used to implement a DIFFERENT, looser policy (return
    # everything unconditionally), making the roster's masking cosmetic
    # (one extra request read exactly the withheld data). Both now agree.
    test "returns [] for a volunteer whose consent is currently false, even with older pings",
         %{search: search, volunteer: volunteer} do
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

      {:ok, withdrawn} = Volunteers.update_volunteer(volunteer, %{consent_location: false})

      assert Locations.list_trail(withdrawn) == []
      # The row itself is untouched — list_trail/1's consent gate (and
      # SearchVolunteerJSON's matching one) is a view-layer policy, not a
      # data-deletion one. Raw context functions like this one still see it.
      assert map_size(Locations.last_known_by_search(search.id)) == 1
    end
  end

  describe "last_known_by_search/1" do
    test "returns only the most recent ping per volunteer", %{
      search: search,
      volunteer: volunteer
    } do
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

      Locations.record_ping(volunteer, %{
        "lat" => 41.95,
        "lng" => 12.55,
        "recorded_at" => DateTime.add(now, 120, :second)
      })

      last_known = Locations.last_known_by_search(search.id)

      assert Map.keys(last_known) == [volunteer.id]
      assert last_known[volunteer.id].lat == 41.95
    end

    test "returns an empty map when nobody has pinged yet", %{search: search} do
      assert Locations.last_known_by_search(search.id) == %{}
    end
  end

  describe "last_known_for_volunteer/2" do
    test "returns the single most recent ping for that volunteer", %{
      search: search,
      volunteer: volunteer
    } do
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

      Locations.record_ping(volunteer, %{
        "lat" => 41.95,
        "lng" => 12.55,
        "recorded_at" => DateTime.add(now, 120, :second)
      })

      assert %{lat: 41.95} = Locations.last_known_for_volunteer(search.id, volunteer.id)
    end

    test "returns nil when this volunteer has no pings yet", %{
      search: search,
      volunteer: volunteer
    } do
      assert Locations.last_known_for_volunteer(search.id, volunteer.id) == nil
    end
  end

  describe "purge_expired/1" do
    test "deletes pings for a search resolved past the retention window", %{
      search: search,
      volunteer: volunteer
    } do
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

      {:ok, _resolved} =
        search
        |> Ecto.Changeset.change(
          status: "resolved",
          closed_at: DateTime.add(now, -31 * 24 * 60 * 60, :second)
        )
        |> FindThemApi.Repo.update()

      {count, nil} = Locations.purge_expired(30)

      assert count == 1
      assert Locations.list_trail(volunteer) == []
    end

    test "leaves pings for a search resolved within the retention window", %{
      search: search,
      volunteer: volunteer
    } do
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

      {:ok, _resolved} =
        search
        |> Ecto.Changeset.change(status: "resolved", closed_at: DateTime.add(now, -1, :day))
        |> FindThemApi.Repo.update()

      {count, nil} = Locations.purge_expired(30)

      assert count == 0
      assert length(Locations.list_trail(volunteer)) == 1
    end

    test "leaves recent pings for a search that was never resolved (closed_at nil)", %{
      volunteer: volunteer
    } do
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

      {count, nil} = Locations.purge_expired(30)

      assert count == 0
      assert length(Locations.list_trail(volunteer)) == 1
    end

    # Regression: nothing in this codebase ever sets status/closed_at (no
    # "resolve a search" endpoint exists) — without this fallback,
    # retention would be a permanent no-op in production, keeping every
    # volunteer's location history indefinitely regardless of what happens
    # to the search.
    test "deletes pings older than the retention window even for a search that's still active", %{
      search: search,
      volunteer: volunteer
    } do
      old_ping_time = DateTime.utc_now() |> DateTime.add(-45, :day)

      {:ok, location} =
        %FindThemApi.Locations.VolunteerLocation{}
        |> FindThemApi.Locations.VolunteerLocation.changeset(%{
          "search_id" => search.id,
          "volunteer_id" => volunteer.id,
          "lat" => 41.9,
          "lng" => 12.5,
          "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
        })
        |> Ecto.Changeset.force_change(:inserted_at, old_ping_time)
        |> FindThemApi.Repo.insert()

      assert search.status == "active"

      {count, nil} = Locations.purge_expired(30)

      assert count == 1
      refute FindThemApi.Repo.get(FindThemApi.Locations.VolunteerLocation, location.id)
    end

    test "does not purge a recent ping on an active search via the fallback", %{
      volunteer: volunteer
    } do
      Locations.record_ping(volunteer, %{
        "lat" => 41.9,
        "lng" => 12.5,
        "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
      })

      {count, nil} = Locations.purge_expired(30)

      assert count == 0
      assert length(Locations.list_trail(volunteer)) == 1
    end

    test "clamps a non-positive retention_days instead of purging everything immediately", %{
      volunteer: volunteer
    } do
      Locations.record_ping(volunteer, %{
        "lat" => 41.9,
        "lng" => 12.5,
        "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
      })

      {count, nil} = Locations.purge_expired(-5)

      assert count == 0
      assert length(Locations.list_trail(volunteer)) == 1
    end
  end
end
