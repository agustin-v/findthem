defmodule FindThemApiWeb.SearchVolunteerJSON do
  def index(%{volunteers: volunteers, last_known_locations: last_known_locations}) do
    %{data: Enum.map(volunteers, &volunteer_data(&1, last_known_locations))}
  end

  def show(%{volunteer: volunteer, last_location: last_location}) do
    %{data: volunteer_data(volunteer, last_location)}
  end

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted %Volunteer{}
  # struct the same way, instead of pushing it raw (which won't JSON-encode).
  #
  # Takes the volunteer's current last-known %VolunteerLocation{} (or nil)
  # as an explicit argument — this module never queries the DB itself
  # (matching every other *_json.ex in this codebase, all pure shaping);
  # the caller fetches it first via Locations.last_known_for_volunteer/2.
  # A static/omitted last_location here would be worse than an extra
  # query: a coordinator's frontend receiving a volunteer_updated push
  # with a stale or missing last_location could wipe a still-consenting,
  # still-tracked volunteer's live dot on an unrelated event (e.g.
  # another approve/remove touching this same volunteer).
  def volunteer_data(%FindThemApi.Volunteers.Volunteer{} = volunteer, last_location) do
    volunteer
    |> base()
    |> Map.put(:segments_searched, nil)
    |> Map.put(:last_location, location_payload(volunteer, last_location))
  end

  # index/1's variant — a whole search's last-known positions were already
  # loaded in bulk (Locations.last_known_by_search/1) rather than fetched
  # per volunteer, so this looks the volunteer up in that map instead of
  # taking one location directly.
  def volunteer_data(
        {%FindThemApi.Volunteers.Volunteer{} = volunteer, segments_searched},
        last_known_locations
      ) do
    volunteer
    |> base()
    |> Map.put(:segments_searched, segments_searched)
    |> Map.put(
      :last_location,
      location_payload(volunteer, Map.get(last_known_locations, volunteer.id))
    )
  end

  # nil whenever consent_location is currently false, even if older pings
  # exist from before consent was withdrawn — the coordinator's live-dot
  # view should only ever reflect present consent, not history.
  defp location_payload(%{consent_location: false}, _location), do: nil
  defp location_payload(_volunteer, nil), do: nil

  defp location_payload(_volunteer, location) do
    %{lat: location.lat, lng: location.lng, recorded_at: location.recorded_at}
  end

  defp base(volunteer) do
    %{
      id: volunteer.id,
      name: volunteer.name,
      phone: volunteer.phone,
      resource_type: volunteer.resource_type,
      status: volunteer.status,
      consent_location: volunteer.consent_location,
      last_active_at: volunteer.last_active_at,
      joined_at: volunteer.joined_at,
      approved_at: volunteer.approved_at,
      removed_at: volunteer.removed_at
    }
  end
end
