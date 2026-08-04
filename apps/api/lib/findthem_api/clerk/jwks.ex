defmodule FindThemApi.Clerk.Jwks do
  @moduledoc """
  Fetches and caches signers from a JWKS endpoint, keyed by `{jwks_url, kid}` so
  concurrent tests pointed at different Bypass servers never collide.
  """

  @table :clerk_jwks_cache
  @ttl_ms :timer.minutes(10)

  def get_signer(jwks_url, kid) do
    case lookup(jwks_url, kid) do
      {:ok, signer} -> {:ok, signer}
      :miss -> fetch_and_cache(jwks_url, kid)
    end
  end

  defp lookup(jwks_url, kid) do
    ensure_table()

    case :ets.lookup(@table, {jwks_url, kid}) do
      [{_, signer, cached_at}] ->
        if System.monotonic_time(:millisecond) - cached_at < @ttl_ms,
          do: {:ok, signer},
          else: :miss

      [] ->
        :miss
    end
  end

  defp fetch_and_cache(jwks_url, kid) do
    with {:ok, %{status: 200, body: %{"keys" => keys}}} <- Req.get(jwks_url),
         jwk when is_map(jwk) <- Enum.find(keys, &(&1["kid"] == kid)) do
      signer = Joken.Signer.create("RS256", jwk)
      ensure_table()
      :ets.insert(@table, {{jwks_url, kid}, signer, System.monotonic_time(:millisecond)})
      {:ok, signer}
    else
      _ -> {:error, :signer_not_found}
    end
  end

  defp ensure_table do
    :ets.new(@table, [:named_table, :public, :set])
  rescue
    ArgumentError -> :ok
  end
end
