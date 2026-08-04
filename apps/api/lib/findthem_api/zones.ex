defmodule FindThemApi.Zones do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches.Zone

  def list_by_search(search_id) do
    Zone
    |> where(search_id: ^search_id)
    |> Repo.all()
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
        %Zone{search_id: search_id, h3_index: h3_index}

    changeset_attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
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
