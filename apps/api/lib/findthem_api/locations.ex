defmodule FindThemApi.Locations do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Locations.VolunteerLocation
  alias FindThemApi.Searches.Search
  alias FindThemApi.Volunteers.Volunteer

  @default_retention_days 30

  # Whitelist, not a blacklist — matching on consent_location: true (with a
  # catch-all reject below) rather than consent_location: false (with a
  # catch-all accept) keeps the fail-closed direction correct even if this
  # column's nullability or default ever changes. Enforced here, not just
  # client-side (apps/mobile already gates on consent before it ever starts
  # reporting) — don't trust the client alone to withhold pings. A stale
  # client that joined before consent was captured, or a modified/rogue
  # build, must not be able to persist location data for a volunteer who
  # declined it.
  def record_ping(%Volunteer{consent_location: true} = volunteer, attrs) do
    attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      |> Map.put("search_id", volunteer.search_id)
      |> Map.put("volunteer_id", volunteer.id)

    %VolunteerLocation{}
    |> VolunteerLocation.changeset(attrs)
    |> Repo.insert()
    |> broadcast(volunteer.search_id)
  end

  def record_ping(%Volunteer{}, _attrs), do: {:error, :location_consent_declined}

  defp broadcast({:ok, %VolunteerLocation{} = location} = result, search_id) do
    Phoenix.PubSub.broadcast(
      FindThemApi.PubSub,
      "search:#{search_id}",
      {:location_updated, location}
    )

    result
  end

  defp broadcast(error, _search_id), do: error

  # Breadcrumb trail — the full time series for one volunteer, oldest
  # first, for coverage review ("was this area actually walked, and
  # when"). Takes an already-loaded, already-scoped %Volunteer{} (the
  # caller has necessarily already verified it belongs to the right search
  # to have one in hand — see Volunteers.get_volunteer_in_search/2) rather
  # than loose search_id/volunteer_id args, so the SAME function that
  # returns the data also enforces the SAME consent rule
  # SearchVolunteerJSON's last_location_data/2 enforces on the roster —
  # returning nil/[] whenever consent_location is currently false, even if
  # older pings exist from before consent was withdrawn. Two endpoints
  # implementing two different privacy policies for the same rows is
  # exactly the kind of gap that makes a "the roster hides it" claim
  # cosmetic instead of real.
  def list_trail(%Volunteer{consent_location: true} = volunteer) do
    VolunteerLocation
    |> where(search_id: ^volunteer.search_id, volunteer_id: ^volunteer.id)
    |> order_by(asc: :recorded_at, asc: :inserted_at)
    |> Repo.all()
  end

  def list_trail(%Volunteer{}), do: []

  # One row per volunteer — their single most recent ping on this search —
  # for folding onto the coordinator's volunteers list (the live dot's
  # last-known position between channel pushes, and its initial position
  # on page load before any push has arrived). DISTINCT ON, not a GROUP BY
  # + subquery, since the whole row at max(recorded_at) is needed, not
  # just the max value. Ordered by recorded_at (the client's own GPS
  # timestamp) first since that's the actual "most recent fix" — with
  # inserted_at (server-set) as a tiebreak for same-instant pings, not the
  # primary key, since recorded_at is now bounded not-future by the
  # changeset (see VolunteerLocation.changeset) and is what a breadcrumb
  # trail's "when" should mean.
  def last_known_by_search(search_id) do
    VolunteerLocation
    |> where(search_id: ^search_id)
    |> distinct(:volunteer_id)
    |> order_by([l], asc: l.volunteer_id, desc: l.recorded_at, desc: l.inserted_at)
    |> Repo.all()
    |> Map.new(&{&1.volunteer_id, &1})
  end

  # Single-volunteer equivalent of last_known_by_search/1 — for a caller
  # that already has exactly one volunteer in hand (a PATCH response, or
  # SearchChannel relaying a single volunteer_joined/volunteer_updated
  # broadcast) and doesn't want to pull a whole search's positions just to
  # look one up. A direct indexed query (LIMIT 1), not last_known_by_search/1
  # filtered down — same leading-column index serves both, but this one
  # never materializes rows for volunteers nobody asked about.
  def last_known_for_volunteer(search_id, volunteer_id) do
    VolunteerLocation
    |> where(search_id: ^search_id, volunteer_id: ^volunteer_id)
    |> order_by(desc: :recorded_at, desc: :inserted_at)
    |> limit(1)
    |> Repo.one()
  end

  # Deletes location pings past the retention window, via TWO independent
  # conditions:
  #
  #   1. Belongs to a search that's been status: "resolved" for at least
  #      `retention_days` (closed_at-based) — the originally-specified
  #      trigger.
  #   2. Was itself inserted more than `retention_days` ago, REGARDLESS of
  #      the owning search's status.
  #
  # (2) exists because nothing in this codebase sets status/closed_at
  # today — there is no "resolve a search" endpoint yet (Search.status/
  # closed_at are schema fields with no controller action reachable over
  # HTTP that writes them). Without a status-independent fallback,
  # retention would be a PERMANENT NO-OP in production: RetentionJob would
  # fire forever and never delete a single row, silently keeping every
  # volunteer's real-time location history indefinitely. (2) is keyed by
  # inserted_at (server-set), not recorded_at (client-supplied and, before
  # the not-future changeset validation existed, forgeable) — a ping must
  # not be able to dodge its own retention window by claiming a
  # far-future timestamp.
  #
  # Single unbounded DELETE, not batched — acceptable for this feature's
  # actual data volumes (one row per ping, bounded search duration/
  # volunteer count per search) but would want batching (delete in
  # capped chunks, loop until nothing left) before this table has enough
  # backlog for one DELETE to become a long-held lock/WAL-pressure
  # concern.
  def purge_expired(retention_days \\ @default_retention_days) do
    retention_days = max(retention_days, 1)
    cutoff = DateTime.utc_now() |> DateTime.add(-retention_days, :day)

    resolved_search_ids =
      from(s in Search,
        where: s.status == "resolved" and not is_nil(s.closed_at) and s.closed_at < ^cutoff,
        select: s.id
      )

    from(l in VolunteerLocation,
      where: l.search_id in subquery(resolved_search_ids) or l.inserted_at < ^cutoff
    )
    |> Repo.delete_all()
  end
end
