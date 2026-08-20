defmodule FindThemApiWeb.SegmentController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Segments}

  action_fallback FindThemApiWeb.FallbackController

  def index(conn, %{"search_id" => search_id}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      segments = Segments.list_by_search(search_id)
      render(conn, :index, segments: segments)
    end
  end

  def update(conn, %{"search_id" => search_id, "segment_id" => segment_id_param} = params) do
    with {:ok, segment_id} <- parse_segment_id(segment_id_param),
         {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, segment} <-
           Segments.update_segment_status(
             search_id,
             segment_id,
             Map.take(params, ["status"]),
             actor: :coordinator
           ) do
      render(conn, :show, segment: segment)
    end
  end

  def lock(conn, %{"search_id" => search_id, "segment_id" => segment_id_param} = params) do
    with {:ok, segment_id} <- parse_segment_id(segment_id_param),
         {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, segment} <-
           Segments.lock(
             search_id,
             segment_id,
             conn.assigns.current_user.id,
             Map.take(params, ["locked_for_volunteer_id", "lock_reason"])
           ) do
      render(conn, :show, segment: segment)
    end
  end

  def unlock(conn, %{"search_id" => search_id, "segment_id" => segment_id_param}) do
    with {:ok, segment_id} <- parse_segment_id(segment_id_param),
         {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, segment} <- Segments.unlock(search_id, segment_id) do
      render(conn, :show, segment: segment)
    end
  end

  defp parse_segment_id(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} -> {:ok, int}
      _ -> {:error, :invalid_segment_id}
    end
  end
end
