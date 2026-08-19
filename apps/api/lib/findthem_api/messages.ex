defmodule FindThemApi.Messages do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Messages.Message
  alias FindThemApi.Volunteers.Volunteer

  def list_by_search(search_id) do
    Message
    |> where(search_id: ^search_id)
    |> order_by(asc: :inserted_at)
    |> Repo.all()
  end

  # volunteer_id can arrive here as a raw, client-supplied query param
  # (MessageController's ?volunteer_id=) — a malformed value must not
  # crash, same reasoning as Searches.get_search/1's identical rescue.
  def list_by_search_and_volunteer(search_id, volunteer_id) do
    Message
    |> where(search_id: ^search_id, volunteer_id: ^volunteer_id)
    |> order_by(asc: :inserted_at)
    |> Repo.all()
  rescue
    Ecto.Query.CastError -> []
  end

  # Client-supplies the id so an offline sync queue can replay this call
  # safely — on_conflict: :nothing makes a replay with the same id a no-op
  # instead of a raised constraint error. Same pattern as Remarks.create_remark/2.
  def create_message(search_id, attrs) do
    attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      |> Map.put("search_id", search_id)

    %Message{}
    |> Message.changeset(attrs)
    |> validate_volunteer_in_search(search_id)
    |> Repo.insert(on_conflict: :nothing, conflict_target: :id)
    |> reload_and_broadcast(search_id, :message_created)
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
  # text to every joined client, indistinguishable from a real message.
  # Re-fetching the row we actually have guarantees the broadcast (and the
  # HTTP response) always reflect the database, not the request.
  defp reload_and_broadcast({:ok, %Message{id: id}}, search_id, event) do
    message = Repo.get!(Message, id)
    Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search_id}", {event, message})
    {:ok, message}
  end

  defp reload_and_broadcast(error, _search_id, _event), do: error
end
