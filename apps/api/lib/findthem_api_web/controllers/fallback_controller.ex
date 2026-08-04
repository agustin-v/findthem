defmodule FindThemApiWeb.FallbackController do
  use FindThemApiWeb, :controller
  require Logger

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> put_view(json: FindThemApiWeb.ChangesetJSON)
    |> render(:error, changeset: changeset)
  end

  def call(conn, {:error, :not_found}) do
    conn
    |> put_status(:not_found)
    |> put_view(json: FindThemApiWeb.ErrorJSON)
    |> render(:"404")
  end

  def call(conn, {:error, :invalid_status}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{status: ["must be approved or removed"]}})
  end

  def call(conn, {:error, :radius_km_required}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{radius_km: ["is required on the first generate call for a search"]}})
  end

  def call(conn, {:error, :geo_unavailable}) do
    conn
    |> put_status(:service_unavailable)
    |> json(%{errors: %{geo: ["Segmentation service is temporarily unavailable. Try again."]}})
  end

  # geo rejected the request itself (e.g. Pydantic validation) — surface its
  # status rather than masking it as a generic 500, but not its raw body
  # (internal implementation details, e.g. Pydantic error internals). Not
  # expected in normal operation since apps/api's own inputs are already
  # validated first.
  def call(conn, {:error, {status, body}}) when is_integer(status) do
    Logger.warning("geo rejected generate request: status=#{status} body=#{inspect(body)}")

    conn
    |> put_status(status)
    |> json(%{errors: %{geo: ["Segmentation request was rejected. Try again."]}})
  end
end
