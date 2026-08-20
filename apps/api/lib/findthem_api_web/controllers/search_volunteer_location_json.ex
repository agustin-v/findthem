defmodule FindThemApiWeb.SearchVolunteerLocationJSON do
  def index(%{locations: locations}) do
    %{data: Enum.map(locations, &location_data/1)}
  end

  defp location_data(location) do
    %{
      id: location.id,
      lat: location.lat,
      lng: location.lng,
      recorded_at: location.recorded_at
    }
  end
end
