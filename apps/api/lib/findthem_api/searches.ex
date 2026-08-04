defmodule FindThemApi.Searches do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches.Search

  def list_searches_by_owner(owner_id) do
    Search
    |> where(owner_id: ^owner_id)
    |> Repo.all()
  end

  def get_search!(id), do: Repo.get!(Search, id)

  def create_search(owner_id, attrs) do
    attrs =
      attrs
      |> Map.new()
      |> Map.put(:owner_id, owner_id)
      |> Map.put_new_lazy(:join_token, &generate_join_token/0)

    %Search{}
    |> Search.changeset(attrs)
    |> Repo.insert()
    |> broadcast(:search_created)
  end

  def update_search(%Search{} = search, attrs) do
    search
    |> Search.changeset(attrs)
    |> Repo.update()
    |> broadcast(:search_updated)
  end

  defp broadcast({:ok, %Search{} = search} = result, event) do
    Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search.id}", {event, search})
    result
  end

  defp broadcast(error, _event), do: error

  defp generate_join_token do
    :crypto.strong_rand_bytes(9) |> Base.url_encode64(padding: false)
  end
end
