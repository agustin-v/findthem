defmodule FindThemApi.Zones do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches.Zone

  def list_by_search(search_id) do
    Zone
    |> where(search_id: ^search_id)
    |> Repo.all()
  end

  # Postgres caps bound parameters per statement at 65535. Each zone row
  # binds 4 (search_id, h3_index, segment_id, status), so a single
  # insert_all tops out around 16383 rows — reachable well within
  # apps/geo's own documented limits (GEO_MAX_H3_CELLS defaults to 50000,
  # and a ~20-25km radius at the default h3_resolution already exceeds it),
  # so this must chunk rather than assume one call is always safe.
  @seed_chunk_size 5000

  # Bulk-creates zone rows from a geo segmentation response so the volunteer
  # app has something to render before anyone has PATCHed a cell by hand.
  # `on_conflict: :nothing` against the (search_id, h3_index) primary key
  # means re-seeding after a regenerate never resets an in-progress/searched
  # zone's status — only genuinely new cells get inserted.
  def seed_zones(search_id, cells) do
    total =
      cells
      |> Enum.chunk_every(@seed_chunk_size)
      |> Enum.reduce(0, fn chunk, acc ->
        entries =
          Enum.map(chunk, fn %{h3_index: h3_index, segment_id: segment_id} ->
            %{
              search_id: search_id,
              h3_index: h3_index,
              segment_id: to_string(segment_id),
              status: "not_assigned"
            }
          end)

        {count, _} = Repo.insert_all(Zone, entries, on_conflict: :nothing)
        acc + count
      end)

    {:ok, total}
  end

  # Reads the existing row (if any) and updates only the fields present in
  # attrs, instead of an on_conflict upsert from a fresh struct — a fresh
  # struct's on_conflict replace would overwrite unrelated columns (e.g.
  # segment_id) with their defaults, and a status-only PATCH would silently
  # reset searched_at. Retried once on a unique-constraint race (two
  # concurrent first-writes for the same zone).
  def upsert_zone(search_id, h3_index, attrs, retry? \\ true) do
    zone =
      Repo.get_by(Zone, search_id: search_id, h3_index: h3_index) ||
        %Zone{search_id: search_id}

    changeset_attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      # Deliberately NOT set on the %Zone{} struct above (for the new-record
      # branch) — Ecto's cast only records a field as "changed" (and thus
      # runs validate_format on it) when the new value actually differs
      # from the struct's current value. Pre-setting h3_index on the struct
      # and then casting the identical value again would make cast see "no
      # diff" and silently skip Zone.changeset's h3_index format
      # validation on exactly the path (a PATCH to a brand-new h3_index)
      # it exists to guard.
      |> Map.put("h3_index", h3_index)
      |> put_searched_at(zone)

    zone
    |> Zone.changeset(changeset_attrs)
    |> Repo.insert_or_update()
    |> broadcast(search_id)
  rescue
    e in Ecto.ConstraintError ->
      if retry?,
        do: upsert_zone(search_id, h3_index, attrs, false),
        else: reraise(e, __STACKTRACE__)
  end

  # Sticky: searched_at is set once on the transition into "searched" and
  # left alone on repeat PATCHes with the same status.
  defp put_searched_at(%{"status" => "searched"} = attrs, %Zone{
         status: "searched",
         searched_at: existing
       })
       when not is_nil(existing) do
    attrs
  end

  defp put_searched_at(%{"status" => "searched"} = attrs, _zone) do
    Map.put(attrs, "searched_at", DateTime.utc_now() |> DateTime.truncate(:second))
  end

  defp put_searched_at(%{"status" => _other} = attrs, _zone),
    do: Map.put(attrs, "searched_at", nil)

  defp put_searched_at(attrs, _zone), do: attrs

  defp broadcast({:ok, %Zone{} = zone} = result, search_id) do
    Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search_id}", {:zone_updated, zone})
    result
  end

  defp broadcast(error, _search_id), do: error
end
