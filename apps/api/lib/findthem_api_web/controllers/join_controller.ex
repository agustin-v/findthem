defmodule FindThemApiWeb.JoinController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Volunteers}

  @volunteer_fields ~w(name phone resource_type consent_name consent_location consent_phone)

  action_fallback FindThemApiWeb.FallbackController

  def preview(conn, %{"code" => code}) do
    with {:ok, search} <- Searches.get_by_join_token(code) do
      render(conn, :preview, search: search)
    end
  end

  def create(conn, %{"code" => code} = params) do
    with {:ok, search} <- Searches.get_by_join_token(code),
         {:ok, volunteer} <-
           Volunteers.join_volunteer(search.id, Map.take(params, @volunteer_fields)) do
      token = Phoenix.Token.sign(conn, "volunteer", volunteer.id, max_age: 60 * 60 * 24 * 7)

      conn
      |> put_status(:created)
      |> render(:created, volunteer: volunteer, token: token)
    end
  end

  # Public, unauthenticated endpoint — a missing "code" must not crash.
  def create(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{code: ["can't be blank"]}})
  end
end
