defmodule FindThemApiWeb.SearchVolunteerController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Volunteers}

  action_fallback FindThemApiWeb.FallbackController

  def index(conn, %{"search_id" => search_id}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      volunteers = Volunteers.list_by_search_with_stats(search_id)
      render(conn, :index, volunteers: volunteers)
    end
  end

  def update(conn, %{"search_id" => search_id, "id" => volunteer_id, "status" => status}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, volunteer} <- Volunteers.get_volunteer_in_search(search_id, volunteer_id),
         {:ok, updated} <- Volunteers.set_status(volunteer, status) do
      render(conn, :show, volunteer: updated)
    end
  end

  def update(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{status: ["can't be blank"]}})
  end
end
