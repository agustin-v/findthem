defmodule FindThemApiWeb.SearchJSON do
  alias FindThemApi.{Photos, Searches}

  def index(%{searches: searches}) do
    %{data: Enum.map(searches, &search_data/1)}
  end

  def show(%{search: search}) do
    %{data: search_data(search)}
  end

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted %Search{}
  # struct the same way, instead of pushing it raw (which won't JSON-encode).
  def search_data(search) do
    aggregates = Searches.aggregates_for(search)

    %{
      id: search.id,
      subject_type: search.subject_type,
      subject_name: search.subject_name,
      subject_details: search.subject_details,
      contact_phone: search.contact_phone,
      photo_urls: Photos.presigned_urls(search),
      status: search.status,
      lkp_lat: search.lkp_lat,
      lkp_lng: search.lkp_lng,
      lkp_address: search.lkp_address,
      lkp_at: search.lkp_at,
      radius_km: search.radius_km,
      h3_resolution: search.h3_resolution,
      join_token: search.join_token,
      outcome: search.outcome,
      closed_at: search.closed_at,
      inserted_at: search.inserted_at,
      updated_at: search.updated_at,
      volunteer_count: aggregates.volunteer_count,
      pending_count: aggregates.pending_count,
      approved_counts: aggregates.approved_counts,
      segments_searched: aggregates.segments_searched,
      total_segments: aggregates.total_segments,
      rebalance_suggested: aggregates.rebalance_suggested
    }
  end
end
