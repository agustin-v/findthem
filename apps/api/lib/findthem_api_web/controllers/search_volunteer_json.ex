defmodule FindThemApiWeb.SearchVolunteerJSON do
  def index(%{volunteers: volunteers}) do
    %{data: Enum.map(volunteers, &volunteer_data/1)}
  end

  def show(%{volunteer: volunteer}) do
    %{data: volunteer_data(volunteer)}
  end

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted %Volunteer{}
  # struct the same way, instead of pushing it raw (which won't JSON-encode).
  def volunteer_data({%FindThemApi.Volunteers.Volunteer{} = volunteer, segments_searched}) do
    volunteer |> base() |> Map.put(:segments_searched, segments_searched)
  end

  def volunteer_data(%FindThemApi.Volunteers.Volunteer{} = volunteer) do
    volunteer |> base() |> Map.put(:segments_searched, nil)
  end

  defp base(volunteer) do
    %{
      id: volunteer.id,
      name: volunteer.name,
      phone: volunteer.phone,
      resource_type: volunteer.resource_type,
      status: volunteer.status,
      last_active_at: volunteer.last_active_at,
      joined_at: volunteer.joined_at,
      approved_at: volunteer.approved_at,
      removed_at: volunteer.removed_at
    }
  end
end
