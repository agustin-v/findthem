defmodule FindThemApiWeb.VolunteerZoneController do
  use FindThemApiWeb, :controller

  alias FindThemApi.Zones

  action_fallback FindThemApiWeb.FallbackController

  def update(conn, %{"h3_index" => h3_index} = params) do
    volunteer = conn.assigns.current_volunteer

    attrs =
      params
      |> Map.take(["status"])
      |> Map.put("searched_by_volunteer_id", volunteer.id)

    with {:ok, zone} <- Zones.upsert_zone(volunteer.search_id, h3_index, attrs) do
      conn
      |> put_view(json: FindThemApiWeb.ZoneJSON)
      |> render(:show, zone: zone)
    end
  end
end
