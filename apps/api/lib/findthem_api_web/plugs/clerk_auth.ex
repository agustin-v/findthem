defmodule FindThemApiWeb.Plugs.ClerkAuth do
  @moduledoc """
  Verifies the `Authorization: Bearer <token>` header against Clerk, lazily
  provisions the user, and assigns it to `conn.assigns.current_user`.
  """

  import Plug.Conn

  alias FindThemApi.Accounts
  alias FindThemApi.Clerk.Token

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, claims} <- Token.verify_token(token),
         {:ok, user} <-
           Accounts.get_or_provision(claims["sub"], %{
             email: claims["email"],
             name: claims["name"]
           }) do
      assign(conn, :current_user, user)
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
