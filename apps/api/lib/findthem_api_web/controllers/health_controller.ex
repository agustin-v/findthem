defmodule FindThemApiWeb.HealthController do
  use FindThemApiWeb, :controller

  def index(conn, _params) do
    json(conn, %{status: "ok"})
  end
end
