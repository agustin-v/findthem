defmodule FindThemApiWeb.VolunteerSessionController do
  use FindThemApiWeb, :controller

  def show(conn, _params) do
    volunteer = conn.assigns.current_volunteer
    json(conn, %{id: volunteer.id, status: volunteer.status, name: volunteer.name})
  end
end
