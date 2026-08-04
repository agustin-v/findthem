defmodule FindThemApiWeb.JoinTokenController do
  use FindThemApiWeb, :controller

  alias FindThemApi.Searches

  action_fallback FindThemApiWeb.FallbackController

  def rotate(conn, %{"search_id" => search_id}) do
    with {:ok, search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, rotated} <- Searches.rotate_join_token(search) do
      json(conn, %{data: %{join_token: rotated.join_token}})
    end
  end
end
