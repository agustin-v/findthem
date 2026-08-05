defmodule FindThemApiWeb.VolunteerSearchJSON do
  # No photos, no coordinator PII beyond contact_phone, no join_token.
  def show(%{search: search, segments: segments, generation: generation, my_segment_ids: my_segment_ids}) do
    %{
      data: %{
        search: search_data(search),
        segments: Enum.map(segments, &segment_data/1),
        generation: generation_data(generation),
        my_segment_ids: my_segment_ids
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

  defp segment_data(segment) do
    %{
      segment_id: segment.segment_id,
      status: segment.status,
      searched_at: segment.searched_at
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
