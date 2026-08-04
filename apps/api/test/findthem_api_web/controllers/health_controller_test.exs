defmodule FindThemApiWeb.HealthControllerTest do
  use FindThemApiWeb.ConnCase, async: true

  test "GET /health returns status ok", %{conn: conn} do
    conn = get(conn, ~p"/health")

    assert json_response(conn, 200) == %{"status" => "ok"}
  end
end
