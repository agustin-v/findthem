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
    attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      |> Map.put("search_id", search_id)

    %Remark{}
    |> Remark.changeset(attrs)
    |> validate_volunteer_in_search(search_id)
    |> Repo.insert(on_conflict: :nothing, conflict_target: :id)
    |> broadcast(search_id, :remark_created)
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

  defp broadcast({:ok, %Remark{} = remark} = result, search_id, event) do
    Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search_id}", {event, remark})
    result
  end

  defp broadcast(error, _search_id, _event), do: error
end
