defmodule FindThemApiWeb.Plugs.VolunteerToken do
  @moduledoc """
  Verifies a volunteer's Bearer token and loads the row, regardless of
  status — used only by GET /volunteer/session so a pending (or removed)
  volunteer can poll their own status. Everything else uses VolunteerAuth,
  which additionally requires status == "approved".
  """

  import Plug.Conn

  alias FindThemApi.Volunteers

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, volunteer} <- Volunteers.verify_token(conn, token) do
      assign(conn, :current_volunteer, volunteer)
    else
      _ -> unauthorized(conn)
    end
  end

  defp unauthorized(conn) do
    conn
    |> put_status(:unauthorized)
    |> Phoenix.Controller.json(%{error: "unauthorized"})
    |> halt()
  end
end
