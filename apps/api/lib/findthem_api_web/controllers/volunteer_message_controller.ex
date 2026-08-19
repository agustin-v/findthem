defmodule FindThemApiWeb.VolunteerMessageController do
  use FindThemApiWeb, :controller

  alias FindThemApi.Messages

  action_fallback FindThemApiWeb.FallbackController

  def index(conn, _params) do
    volunteer = conn.assigns.current_volunteer
    messages = Messages.list_by_search_and_volunteer(volunteer.search_id, volunteer.id)

    conn
    |> put_view(json: FindThemApiWeb.MessageJSON)
    |> render(:index, messages: messages)
  end

  # volunteer_id and sender are always forced server-side from the
  # authenticated identity, never trusted from the request body — same
  # reasoning as VolunteerRemarkController.
  def create(conn, %{"message" => message_params}) when is_map(message_params) do
    volunteer = conn.assigns.current_volunteer

    attrs =
      message_params
      |> Map.take(["id", "text"])
      |> Map.put("volunteer_id", volunteer.id)
      |> Map.put("sender", "volunteer")

    with {:ok, message} <- Messages.create_message(volunteer.search_id, attrs) do
      conn
      |> put_status(:created)
      |> put_view(json: FindThemApiWeb.MessageJSON)
      |> render(:show, message: message)
    end
  end

  # Flaky offline clients — a missing OR malformed (non-map) "message" value must not crash.
  def create(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{message: ["can't be blank"]}})
  end
end
