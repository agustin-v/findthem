defmodule FindThemApiWeb.VolunteerLocationController do
  use FindThemApiWeb, :controller

  alias FindThemApi.Locations

  @location_fields ~w(lat lng recorded_at)

  action_fallback FindThemApiWeb.FallbackController

  def create(conn, params) do
    volunteer = conn.assigns.current_volunteer
    attrs = Map.take(params, @location_fields)

    with {:ok, location} <- Locations.record_ping(volunteer, attrs) do
      conn
      |> put_status(:created)
      |> render(:show, location: location)
    end
  end
end
