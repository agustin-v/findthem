defmodule FindThemApiWeb.VolunteerControllerTest do
  use FindThemApiWeb.ConnCase, async: true

  alias FindThemApi.{Accounts, Searches, Volunteers, Zones}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_vol", %{email: "vol@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345",
        lkp_address: "Via del Corso, Roma"
      })

    %{search: search}
  end

  defp approved_volunteer(search) do
    {:ok, volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Giulia Bianchi", phone: "+390698765"})

    {:ok, approved} = Volunteers.update_volunteer(volunteer, %{status: "approved"})
    token = Volunteers.sign_token(FindThemApiWeb.Endpoint, approved.id)
    {approved, token}
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

  test "an approved volunteer's token can access GET /volunteer/search, no photos/join_token leaked",
       %{conn: conn, search: search} do
    {_volunteer, token} = approved_volunteer(search)

    conn = conn |> auth(token) |> get(~p"/volunteer/search")

    assert %{"data" => data} = json_response(conn, 200)
    assert data["search"]["subject_name"] == "Marco Rossi"
    assert data["search"]["contact_phone"] == "+390612345"
    refute Map.has_key?(data["search"], "join_token")
    refute Map.has_key?(data["search"], "photo_urls")
    assert data["zones"] == []
    assert data["generation"] == nil
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

  test "PATCH /volunteer/zones/:h3_index records the acting volunteer as searched_by", %{
    conn: conn,
    search: search
  } do
    {volunteer, token} = approved_volunteer(search)

    conn =
      conn
      |> auth(token)
      |> patch(~p"/volunteer/zones/891f1d48177ffff", %{"status" => "searched"})

    assert %{"data" => data} = json_response(conn, 200)
    assert data["status"] == "searched"
    assert data["searched_by_volunteer_id"] == volunteer.id
  end

  test "PATCH /volunteer/zones/:h3_index rejects a malformed h3_index instead of persisting it",
       %{conn: conn, search: search} do
    {_volunteer, token} = approved_volunteer(search)

    conn =
      conn
      |> auth(token)
      |> patch(~p"/volunteer/zones/ffffffffffffffff", %{"status" => "in_progress"})

    assert json_response(conn, 422)
    assert Zones.list_by_search(search.id) == []
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

  test "GET /volunteer/session reports removed status for a removed volunteer's own token", %{
    conn: conn,
    search: search
  } do
    {volunteer, token} = approved_volunteer(search)
    {:ok, _removed} = Volunteers.update_volunteer(volunteer, %{status: "removed"})

    conn = conn |> auth(token) |> get(~p"/volunteer/session")

    assert %{"status" => "removed"} = json_response(conn, 200)
  end

  test "a second search's volunteer cannot affect the first search's zones", %{
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

    {_other_volunteer, other_token} = approved_volunteer(other_search)

    conn
    |> auth(other_token)
    |> patch(~p"/volunteer/zones/891f1d48177ffff", %{"status" => "searched"})

    assert Zones.list_by_search(search.id) == []
    assert length(Zones.list_by_search(other_search.id)) == 1
  end
end
