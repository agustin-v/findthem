defmodule FindThemApi.Volunteers do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches.Segment
  alias FindThemApi.Volunteers.Volunteer

  @token_salt "volunteer"
  @token_max_age 60 * 60 * 24 * 7

  def list_by_search(search_id) do
    Volunteer
    |> where(search_id: ^search_id)
    |> order_by(asc: :joined_at)
    |> Repo.all()
  end

  def get_volunteer(id) do
    Repo.get(Volunteer, id)
  rescue
    Ecto.Query.CastError -> nil
  end

  # Scoped by BOTH search_id and id — a real volunteer id from a different
  # search must not be reachable through a foreign search_id in the path.
  def get_volunteer_in_search(search_id, id) do
    case Repo.get_by(Volunteer, id: id, search_id: search_id) do
      nil -> {:error, :not_found}
      volunteer -> {:ok, volunteer}
    end
  rescue
    Ecto.Query.CastError -> {:error, :not_found}
  end

  def list_by_search_with_stats(search_id) do
    segment_counts =
      from(s in Segment,
        where:
          s.search_id == ^search_id and s.status == "searched" and
            not is_nil(s.searched_by_volunteer_id),
        group_by: s.searched_by_volunteer_id,
        select: {s.searched_by_volunteer_id, count()}
      )
      |> Repo.all()
      |> Map.new()

    search_id
    |> list_by_search()
    |> Enum.map(fn volunteer -> {volunteer, Map.get(segment_counts, volunteer.id, 0)} end)
  end

  # Deliberately no state-machine guard: any transition between "approved"
  # and "removed" is allowed unconditionally (including re-approving an
  # already-removed volunteer, or re-stamping an already-approved one) —
  # this lets a coordinator undo a mistaken removal/approval with the same
  # action rather than needing a separate "restore" endpoint.
  def set_status(%Volunteer{} = volunteer, "approved") do
    update_volunteer(volunteer, %{
      "status" => "approved",
      "approved_at" => DateTime.utc_now() |> DateTime.truncate(:second)
    })
  end

  def set_status(%Volunteer{} = volunteer, "removed") do
    update_volunteer(volunteer, %{
      "status" => "removed",
      "removed_at" => DateTime.utc_now() |> DateTime.truncate(:second)
    })
  end

  def set_status(%Volunteer{}, _invalid), do: {:error, :invalid_status}

  def sign_token(conn_or_endpoint, volunteer_id) do
    Phoenix.Token.sign(conn_or_endpoint, @token_salt, volunteer_id, max_age: @token_max_age)
  end

  def verify_token(conn_or_endpoint, token) do
    with {:ok, volunteer_id} <-
           Phoenix.Token.verify(conn_or_endpoint, @token_salt, token, max_age: @token_max_age),
         %Volunteer{} = volunteer <- get_volunteer(volunteer_id) do
      {:ok, volunteer}
    else
      _ -> {:error, :invalid}
    end
  end

  # No broadcast — this fires on every authenticated volunteer request as a
  # liveness heartbeat, and broadcasting :volunteer_updated on every single
  # read/write would spam PubSub subscribers for a field nobody needs live
  # per-request. Anyone fetching current volunteer state gets it fresh from
  # the DB anyway.
  def touch_last_active(%Volunteer{} = volunteer) do
    volunteer
    |> Ecto.Changeset.change(last_active_at: DateTime.utc_now() |> DateTime.truncate(:second))
    |> Repo.update()
  end

  def join_volunteer(search_id, attrs) do
    attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      |> Map.put("search_id", search_id)
      |> Map.put_new("joined_at", DateTime.utc_now() |> DateTime.truncate(:second))

    %Volunteer{}
    |> Volunteer.changeset(attrs)
    |> Repo.insert()
    |> broadcast(search_id, :volunteer_joined)
  end

  def update_volunteer(%Volunteer{} = volunteer, attrs) do
    volunteer
    |> Volunteer.changeset(attrs)
    |> Repo.update()
    |> broadcast(volunteer.search_id, :volunteer_updated)
  end

  defp broadcast({:ok, %Volunteer{} = volunteer} = result, search_id, event) do
    Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search_id}", {event, volunteer})
    result
  end

  defp broadcast(error, _search_id, _event), do: error
end
