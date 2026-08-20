defmodule FindThemApiWeb.VolunteerControllerTest do
  use FindThemApiWeb.ConnCase, async: true

  import Mox

  alias FindThemApi.{Accounts, Repo, Searches, Volunteers, Segments}
  alias FindThemApi.Photos.StorageMock

  setup :verify_on_exit!

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_vol", %{email: "vol@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345",
        lkp_address: "Via del Corso, Roma"
      })

    %{search: search, owner: owner}
  end

  defp approved_volunteer(search) do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)
    {approved, token}
  end

  defp another_approved_volunteer(search) do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Luca Verdi", phone: "+390698767"})

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)
    {:ok, approved, token}
  end

  defp auth(conn, token), do: put_req_header(conn, "authorization", "Bearer #{token}")

  test "GET /volunteer/session works for a pending volunteer and reports pending", %{
    conn: conn,
    search: search
  } do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Luca", phone: "+390698766"})

    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, volunteer.id)

    conn = conn |> auth(token) |> get(~p"/volunteer/session")

    assert %{"status" => "pending"} = json_response(conn, 200)
  end

  test "GET /volunteer/session with a garbage token returns 401", %{conn: conn} do
    conn = conn |> auth("garbage") |> get(~p"/volunteer/session")

    assert json_response(conn, 401)
  end

  test "GET /volunteer/session with no Authorization header returns 401", %{conn: conn} do
    conn = get(conn, ~p"/volunteer/session")

    assert json_response(conn, 401)
  end

  test "a pending volunteer's token cannot access GET /volunteer/search", %{
    conn: conn,
    search: search
  } do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Luca", phone: "+390698766"})

    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, volunteer.id)

    conn = conn |> auth(token) |> get(~p"/volunteer/search")

    assert json_response(conn, 401)
  end

  test "an approved volunteer's token can access GET /volunteer/search, no join_token leaked",
       %{conn: conn, search: search} do
    {_volunteer, token} = approved_volunteer(search)

    conn = conn |> auth(token) |> get(~p"/volunteer/search")

    assert %{"data" => data} = json_response(conn, 200)
    assert data["search"]["subject_name"] == "Marco Rossi"
    assert data["search"]["contact_phone"] == "+390612345"
    refute Map.has_key?(data["search"], "join_token")
    assert data["search"]["photo_urls"] == []
    assert data["segments"] == []
    assert data["generation"] == nil
    assert data["my_segment_ids"] == []
    assert data["remarks"] == []
    assert data["consent_location"] == false
  end

  test "GET /volunteer/search reports this volunteer's own consent_location, true case", %{
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
    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)

    conn = conn |> auth(token) |> get(~p"/volunteer/search")

    assert %{"data" => data} = json_response(conn, 200)
    assert data["consent_location"] == true
  end

  test "GET /volunteer/search includes every remark on the search, not just this volunteer's own",
       %{conn: conn, search: search} do
    {volunteer, token} = approved_volunteer(search)
    {:ok, other_volunteer, _other_token} = another_approved_volunteer(search)

    {:ok, _mine} =
      FindThemApi.Remarks.create_remark(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: volunteer.id,
        kind: "sighting",
        lat: 41.9,
        lng: 12.5,
        reported_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })

    {:ok, _theirs} =
      FindThemApi.Remarks.create_remark(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: other_volunteer.id,
        kind: "hazard",
        text: "Bridge is down",
        reported_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })

    conn = conn |> auth(token) |> get(~p"/volunteer/search")

    assert %{"data" => %{"remarks" => remarks}} = json_response(conn, 200)
    assert length(remarks) == 2
    kinds = Enum.map(remarks, & &1["kind"]) |> Enum.sort()
    assert kinds == ["hazard", "sighting"]
  end

  test "GET /volunteer/search includes signed photo URLs — a volunteer needs to know who they're looking for",
       %{conn: conn, search: search} do
    {:ok, search} =
      search
      |> Ecto.Changeset.change(photo_urls: ["searches/#{search.id}/a.jpg"])
      |> Repo.update()

    expect(StorageMock, :presigned_url, fn key ->
      {:ok, "https://signed.example.com/#{key}"}
    end)

    {_volunteer, token} = approved_volunteer(search)

    conn = conn |> auth(token) |> get(~p"/volunteer/search")

    assert %{"data" => data} = json_response(conn, 200)
    assert [url] = data["search"]["photo_urls"]
    assert url == "https://signed.example.com/searches/#{search.id}/a.jpg"
  end

  test "a second search's volunteer cannot see the first search's photos", %{
    conn: conn,
    search: search
  } do
    {:ok, owner2} = Accounts.get_or_provision("user_owner_vol3", %{email: "vol3@example.com"})

    {:ok, other_search} =
      Searches.create_search(owner2.id, %{
        subject_type: "person",
        subject_name: "Other",
        contact_phone: "+390612345"
      })

    {:ok, _search} =
      search
      |> Ecto.Changeset.change(photo_urls: ["searches/#{search.id}/a.jpg"])
      |> Repo.update()

    {_other_volunteer, other_token} = approved_volunteer(other_search)

    conn = conn |> auth(other_token) |> get(~p"/volunteer/search")

    assert %{"data" => data} = json_response(conn, 200)
    assert data["search"]["id"] == other_search.id
    assert data["search"]["photo_urls"] == []
  end

  test "a second search's volunteer cannot see the first search's remarks", %{
    conn: conn,
    search: search
  } do
    {:ok, owner2} = Accounts.get_or_provision("user_owner_vol4", %{email: "vol4@example.com"})

    {:ok, other_search} =
      Searches.create_search(owner2.id, %{
        subject_type: "person",
        subject_name: "Other",
        contact_phone: "+390612345"
      })

    {:ok, _remark} =
      FindThemApi.Remarks.create_remark(search.id, %{
        id: Ecto.UUID.generate(),
        kind: "hazard",
        text: "Only for the first search",
        reported_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })

    {_other_volunteer, other_token} = approved_volunteer(other_search)

    conn = conn |> auth(other_token) |> get(~p"/volunteer/search")

    assert %{"data" => data} = json_response(conn, 200)
    assert data["search"]["id"] == other_search.id
    assert data["remarks"] == []
  end

  test "GET /volunteer/search reports my_segment_ids scoped to the requesting volunteer only", %{
    conn: conn,
    search: search
  } do
    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 0}, %{segment_id: 1}])
    {volunteer, token} = approved_volunteer(search)
    {:ok, other, other_token} = another_approved_volunteer(search)

    {:ok, _} = FindThemApi.SegmentAssignments.assign(search.id, 0, volunteer.id)
    {:ok, _} = FindThemApi.SegmentAssignments.assign(search.id, 1, other.id)

    conn1 = conn |> auth(token) |> get(~p"/volunteer/search")
    assert %{"data" => %{"my_segment_ids" => [0]}} = json_response(conn1, 200)

    conn2 = conn |> auth(other_token) |> get(~p"/volunteer/search")
    assert %{"data" => %{"my_segment_ids" => [1]}} = json_response(conn2, 200)
  end

  test "removal invalidates the token immediately, without waiting for it to expire", %{
    conn: conn,
    search: search
  } do
    {volunteer, token} = approved_volunteer(search)

    conn1 = conn |> auth(token) |> get(~p"/volunteer/search")
    assert json_response(conn1, 200)

    {:ok, _removed} = Volunteers.update_volunteer(volunteer, %{status: "removed"})

    conn2 = conn |> auth(token) |> get(~p"/volunteer/search")
    assert json_response(conn2, 401)
  end

  test "PATCH /volunteer/segments/:segment_id records the acting volunteer as searched_by", %{
    conn: conn,
    search: search
  } do
    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 3}])
    {volunteer, token} = approved_volunteer(search)

    conn =
      conn
      |> auth(token)
      |> patch(~p"/volunteer/segments/3", %{"status" => "searched"})

    assert %{"data" => data} = json_response(conn, 200)
    assert data["status"] == "searched"
    # The volunteer-facing PATCH response uses VolunteerSearchJSON's reduced
    # segment shape (same as GET /volunteer/search), which never included
    # searched_by_volunteer_id — verify the underlying row directly instead.
    refute Map.has_key?(data, "searched_by_volunteer_id")
    [segment] = Segments.list_by_search(search.id)
    assert segment.searched_by_volunteer_id == volunteer.id
  end

  test "PATCH /volunteer/segments/:segment_id rejects a volunteer other than who the segment is locked for, with 409",
       %{conn: conn, search: search, owner: owner} do
    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 3}])
    {reserved, _reserved_token} = approved_volunteer(search)
    {:ok, _someone_else, someone_else_token} = another_approved_volunteer(search)
    {:ok, _} = Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

    conn =
      conn
      |> auth(someone_else_token)
      |> patch(~p"/volunteer/segments/3", %{"status" => "searched"})

    assert json_response(conn, 409)
  end

  test "PATCH /volunteer/segments/:segment_id allows the reserved volunteer's own PATCH and clears the lock",
       %{conn: conn, search: search, owner: owner} do
    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 3}])
    {reserved, reserved_token} = approved_volunteer(search)
    {:ok, _} = Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

    conn =
      conn
      |> auth(reserved_token)
      |> patch(~p"/volunteer/segments/3", %{"status" => "searched"})

    assert %{"data" => data} = json_response(conn, 200)
    assert data["status"] == "searched"

    [segment] = Segments.list_by_search(search.id)
    assert segment.locked_at == nil
  end

  test "GET /volunteer/search reports locked/locked_for_me without leaking another volunteer's id",
       %{conn: conn, search: search, owner: owner} do
    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 3}])
    {reserved, _reserved_token} = approved_volunteer(search)
    {:ok, _someone_else, someone_else_token} = another_approved_volunteer(search)
    {:ok, _} = Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

    conn = conn |> auth(someone_else_token) |> get(~p"/volunteer/search")

    assert %{"data" => %{"segments" => [segment]}} = json_response(conn, 200)
    assert segment["locked"] == true
    assert segment["locked_for_me"] == false
    refute Map.has_key?(segment, "locked_for_volunteer_id")
    refute Map.has_key?(segment, "locked_by_user_id")
  end

  test "GET /volunteer/search reports locked_for_me: true for the volunteer the segment is reserved for",
       %{conn: conn, search: search, owner: owner} do
    {:ok, _} = Segments.seed_segments(search.id, [%{segment_id: 3}])
    {reserved, reserved_token} = approved_volunteer(search)
    {:ok, _} = Segments.lock(search.id, 3, owner.id, %{"locked_for_volunteer_id" => reserved.id})

    conn = conn |> auth(reserved_token) |> get(~p"/volunteer/search")

    assert %{"data" => %{"segments" => [segment]}} = json_response(conn, 200)
    assert segment["locked"] == true
    assert segment["locked_for_me"] == true
  end

  test "PATCH /volunteer/segments/:segment_id for a segment_id that was never generated returns 404",
       %{conn: conn, search: search} do
    {_volunteer, token} = approved_volunteer(search)

    conn =
      conn
      |> auth(token)
      |> patch(~p"/volunteer/segments/3", %{"status" => "searched"})

    assert json_response(conn, 404)
  end

  test "PATCH /volunteer/segments/:segment_id rejects a non-integer segment_id instead of persisting it",
       %{conn: conn, search: search} do
    {_volunteer, token} = approved_volunteer(search)

    conn =
      conn
      |> auth(token)
      |> patch(~p"/volunteer/segments/not-a-number", %{"status" => "in_progress"})

    assert json_response(conn, 422)
    assert Segments.list_by_search(search.id) == []
  end

  test "POST /volunteer/remarks round-trips client id/reported_at and forces volunteer_id to self",
       %{conn: conn, search: search} do
    {volunteer, token} = approved_volunteer(search)
    id = Ecto.UUID.generate()

    conn =
      conn
      |> auth(token)
      |> post(~p"/volunteer/remarks", %{
        "remark" => %{
          "id" => id,
          "kind" => "sighting",
          "text" => "Saw something",
          "reported_at" => "2026-08-01T10:00:00Z"
        }
      })

    assert %{"data" => data} = json_response(conn, 201)
    assert data["id"] == id
    assert data["volunteer_id"] == volunteer.id
  end

  test "POST /volunteer/remarks with a non-map remark value returns 422 instead of crashing", %{
    conn: conn,
    search: search
  } do
    {_volunteer, token} = approved_volunteer(search)

    conn = conn |> auth(token) |> post(~p"/volunteer/remarks", %{"remark" => nil})

    assert json_response(conn, 422)
  end

  test "POST /volunteer/messages round-trips a client-supplied id and forces volunteer_id/sender to self",
       %{conn: conn, search: search} do
    {volunteer, token} = approved_volunteer(search)
    id = Ecto.UUID.generate()

    conn =
      conn
      |> auth(token)
      |> post(~p"/volunteer/messages", %{
        "message" => %{
          "id" => id,
          "volunteer_id" => "some-other-volunteer-id",
          "sender" => "coordinator",
          "text" => "On my way"
        }
      })

    assert %{"data" => data} = json_response(conn, 201)
    assert data["id"] == id
    assert data["volunteer_id"] == volunteer.id
    assert data["sender"] == "volunteer"
  end

  test "POST /volunteer/messages with a non-map message value returns 422 instead of crashing", %{
    conn: conn,
    search: search
  } do
    {_volunteer, token} = approved_volunteer(search)

    conn = conn |> auth(token) |> post(~p"/volunteer/messages", %{"message" => nil})

    assert json_response(conn, 422)
  end

  test "GET /volunteer/messages returns only this volunteer's own thread", %{
    conn: conn,
    search: search
  } do
    {volunteer, token} = approved_volunteer(search)
    {:ok, other_volunteer, other_token} = another_approved_volunteer(search)

    conn
    |> auth(token)
    |> post(~p"/volunteer/messages", %{
      "message" => %{"id" => Ecto.UUID.generate(), "text" => "From Giulia"}
    })

    conn
    |> auth(other_token)
    |> post(~p"/volunteer/messages", %{
      "message" => %{"id" => Ecto.UUID.generate(), "text" => "From Luca"}
    })

    conn = conn |> auth(token) |> get(~p"/volunteer/messages")

    assert %{"data" => [message]} = json_response(conn, 200)
    assert message["text"] == "From Giulia"
    assert message["volunteer_id"] == volunteer.id
    refute message["volunteer_id"] == other_volunteer.id
  end

  test "GET /volunteer/session reports removed status for a removed volunteer's own token", %{
    conn: conn,
    search: search
  } do
    {volunteer, token} = approved_volunteer(search)
    {:ok, _removed} = Volunteers.update_volunteer(volunteer, %{status: "removed"})

    conn = conn |> auth(token) |> get(~p"/volunteer/session")

    assert %{"status" => "removed"} = json_response(conn, 200)
  end

  test "a second search's volunteer cannot affect the first search's segments", %{
    conn: conn,
    search: search
  } do
    {:ok, owner2} = Accounts.get_or_provision("user_owner_vol2", %{email: "vol2@example.com"})

    {:ok, other_search} =
      Searches.create_search(owner2.id, %{
        subject_type: "person",
        subject_name: "Other",
        contact_phone: "+390612345"
      })

    {:ok, _} = Segments.seed_segments(other_search.id, [%{segment_id: 3}])
    {_other_volunteer, other_token} = approved_volunteer(other_search)

    conn
    |> auth(other_token)
    |> patch(~p"/volunteer/segments/3", %{"status" => "searched"})

    assert Segments.list_by_search(search.id) == []
    assert length(Segments.list_by_search(other_search.id)) == 1
  end

  describe "POST /volunteer/location" do
    test "records a ping for a volunteer who granted location consent at join", %{
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
      token = Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)

      conn =
        conn
        |> auth(token)
        |> post(~p"/volunteer/location", %{
          "lat" => 41.9,
          "lng" => 12.5,
          "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
        })

      assert %{"data" => data} = json_response(conn, 201)
      assert data["volunteer_id"] == approved.id
      assert data["lat"] == 41.9
    end

    test "rejects a ping for a volunteer who declined location consent at join, with 403", %{
      conn: conn,
      search: search
    } do
      {:ok, volunteer} =
        Volunteers.join_volunteer(search.id, %{
          name: "Luca",
          phone: "+390698766",
          consent_location: false
        })

      {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
      token = Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)

      conn =
        conn
        |> auth(token)
        |> post(~p"/volunteer/location", %{
          "lat" => 41.9,
          "lng" => 12.5,
          "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
        })

      assert json_response(conn, 403)
      assert FindThemApi.Locations.list_trail(approved) == []
    end

    test "rejects a missing recorded_at with 422 instead of crashing", %{
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
      token = Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)

      conn =
        conn
        |> auth(token)
        |> post(~p"/volunteer/location", %{"lat" => 41.9, "lng" => 12.5})

      assert json_response(conn, 422)
    end

    test "the 11th ping in a minute from the same volunteer is rate limited with 429", %{
      conn: conn,
      search: search
    } do
      {:ok, volunteer} =
        Volunteers.join_volunteer(search.id, %{
          name: "Rapid Pinger",
          phone: "+390698769",
          consent_location: true
        })

      {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
      token = Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)

      responses =
        for _ <- 1..11 do
          conn
          |> auth(token)
          |> post(~p"/volunteer/location", %{
            "lat" => 41.9,
            "lng" => 12.5,
            "recorded_at" => DateTime.utc_now() |> DateTime.truncate(:second)
          })
          |> then(& &1.status)
        end

      assert Enum.count(responses, &(&1 == 201)) == 10
      assert List.last(responses) == 429
    end
  end
end
