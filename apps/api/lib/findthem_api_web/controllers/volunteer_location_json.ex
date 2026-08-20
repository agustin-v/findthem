defmodule FindThemApiWeb.VolunteerLocationJSON do
  def show(%{location: location}) do
    %{data: location_data(location)}
  end

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted
  # %VolunteerLocation{} struct the same way, instead of pushing it raw.
  def location_data(location) do
    %{
      id: location.id,
      volunteer_id: location.volunteer_id,
      lat: location.lat,
      lng: location.lng,
      recorded_at: location.recorded_at
    }
  end
end
