defmodule FindThemApiWeb.SearchController do
  use FindThemApiWeb, :controller

  alias FindThemApi.Searches

  action_fallback FindThemApiWeb.FallbackController

  def index(conn, _params) do
    searches = Searches.list_searches_by_owner(conn.assigns.current_user.id)
    render(conn, :index, searches: searches)
  end

  def create(conn, %{"search" => search_params}) do
    with {:ok, search} <- Searches.create_search(conn.assigns.current_user.id, search_params) do
      conn
      |> put_status(:created)
      |> render(:show, search: search)
    end
  end

  def show(conn, %{"id" => id}) do
    with {:ok, search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, id) do
      render(conn, :show, search: search)
    end
  end
end
