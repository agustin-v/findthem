defmodule FindThemApiWeb.VolunteerSegmentController do
  use FindThemApiWeb, :controller

  alias FindThemApi.Segments

  action_fallback FindThemApiWeb.FallbackController

  def update(conn, %{"segment_id" => segment_id_param} = params) do
    volunteer = conn.assigns.current_volunteer

    with {:ok, segment_id} <- parse_segment_id(segment_id_param) do
      attrs =
        params
        |> Map.take(["status"])
        |> Map.put("searched_by_volunteer_id", volunteer.id)

      with {:ok, segment} <-
             Segments.update_segment_status(volunteer.search_id, segment_id, attrs,
               actor: :volunteer
             ) do
        conn
        |> put_view(json: FindThemApiWeb.VolunteerSearchJSON)
        |> render(:show, segment: segment, volunteer_id: volunteer.id)
      end
    end
  end

  defp parse_segment_id(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} -> {:ok, int}
      _ -> {:error, :invalid_segment_id}
    end
  end
end
