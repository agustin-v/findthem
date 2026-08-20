defmodule FindThemApiWeb.VolunteerSearchController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Segments, SegmentAssignments, Remarks}

  action_fallback FindThemApiWeb.FallbackController

  def show(conn, _params) do
    volunteer = conn.assigns.current_volunteer

    with {:ok, search} <- Searches.get_search(volunteer.search_id) do
      segments = Segments.list_by_search(volunteer.search_id)
      generation = Searches.latest_generation(volunteer.search_id)

      my_segment_ids =
        SegmentAssignments.list_segment_ids_for_volunteer(volunteer.search_id, volunteer.id)

      # Every remark on the search, not just this volunteer's own — Story 37
      # broadens remarks into a shared board every volunteer (and the
      # coordinator) sees, same as SearchChannel's own unfiltered relay of
      # remark_created. apps/mobile only renders the ones with a lat/lng.
      remarks = Remarks.list_by_search(volunteer.search_id)

      render(conn, :show,
        search: search,
        segments: segments,
        generation: generation,
        my_segment_ids: my_segment_ids,
        remarks: remarks,
        consent_location: volunteer.consent_location
      )
    end
  end
end
