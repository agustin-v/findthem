defmodule FindThemApiWeb.FallbackController do
  use FindThemApiWeb, :controller

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

  def call(conn, {:error, :invalid_cells}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      errors: %{cells: ["each entry must have a 15-character hex h3_index and a segment_id"]}
    })
  end
end
