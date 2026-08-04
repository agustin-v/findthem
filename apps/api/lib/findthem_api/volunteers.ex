defmodule FindThemApi.Volunteers do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Volunteers.Volunteer

  def list_by_search(search_id) do
    Volunteer
    |> where(search_id: ^search_id)
    |> Repo.all()
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
