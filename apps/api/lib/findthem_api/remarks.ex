defmodule FindThemApi.Remarks do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Remarks.Remark
  alias FindThemApi.Volunteers.Volunteer

  def list_by_search(search_id) do
    Remark
    |> where(search_id: ^search_id)
    |> Repo.all()
  end

  # Client-supplies the id so an offline sync queue can replay this call
  # safely — on_conflict: :nothing makes a replay with the same id a no-op
  # instead of a raised constraint error.
  def create_remark(search_id, attrs) do
    search_id
    |> build_changeset(attrs)
    |> insert_and_broadcast(search_id)
  end

  # Coordinator-authored map notices (Story 37) — unlike the volunteer flow
  # above, where a denied/failed GPS fix still lets a report through with no
  # position (see the shared Remark.changeset comment), a map notice with no
  # position doesn't make sense to create at all: skipping this guard risks
  # a pin silently landing at (0,0) instead of failing loudly. Enforced here
  # rather than on the shared schema/changeset specifically so the volunteer
  # path stays untouched.
  def create_map_remark(search_id, attrs) do
    search_id
    |> build_changeset(attrs)
    |> Ecto.Changeset.validate_required([:lat, :lng], message: "is required for a map notice")
    |> insert_and_broadcast(search_id)
  end

  defp build_changeset(search_id, attrs) do
    attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      |> Map.put("search_id", search_id)

    %Remark{}
    |> Remark.changeset(attrs)
    |> validate_volunteer_in_search(search_id)
  end

  defp insert_and_broadcast(changeset, search_id) do
    changeset
    |> Repo.insert(on_conflict: :nothing, conflict_target: :id)
    |> reload_and_broadcast(search_id, :remark_created)
  end

  defp validate_volunteer_in_search(changeset, search_id) do
    case Ecto.Changeset.get_change(changeset, :volunteer_id) do
      nil ->
        changeset

      volunteer_id ->
        if Repo.exists?(
             from(v in Volunteer, where: v.id == ^volunteer_id and v.search_id == ^search_id)
           ) do
          changeset
        else
          Ecto.Changeset.add_error(changeset, :volunteer_id, "must belong to the same search")
        end
    end
  end

  # Repo.insert with on_conflict: :nothing echoes back the *submitted*
  # struct even when nothing was actually written (a replay of a
  # client-generated id with different content this time) — broadcasting
  # that directly would push unpersisted, possibly-attacker-controlled
  # content to every joined client, indistinguishable from a real remark.
  # Re-fetching the row we actually have guarantees the broadcast (and the
  # HTTP response) always reflect the database, not the request.
  #
  # Scoped by search_id, not just Repo.get! by id alone — the id is
  # client-supplied, and on_conflict: :nothing means posting an id that
  # already exists *in a different search* writes nothing but still
  # matched a real row. An unscoped reload would return and broadcast
  # that other search's remark content into the attacker's own search —
  # confirmed exploitable once GET /volunteer/search (this same story)
  # started shipping every remark id on a search to every volunteer on
  # it, giving an attacker id values to replay after their own access to
  # the original search ends.
  defp reload_and_broadcast({:ok, %Remark{id: id}}, search_id, event) do
    case Repo.get_by(Remark, id: id, search_id: search_id) do
      nil ->
        {:error, :id_belongs_to_another_search}

      remark ->
        Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search_id}", {event, remark})
        {:ok, remark}
    end
  end

  defp reload_and_broadcast(error, _search_id, _event), do: error
end
