defmodule FindThemApi.Remarks do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Remarks.Remark

  def list_by_search(search_id) do
    Remark
    |> where(search_id: ^search_id)
    |> Repo.all()
  end

  def create_remark(search_id, attrs) do
    attrs =
      attrs
      |> Map.new()
      |> Map.put(:search_id, search_id)

    %Remark{}
    |> Remark.changeset(attrs)
    |> Repo.insert()
    |> broadcast(search_id, :remark_created)
  end

  defp broadcast({:ok, %Remark{} = remark} = result, search_id, event) do
    Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search_id}", {event, remark})
    result
  end

  defp broadcast(error, _search_id, _event), do: error
end
