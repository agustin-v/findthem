defmodule FindThemApiWeb.RemarkController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Remarks}

  action_fallback FindThemApiWeb.FallbackController

  def index(conn, %{"search_id" => search_id}) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      remarks = Remarks.list_by_search(search_id)
      render(conn, :index, remarks: remarks)
    end
  end

  def create(conn, %{"search_id" => search_id, "remark" => remark_params})
      when is_map(remark_params) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, remark} <- Remarks.create_map_remark(search_id, remark_params) do
      conn
      |> put_status(:created)
      |> render(:show, remark: remark)
    end
  end

  # A missing OR malformed (non-map) "remark" value must not crash — same
  # guard VolunteerRemarkController already has.
  def create(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{remark: ["can't be blank"]}})
  end
end
