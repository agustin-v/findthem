defmodule FindThemApiWeb.UserSocket do
  @moduledoc """
  Single websocket entry point for both coordinator and volunteer clients.

  The connect params carry one opaque `token` — no client-declared "I am a
  coordinator" flag, since that would just be an unverified claim. Instead
  we try each verification the same way the two HTTP auth plugs already do
  (FindThemApiWeb.Plugs.ClerkAuth, FindThemApiWeb.Plugs.VolunteerAuth) and
  the token's own signature decides which identity it proves.
  """

  use Phoenix.Socket

  channel "search:*", FindThemApiWeb.SearchChannel

  alias FindThemApi.Accounts
  alias FindThemApi.Clerk.Token, as: ClerkToken
  alias FindThemApi.Volunteers

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) when is_binary(token) and token != "" do
    case authenticate(token) do
      {:ok, identity} -> {:ok, assign(socket, :identity, identity)}
      :error -> :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(%{assigns: %{identity: {:coordinator, user}}}), do: "coordinator_socket:#{user.id}"
  def id(%{assigns: %{identity: {:volunteer, volunteer}}}), do: "volunteer_socket:#{volunteer.id}"

  defp authenticate(token) do
    case authenticate_coordinator(token) do
      {:ok, identity} -> {:ok, identity}
      :error -> authenticate_volunteer(token)
    end
  end

  defp authenticate_coordinator(token) do
    with {:ok, claims} <- ClerkToken.verify_token(token),
         {:ok, user} <-
           Accounts.get_or_provision(claims["sub"], %{
             email: claims["email"],
             name: claims["name"]
           }) do
      {:ok, {:coordinator, user}}
    else
      _ -> :error
    end
  end

  # Re-checks status == "approved" against the DB on every connect, same
  # as the HTTP VolunteerAuth plug — a removed volunteer's still-unexpired
  # token must not be able to open a socket either.
  defp authenticate_volunteer(token) do
    case Volunteers.verify_token(FindThemApiWeb.Endpoint, token) do
      {:ok, %Volunteers.Volunteer{status: "approved"} = volunteer} ->
        {:ok, {:volunteer, volunteer}}

      _ ->
        :error
    end
  end
end
