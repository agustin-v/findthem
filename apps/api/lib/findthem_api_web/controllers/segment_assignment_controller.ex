defmodule FindThemApiWeb.SegmentAssignmentController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, SegmentAssignments}

  action_fallback FindThemApiWeb.FallbackController

  def index(conn, %{"search_id" => search_id}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      assignments = SegmentAssignments.list_by_search(search_id)
      render(conn, :index, assignments: assignments)
    end
  end

  def create(conn, %{"search_id" => search_id} = params) do
    with {:ok, segment_id} <- parse_int(params["segment_id"]),
         {:ok, volunteer_id} <- fetch_volunteer_id(params),
         {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, assignment} <- SegmentAssignments.assign(search_id, segment_id, volunteer_id) do
      conn
      |> put_status(:created)
      |> render(:show, assignment: assignment)
    end
  end

  def delete(conn, %{"search_id" => search_id, "segment_id" => segment_id_param, "volunteer_id" => volunteer_id}) do
    with {:ok, segment_id} <- parse_int(segment_id_param),
         {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, _count} <- SegmentAssignments.unassign(search_id, segment_id, volunteer_id) do
      send_resp(conn, :no_content, "")
    end
  end

  defp fetch_volunteer_id(%{"volunteer_id" => volunteer_id}) when is_binary(volunteer_id),
    do: {:ok, volunteer_id}

  defp fetch_volunteer_id(_params), do: {:error, :invalid_volunteer_id}

  defp parse_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} -> {:ok, int}
      _ -> {:error, :invalid_segment_id}
    end
  end

  defp parse_int(value) when is_integer(value), do: {:ok, value}
  defp parse_int(_value), do: {:error, :invalid_segment_id}
end
