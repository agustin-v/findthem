defmodule FindThemApi.Segments do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches.Segment

  def list_by_search(search_id) do
    Segment
    |> where(search_id: ^search_id)
    |> Repo.all()
  end

  # apps/geo re-numbers segment_id from scratch on every generation — it's
  # an array index into that run's output, not a stable geographic key
  # (unlike the old per-h3-cell zones, where h3_index stayed valid across
  # regenerates). Reusing on_conflict: :nothing here would silently carry a
  # stale "searched" status onto a same-numbered but physically different
  # segment after a regenerate, so this replaces the whole set instead:
  # every regenerate resets segment progress for the search.
  def seed_segments(search_id, entries) do
    Repo.delete_all(from(s in Segment, where: s.search_id == ^search_id))

    rows =
      Enum.map(entries, fn %{segment_id: segment_id} ->
        %{search_id: search_id, segment_id: segment_id, status: "not_assigned"}
      end)

    {count, _} = Repo.insert_all(Segment, rows)
    {:ok, count}
  end

  # Update-only, not upsert — segment rows are only ever created by
  # seed_segments/2 from a real generation. A PATCH for a segment_id with no
  # backing row (never generated, or stale after a regenerate) returns
  # :not_found rather than creating one; letting a PATCH blindly create rows
  # let a client inflate total_segments/segments_searched in
  # Searches.aggregates_for with segments that don't correspond to any real
  # geo feature.
  #
  # Known accepted race: this read-then-write isn't wrapped in a
  # transaction, so a PATCH racing a concurrent regenerate (seed_segments'
  # delete_all + insert_all) can still land on a *new* row that happens to
  # reuse the same segment_id, silently attaching a stale status to an
  # unrelated polygon instead of failing loudly. Closing that fully would
  # need generation-scoped segment identity (out of scope here) — this fix
  # only guarantees the *no matching row at all* case fails cleanly instead
  # of raising Ecto.StaleEntryError, matching the low-frequency-action
  # risk-acceptance already established for rotate_join_token/2 above.
  def update_segment_status(search_id, segment_id, attrs, retry? \\ true) do
    case Repo.get_by(Segment, search_id: search_id, segment_id: segment_id) do
      nil ->
        {:error, :not_found}

      segment ->
        changeset_attrs =
          attrs
          |> Map.new(fn {k, v} -> {to_string(k), v} end)
          |> put_searched_at(segment)

        segment
        |> Segment.changeset(changeset_attrs)
        |> Repo.update()
        |> broadcast(search_id)
    end
  rescue
    _e in Ecto.StaleEntryError ->
      # The row was deleted (regenerate) between our read and write.
      {:error, :not_found}

    e in Ecto.ConstraintError ->
      if retry?,
        do: update_segment_status(search_id, segment_id, attrs, false),
        else: reraise(e, __STACKTRACE__)
  end

  # Sticky: searched_at is set once on the transition into "searched" and
  # left alone on repeat PATCHes with the same status.
  defp put_searched_at(%{"status" => "searched"} = attrs, %Segment{
         status: "searched",
         searched_at: existing
       })
       when not is_nil(existing) do
    attrs
  end

  defp put_searched_at(%{"status" => "searched"} = attrs, _segment) do
    Map.put(attrs, "searched_at", DateTime.utc_now() |> DateTime.truncate(:second))
  end

  defp put_searched_at(%{"status" => _other} = attrs, _segment),
    do: Map.put(attrs, "searched_at", nil)

  defp put_searched_at(attrs, _segment), do: attrs

  defp broadcast({:ok, %Segment{} = segment} = result, search_id) do
    Phoenix.PubSub.broadcast(
      FindThemApi.PubSub,
      "search:#{search_id}",
      {:segment_updated, segment}
    )

    result
  end

  defp broadcast(error, _search_id), do: error
end
