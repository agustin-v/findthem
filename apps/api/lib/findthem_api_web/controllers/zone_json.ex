defmodule FindThemApiWeb.ZoneJSON do
  def index(%{zones: zones}) do
    %{data: Enum.map(zones, &data/1)}
  end

  def show(%{zone: zone}) do
    %{data: data(zone)}
  end

  defp data(zone) do
    %{
      search_id: zone.search_id,
      h3_index: zone.h3_index,
      status: zone.status,
      segment_id: zone.segment_id,
      searched_at: zone.searched_at,
      searched_by_volunteer_id: zone.searched_by_volunteer_id
    }
  end
end
