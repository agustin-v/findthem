defmodule FindThemApiWeb.ZoneController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Zones}

  action_fallback FindThemApiWeb.FallbackController

  def index(conn, %{"search_id" => search_id}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      zones = Zones.list_by_search(search_id)
      render(conn, :index, zones: zones)
    end
  end

  def update(conn, %{"search_id" => search_id, "h3_index" => h3_index} = params) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, zone} <- Zones.upsert_zone(search_id, h3_index, Map.take(params, ["status"])) do
      render(conn, :show, zone: zone)
    end
  end
end
