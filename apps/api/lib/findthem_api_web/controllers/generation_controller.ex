defmodule FindThemApiWeb.GenerationController do
  use FindThemApiWeb, :controller

  alias FindThemApi.Searches

  action_fallback FindThemApiWeb.FallbackController

  # The synchronous segmentation proxy — also how a coordinator rebalances
  # (same endpoint, typically called again with no body so resources default
  # to current approved volunteer counts).
  def create(conn, %{"search_id" => search_id} = params) do
    with {:ok, search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, generation} <- Searches.generate(search, Map.delete(params, "search_id")) do
      conn
      |> put_status(:created)
      |> json(%{data: generation_data(generation)})
    end
  end

  def latest(conn, %{"search_id" => search_id}) do
    with {:ok, search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      data =
        case Searches.latest_generation(search.id) do
          nil -> nil
          generation -> generation_data(generation)
        end

      json(conn, %{data: data})
    end
  end

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted
  # %Generation{} struct the same way, instead of pushing it raw (which
  # won't JSON-encode).
  def generation_data(generation) do
    %{
      id: generation.id,
      meta: generation.meta,
      response: generation.response,
      inserted_at: generation.inserted_at
    }
  end
end
