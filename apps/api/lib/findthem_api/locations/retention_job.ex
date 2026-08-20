defmodule FindThemApi.Locations.RetentionJob do
  @moduledoc """
  Minimal self-scheduling cleanup — no Oban/Quantum in this codebase, and a
  single periodic delete doesn't earn adding one. Runs once shortly after
  boot (delayed so it doesn't compete with app startup for the DB pool),
  then every @interval_ms, deleting location pings for searches resolved
  more than the configured retention window ago.

  Not started in :test (see config/test.exs — `:start_location_retention_job`
  is false there) since the Ecto Sandbox is in :manual mode per-test; a
  background process never checked out would just fail its query the
  moment it ran.
  """
  use GenServer
  require Logger

  @interval_ms :timer.hours(6)
  @initial_delay_ms :timer.minutes(1)

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @impl true
  def init(_opts) do
    Process.send_after(self(), :purge, @initial_delay_ms)
    {:ok, %{}}
  end

  @impl true
  def handle_info(:purge, state) do
    purge()
    Process.send_after(self(), :purge, @interval_ms)
    {:noreply, state}
  end

  # A transient DB error (pool exhaustion, a brief failover) must not crash
  # this process — same reasoning as Plugs.VolunteerAuth.touch_last_active/1
  # and Photos.presigned_urls/1, the two other "best-effort, log and move
  # on" spots in this codebase. Letting it crash would still self-heal (the
  # supervisor restarts it, init/1 reschedules at @initial_delay_ms), but
  # there's no reason to pay for a supervisor crash report on a routine
  # blip when a plain rescue is this cheap.
  defp purge do
    retention_days = Application.get_env(:findthem_api, :location_retention_days, 30)
    {count, nil} = FindThemApi.Locations.purge_expired(retention_days)

    if count > 0 do
      Logger.info("VolunteerLocation retention: purged #{count} expired ping(s)")
    end
  rescue
    error -> Logger.warning("VolunteerLocation retention purge failed: #{inspect(error)}")
  end
end
