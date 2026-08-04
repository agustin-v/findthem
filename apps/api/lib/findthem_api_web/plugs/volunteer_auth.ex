defmodule FindThemApiWeb.Plugs.VolunteerAuth do
  @moduledoc """
  Bearer -> verify -> reload the volunteer row from the DB -> reject unless
  status == "approved" -> touch last_active_at -> assign(:current_volunteer).

  The token is stateless, but every request re-checks status against the DB
  on purpose: removal/rejection must take effect immediately, not whenever
  the 7-day token happens to expire. Do not cache or skip this load.

  Downstream volunteer-facing controllers must scope all reads/writes to
  `conn.assigns.current_volunteer.search_id` — never accept a search_id
  from the request itself — so a volunteer can only ever touch their own
  search, by construction.
  """

  import Plug.Conn
  require Logger

  alias FindThemApi.Volunteers

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, %Volunteers.Volunteer{status: "approved"} = volunteer} <-
           Volunteers.verify_token(conn, token) do
      # Best-effort: a heartbeat write failing (transient DB hiccup) must
      # never turn into an auth failure for an already-legitimate volunteer.
      touch_last_active(volunteer)
      assign(conn, :current_volunteer, volunteer)
    else
      _ -> unauthorized(conn)
    end
  end

  defp touch_last_active(volunteer) do
    Volunteers.touch_last_active(volunteer)
  rescue
    error -> Logger.warning("volunteer last_active_at touch failed: #{inspect(error)}")
  end

  defp unauthorized(conn) do
    conn
    |> put_status(:unauthorized)
    |> Phoenix.Controller.json(%{error: "unauthorized"})
    |> halt()
  end
end
