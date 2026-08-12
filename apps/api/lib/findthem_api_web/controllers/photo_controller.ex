defmodule FindThemApiWeb.PhotoController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Photos, Searches}

  action_fallback FindThemApiWeb.FallbackController

  def create(conn, %{"search_id" => search_id, "photo" => %Plug.Upload{} = upload}) do
    with {:ok, search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, updated} <- Photos.upload(search, upload) do
      conn
      |> put_status(:created)
      |> put_view(json: FindThemApiWeb.SearchJSON)
      |> render(:show, search: updated)
    end
  end

  def create(conn, %{"search_id" => search_id}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      {:error, :missing_photo}
    end
  end
end
