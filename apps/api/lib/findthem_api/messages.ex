defmodule FindThemApi.Messages do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Messages.Message
  alias FindThemApi.Searches
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
    lower_bound = search_inserted_at(search_id)

    attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      |> Map.put("search_id", search_id)
      |> Map.update("sent_at", DateTime.utc_now(), &resolve_sent_at(&1, lower_bound))

    %Message{}
    |> Message.changeset(attrs)
    |> validate_volunteer_in_search(search_id)
    |> Repo.insert(on_conflict: :nothing, conflict_target: :id)
    |> reload_and_broadcast(search_id, :message_created)
  end

  defp search_inserted_at(search_id) do
    case Searches.get_search(search_id) do
      {:ok, search} -> search.inserted_at
      {:error, :not_found} -> nil
    end
  end

  # sent_at is entirely client-supplied (Story #54's offline outbox — a
  # message composed while offline and synced hours later must record as
  # having been sent then, not at sync time) — clamped, not rejected
  # outright, same reasoning as Segments' occurred_at clamp: a suspect
  # client clock shouldn't fail an otherwise-legitimate send, it should
  # just get bounded. Falls back to now when absent entirely (the
  # coordinator's existing send path doesn't supply this yet) or
  # unparseable. Lower-bounded by the search's own creation time — a
  # message can't have been sent before the search it belongs to existed;
  # without this, nothing stopped an arbitrarily-backdated sent_at, which
  # would matter the moment any future feature (an export, an audit view)
  # starts trusting it for display or ordering rather than inserted_at.
  defp resolve_sent_at(value, lower_bound) do
    now = DateTime.utc_now()

    parsed =
      case value do
        v when is_binary(v) ->
          case DateTime.from_iso8601(v) do
            {:ok, dt, _offset} -> dt
            _ -> now
          end

        %DateTime{} = dt ->
          dt

        _ ->
          now
      end

    parsed
    |> clamp_not_before(lower_bound)
    |> clamp_not_after(now)
  end

  defp clamp_not_before(dt, lower_bound) when not is_nil(lower_bound) do
    if DateTime.compare(dt, lower_bound) == :lt, do: lower_bound, else: dt
  end

  defp clamp_not_before(dt, _lower_bound), do: dt

  defp clamp_not_after(dt, now) do
    if DateTime.compare(dt, now) == :gt, do: now, else: dt
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
  #
  # Scoped by search_id, not just Repo.get! by id alone — the id is
  # client-supplied, and on_conflict: :nothing means posting an id that
  # already exists *in a different search* writes nothing but still
  # matched a real row. An unscoped reload would return and broadcast
  # that other search's private message content into the attacker's own
  # search — same class of bug found and fixed in Remarks.
  # reload_and_broadcast/3 (Story 37's security review); a coordinator
  # sees every message id on searches they own via GET /api/searches/
  # :id/messages, so owning two searches is enough to replay one
  # search's message id into the other.
  defp reload_and_broadcast({:ok, %Message{id: id}}, search_id, event) do
    case Repo.get_by(Message, id: id, search_id: search_id) do
      nil ->
        {:error, :id_belongs_to_another_search}

      message ->
        Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search_id}", {event, message})
        {:ok, message}
    end
  end

  defp reload_and_broadcast(error, _search_id, _event), do: error
end
