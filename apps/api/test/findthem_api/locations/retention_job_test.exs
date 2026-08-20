defmodule FindThemApi.Locations.RetentionJobTest do
  use FindThemApi.DataCase, async: false

  alias FindThemApi.{Accounts, Locations, Searches, Volunteers}
  alias FindThemApi.Locations.RetentionJob

  # Not started via start_link/supervision (config/test.exs disables it —
  # the Sandbox is :manual mode per-test, so a background process has
  # nothing to check it out of). Calling the callback directly still
  # exercises the actual purge logic and the reschedule return shape,
  # which otherwise has zero coverage.
  test "handle_info(:purge, state) purges expired pings and reschedules" do
    {:ok, owner} = Accounts.get_or_provision("user_owner_retention", %{email: "ret@example.com"})

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

    now = DateTime.utc_now() |> DateTime.truncate(:second)

    {:ok, _resolved} =
      search
      |> Ecto.Changeset.change(status: "resolved", closed_at: DateTime.add(now, -60, :day))
      |> Repo.update()

    {:ok, _location} =
      Locations.record_ping(volunteer, %{"lat" => 41.9, "lng" => 12.5, "recorded_at" => now})

    assert {:noreply, %{}} = RetentionJob.handle_info(:purge, %{})
    assert Locations.list_trail(volunteer) == []
  end

  test "handle_info(:purge, state) does not crash when a transient purge error is raised" do
    previous = Application.get_env(:findthem_api, :location_retention_days)
    Application.put_env(:findthem_api, :location_retention_days, "not-an-integer")
    on_exit(fn -> Application.put_env(:findthem_api, :location_retention_days, previous) end)

    assert {:noreply, %{}} = RetentionJob.handle_info(:purge, %{})
  end
end
