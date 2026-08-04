defmodule FindThemApi.Searches do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches.{Generation, Search, Zone}
  alias FindThemApi.Volunteers.Volunteer

  def list_searches_by_owner(owner_id) do
    Search
    |> where(owner_id: ^owner_id)
    |> Repo.all()
  end

  def get_search!(id), do: Repo.get!(Search, id)

  def get_search(id) do
    case Repo.get(Search, id) do
      nil -> {:error, :not_found}
      search -> {:ok, search}
    end
  rescue
    Ecto.Query.CastError -> {:error, :not_found}
  end

  def get_search_for_owner(owner_id, id) do
    case Repo.get(Search, id) do
      %Search{owner_id: ^owner_id} = search -> {:ok, search}
      _ -> {:error, :not_found}
    end
  rescue
    Ecto.Query.CastError -> {:error, :not_found}
  end

  # Single query, single branch — a bad token and a token for a non-active
  # search look identical to the caller, so neither leaks which is which.
  def get_by_join_token(token) do
    case Repo.get_by(Search, join_token: token, status: "active") do
      nil -> {:error, :not_found}
      search -> {:ok, search}
    end
  end

  def create_search(owner_id, attrs) do
    attrs =
      attrs
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      |> Map.put("owner_id", owner_id)
      |> Map.put_new_lazy("join_token", &generate_join_token/0)

    %Search{}
    |> Search.changeset(attrs)
    |> Repo.insert()
    |> broadcast(:search_created)
  end

  def update_search(%Search{} = search, attrs) do
    search
    |> Search.changeset(attrs)
    |> Repo.update()
    |> broadcast(:search_updated)
  end

  # Retried once on a join_token collision (astronomically unlikely — 40 bits
  # of CSPRNG entropy — but cheap to guard, matching Zones.upsert_zone's
  # retry-once pattern for its own unique-constraint race).
  #
  # Known, accepted tradeoff: two concurrent rotate calls (e.g. a
  # double-clicked "Rotate" button) both succeed, serialized by Postgres —
  # whichever commits last wins, and the HTTP response returned to the
  # earlier caller can already be stale by the time it's read. This doesn't
  # corrupt data (single-field blind overwrite, not a multi-field lost
  # update) and locking the row wouldn't fix the stale-response race anyway
  # since it's a response-ordering issue, not a consistency one. Worth an
  # idempotency-key design if this ever matters in practice; not needed for
  # a low-frequency coordinator action today.
  def rotate_join_token(%Search{} = search, retry? \\ true) do
    case update_search(search, %{"join_token" => generate_join_token()}) do
      {:error, %Ecto.Changeset{} = changeset} = error ->
        if retry? and Keyword.has_key?(changeset.errors, :join_token) do
          rotate_join_token(search, false)
        else
          error
        end

      result ->
        result
    end
  end

  def latest_generation(search_id) do
    Repo.one(
      from(g in Generation,
        where: g.search_id == ^search_id,
        order_by: [desc: g.inserted_at],
        limit: 1
      )
    )
  end

  def aggregates_for(%Search{id: search_id}) do
    approved_counts =
      from(v in Volunteer,
        where: v.search_id == ^search_id and v.status == "approved",
        group_by: v.resource_type,
        select: {v.resource_type, count(v.id)}
      )
      |> Repo.all()
      |> Map.new()

    volunteer_count = approved_counts |> Map.values() |> Enum.sum()

    pending_count =
      Repo.one(
        from(v in Volunteer,
          where: v.search_id == ^search_id and v.status == "pending",
          select: count(v.id)
        )
      )

    total_zones = Repo.one(from(z in Zone, where: z.search_id == ^search_id, select: count()))

    zones_searched =
      Repo.one(
        from(z in Zone,
          where: z.search_id == ^search_id and z.status == "searched",
          select: count()
        )
      )

    last_generation = latest_generation(search_id)

    %{
      volunteer_count: volunteer_count,
      pending_count: pending_count,
      approved_counts: approved_counts,
      zones_searched: zones_searched,
      total_zones: total_zones,
      rebalance_suggested: rebalance_suggested?(volunteer_count, approved_counts, last_generation)
    }
  end

  defp rebalance_suggested?(0, _approved_counts, _last_generation), do: false
  defp rebalance_suggested?(_approved_total, _approved_counts, nil), do: false

  defp rebalance_suggested?(_approved_total, approved_counts, %Generation{
         request_params: request_params
       }) do
    requested =
      (request_params["resources"] || [])
      |> Map.new(fn %{"type" => type, "count" => count} -> {type, count} end)

    approved_counts != requested
  end

  defp broadcast({:ok, %Search{} = search} = result, event) do
    Phoenix.PubSub.broadcast(FindThemApi.PubSub, "search:#{search.id}", {event, search})
    result
  end

  defp broadcast(error, _event), do: error

  defp generate_join_token do
    :crypto.strong_rand_bytes(5) |> Base.encode32()
  end
end
