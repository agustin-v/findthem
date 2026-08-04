defmodule FindThemApi.Volunteers do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Volunteers.Volunteer

  @token_salt "volunteer"
  @token_max_age 60 * 60 * 24 * 7

  def list_by_search(search_id) do
    Volunteer
    |> where(search_id: ^search_id)
    |> Repo.all()
  end

  def get_volunteer(id) do
    Repo.get(Volunteer, id)
  rescue
    Ecto.Query.CastError -> nil
  end

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
