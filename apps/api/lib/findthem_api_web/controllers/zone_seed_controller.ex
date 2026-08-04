defmodule FindThemApiWeb.ZoneSeedController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Zones}

  action_fallback FindThemApiWeb.FallbackController

  # Same format check as Zone.changeset — see the comment there. insert_all
  # bypasses changesets entirely, so this endpoint needs its own guard.
  @h3_index_format ~r/^[0-9a-fA-F]{15}$/

  # Bulk-creates zone rows from a geo segmentation response (called by
  # apps/ui right after generating segments) so the volunteer app has
  # something to render before anyone has PATCHed a cell by hand.
  def create(conn, %{"search_id" => search_id, "cells" => cells}) when is_list(cells) do
    with {:ok, search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, prepared} <- prepare_cells(cells) do
      {:ok, count} = Zones.seed_zones(search.id, prepared)
      json(conn, %{data: %{seeded: count}})
    end
  end

  # Catches both a missing `cells` key and a present-but-wrong-type one
  # (e.g. a string instead of a list) — the first clause's `is_list(cells)`
  # guard only matches the well-formed case, so anything else lands here.
  def create(conn, %{"search_id" => _search_id}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{cells: ["must be a list"]}})
  end

  defp prepare_cells(cells) do
    cells
    |> Enum.reduce_while({:ok, []}, fn
      %{"h3_index" => h3_index, "segment_id" => segment_id}, {:ok, acc}
      when is_binary(h3_index) and (is_binary(segment_id) or is_integer(segment_id)) ->
        if Regex.match?(@h3_index_format, h3_index) do
          {:cont, {:ok, [%{h3_index: h3_index, segment_id: segment_id} | acc]}}
        else
          {:halt, {:error, :invalid_cells}}
        end

      _invalid, _acc ->
        {:halt, {:error, :invalid_cells}}
    end)
    |> case do
      {:ok, acc} -> {:ok, Enum.reverse(acc)}
      error -> error
    end
  end
end
