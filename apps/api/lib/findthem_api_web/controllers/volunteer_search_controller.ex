defmodule FindThemApiWeb.VolunteerSearchController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Zones}

  action_fallback FindThemApiWeb.FallbackController

  def show(conn, _params) do
    volunteer = conn.assigns.current_volunteer

    with {:ok, search} <- Searches.get_search(volunteer.search_id) do
      zones = Zones.list_by_search(volunteer.search_id)
      generation = Searches.latest_generation(volunteer.search_id)

      render(conn, :show, search: search, zones: zones, generation: generation)
    end
  end
end
