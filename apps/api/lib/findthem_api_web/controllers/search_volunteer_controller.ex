defmodule FindThemApiWeb.SearchVolunteerController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Volunteers, Locations}

  action_fallback FindThemApiWeb.FallbackController

  def index(conn, %{"search_id" => search_id}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      volunteers = Volunteers.list_by_search_with_stats(search_id)
      # Last-known position folded in here (not a separate endpoint) for
      # the live dot's initial render/fallback — Story 39's channel push
      # (location_updated) is what keeps it live after that.
      last_known_locations = Locations.last_known_by_search(search_id)
      render(conn, :index, volunteers: volunteers, last_known_locations: last_known_locations)
    end
  end

  def update(conn, %{"search_id" => search_id, "id" => volunteer_id, "status" => status}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, volunteer} <- Volunteers.get_volunteer_in_search(search_id, volunteer_id),
         {:ok, updated} <- Volunteers.set_status(volunteer, status) do
      last_location = Locations.last_known_for_volunteer(search_id, updated.id)
      render(conn, :show, volunteer: updated, last_location: last_location)
    end
  end

  def update(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{status: ["can't be blank"]}})
  end
end
