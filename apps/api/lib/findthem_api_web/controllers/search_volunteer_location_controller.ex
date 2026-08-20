defmodule FindThemApiWeb.SearchVolunteerLocationController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Volunteers, Locations}

  action_fallback FindThemApiWeb.FallbackController

  # Requires the volunteer to actually belong to this (owner-verified)
  # search — same defense-in-depth as SearchVolunteerController's own
  # update/2 — so a real volunteer_id from a different search isn't
  # reachable through a foreign search_id in the path.
  def index(conn, %{"search_id" => search_id, "volunteer_id" => volunteer_id}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, volunteer} <- Volunteers.get_volunteer_in_search(search_id, volunteer_id) do
      locations = Locations.list_trail(volunteer)
      render(conn, :index, locations: locations)
    end
  end
end
