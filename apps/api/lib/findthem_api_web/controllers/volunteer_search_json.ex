defmodule FindThemApiWeb.VolunteerSearchJSON do
  alias FindThemApi.Photos

  # No coordinator PII beyond contact_phone, no join_token. photo_urls IS
  # included (subject photos, Story 27) — a volunteer searching for
  # someone needs to know what they look like; short-lived presigned URLs
  # generated the same way as the coordinator-facing SearchJSON.
  def show(%{
        search: search,
        segments: segments,
        generation: generation,
        my_segment_ids: my_segment_ids,
        remarks: remarks,
        consent_location: consent_location,
        volunteer_id: volunteer_id
      }) do
    %{
      data: %{
        search: search_data(search),
        segments: Enum.map(segments, &segment_data(&1, volunteer_id)),
        generation: generation_data(generation),
        my_segment_ids: my_segment_ids,
        remarks: Enum.map(remarks, &FindThemApiWeb.RemarkJSON.remark_data/1),
        # This volunteer's own consent, not the search's — Story 40's
        # foreground location reporting must never start if this is
        # false, however the volunteer joined (POST /join's client-side
        # form requires all three consents today, but that's a client
        # policy, not a server guarantee — a different or future client
        # could join with location consent declined while still
        # satisfying the server's actual required fields).
        consent_location: consent_location
      }
    }
  end

  # For VolunteerSegmentController's own PATCH response — must render this
  # volunteer's reduced segment shape, same as the bulk show/1 above and
  # the channel relay, never SegmentJSON's coordinator shape
  # (locked_by_user_id has no business reaching a volunteer device).
  def show(%{segment: segment, volunteer_id: volunteer_id}) do
    %{data: segment_data(segment, volunteer_id)}
  end

  defp search_data(search) do
    %{
      id: search.id,
      subject_type: search.subject_type,
      subject_name: search.subject_name,
      subject_details: search.subject_details,
      photo_urls: Photos.presigned_urls(search),
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

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted
  # %Segment{} struct the same way for a volunteer identity, instead of
  # SegmentJSON's coordinator shape (which carries locked_by_user_id — a
  # coordinator account id with no reason to reach a volunteer device).
  #
  # locked_for_me (not the raw locked_for_volunteer_id) so one volunteer's
  # id is never handed to another volunteer's device just to answer "can I
  # still work this" — the server answers that question directly instead.
  def segment_data(segment, volunteer_id) do
    %{
      segment_id: segment.segment_id,
      status: segment.status,
      searched_at: segment.searched_at,
      locked: not is_nil(segment.locked_at),
      locked_for_me:
        not is_nil(segment.locked_at) and segment.locked_for_volunteer_id == volunteer_id,
      # Unlike locked_for_volunteer_id, deliberately sent to every
      # volunteer, not only the one it's reserved for — it's coordinator
      # free text explaining why a segment is blocked ("bridge collapsed"),
      # and every volunteer on the search benefits from knowing why, not
      # just the one it names.
      lock_reason: segment.lock_reason
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
