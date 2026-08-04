defmodule FindThemApiWeb.VolunteerRemarkController do
  use FindThemApiWeb, :controller

  alias FindThemApi.Remarks

  @remark_fields ~w(id kind text lat lng reported_at)

  action_fallback FindThemApiWeb.FallbackController

  def create(conn, %{"remark" => remark_params}) when is_map(remark_params) do
    volunteer = conn.assigns.current_volunteer

    attrs =
      remark_params
      |> Map.take(@remark_fields)
      |> Map.put("volunteer_id", volunteer.id)

    with {:ok, remark} <- Remarks.create_remark(volunteer.search_id, attrs) do
      conn
      |> put_status(:created)
      |> put_view(json: FindThemApiWeb.RemarkJSON)
      |> render(:show, remark: remark)
    end
  end

  # Flaky offline clients — a missing OR malformed (non-map) "remark" value must not crash.
  def create(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{remark: ["can't be blank"]}})
  end
end
