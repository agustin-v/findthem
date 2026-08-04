defmodule FindThemApiWeb.VolunteerSearchJSON do
  # No photos, no coordinator PII beyond contact_phone, no join_token.
  def show(%{search: search, zones: zones, generation: generation}) do
    %{
      data: %{
        search: search_data(search),
        zones: Enum.map(zones, &zone_data/1),
        generation: generation_data(generation)
      }
    }
  end

  defp search_data(search) do
    %{
      id: search.id,
      subject_type: search.subject_type,
      subject_name: search.subject_name,
      subject_details: search.subject_details,
      status: search.status,
      contact_phone: search.contact_phone,
      lkp_lat: search.lkp_lat,
      lkp_lng: search.lkp_lng,
      lkp_address: search.lkp_address,
      lkp_at: search.lkp_at,
      radius_km: search.radius_km,
      h3_resolution: search.h3_resolution
    }
  end

  defp zone_data(zone) do
    %{
      h3_index: zone.h3_index,
      status: zone.status,
      segment_id: zone.segment_id,
      searched_at: zone.searched_at
    }
  end

  defp generation_data(nil), do: nil

  defp generation_data(generation) do
    %{
      id: generation.id,
      meta: generation.meta,
      response: generation.response,
      inserted_at: generation.inserted_at
    }
  end
end
