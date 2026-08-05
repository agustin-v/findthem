defmodule FindThemApi.SegmentAssignments do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches.{Segment, SegmentAssignment}
  alias FindThemApi.Volunteers

  def list_by_search(search_id) do
    SegmentAssignment
    |> where(search_id: ^search_id)
    |> Repo.all()
  end

  def list_segment_ids_for_volunteer(search_id, volunteer_id) do
    SegmentAssignment
    |> where(search_id: ^search_id, volunteer_id: ^volunteer_id)
    |> select([a], a.segment_id)
    |> Repo.all()
  end

  # Only an approved volunteer belonging to this search can be assigned — a
  # pending/removed volunteer isn't a real, working resource yet/anymore,
  # and a volunteer_id from a different search must not be reachable through
  # a foreign search_id (mirrors get_volunteer_in_search's own scoping).
  # The segment itself must already exist (seeded from a real generation) —
  # same "no phantom rows" reasoning as Segments.update_segment_status/3.
  #
  # Known accepted race, same class as update_segment_status/3's: this
  # existence check and the insert below aren't in one transaction, so a
  # regenerate (Searches.persist_generation, which deletes+reseeds segments
  # and clears assignments atomically) landing in that window could let an
  # assignment survive pointing at a segment_id that, post-regenerate,
  # refers to a different polygon. Low-frequency (needs a coordinator
  # regenerating at the exact moment another assigns) and self-healing (the
  # very same regenerate's clear_for_search/1 wipes it) — assignment is
  # purely an advisory "who's working where" hint, not an access-control
  # gate, so the worst case is a stale label, not a security issue.
  def assign(search_id, segment_id, volunteer_id) do
    with %Segment{} <- Repo.get_by(Segment, search_id: search_id, segment_id: segment_id) || :segment_not_found,
         {:ok, %{status: "approved"}} <- Volunteers.get_volunteer_in_search(search_id, volunteer_id) do
      %SegmentAssignment{}
      |> SegmentAssignment.changeset(%{
        search_id: search_id,
        segment_id: segment_id,
        volunteer_id: volunteer_id,
        assigned_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })
      |> Repo.insert(
        on_conflict: :nothing,
        conflict_target: [:search_id, :segment_id, :volunteer_id]
      )
      |> case do
        {:ok, _} ->
          assignment =
            Repo.get_by!(SegmentAssignment,
              search_id: search_id,
              segment_id: segment_id,
              volunteer_id: volunteer_id
            )

          broadcast({:ok, assignment}, search_id, :segment_assignment_created)

        error ->
          error
      end
    else
      :segment_not_found -> {:error, :segment_not_found}
      {:ok, %{status: _other}} -> {:error, :volunteer_not_approved}
      {:error, :not_found} -> {:error, :not_found}
    end
  end

  # Unlike assign/3, this never routes through Volunteers.get_volunteer_in_search
  # (removing an assignment doesn't need to re-validate the volunteer still
  # exists or is approved), so it's the only place here building a query
  # with a raw client-supplied volunteer_id — needs its own CastError guard
  # for a malformed (non-UUID) path segment, matching the rescue pattern
  # Searches.get_search/1 and Volunteers.get_volunteer_in_search/2 already
  # use for the same reason.
  def unassign(search_id, segment_id, volunteer_id) do
    {count, _} =
      SegmentAssignment
      |> where(search_id: ^search_id, segment_id: ^segment_id, volunteer_id: ^volunteer_id)
      |> Repo.delete_all()

    Phoenix.PubSub.broadcast(
      FindThemApi.PubSub,
      "search:#{search_id}",
      {:segment_assignment_removed, %{search_id: search_id, segment_id: segment_id, volunteer_id: volunteer_id}}
    )

    {:ok, count}
  rescue
    Ecto.Query.CastError -> {:error, :not_found}
  end

  # Segment numbering isn't stable across regenerates (see
  # Segments.seed_segments/2) — an assignment keyed to a stale segment_id
  # would silently point at a physically different polygon after a
  # regenerate, so assignments are wiped alongside segment status. Called
  # from Searches.persist_generation/5 in the same transaction as
  # Segments.seed_segments/2.
  def clear_for_search(search_id) do
    SegmentAssignment
    |> where(search_id: ^search_id)
    |> Repo.delete_all()

    :ok
  end

  defp broadcast({:ok, %SegmentAssignment{} = assignment} = result, search_id, event) do
    Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search_id}", {event, assignment})
    result
  end

  defp broadcast(error, _search_id, _event), do: error
end
