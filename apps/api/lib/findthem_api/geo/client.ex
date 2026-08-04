defmodule FindThemApi.Geo.Client do
  @moduledoc """
  Real HTTP client for apps/geo's `POST /api/v1/segments/generate`.

  No retry — a slow/unavailable geo response should surface immediately as
  a 503 to the coordinator, not silently double the wait behind a hidden
  retry (mirrors apps/geo's own no-retry-on-Overpass philosophy).
  """

  require Logger

  @behaviour FindThemApi.Geo.ClientBehaviour

  @receive_timeout :timer.minutes(2)

  @impl true
  def generate_segments(params) do
    config = Application.get_env(:findthem_api, :geo, [])
    base_url = Keyword.fetch!(config, :url)
    token = Keyword.get(config, :internal_token)

    headers = if token, do: [{"x-internal-token", token}], else: []

    case Req.post(base_url <> "/api/v1/segments/generate",
           json: params,
           headers: headers,
           receive_timeout: @receive_timeout,
           retry: false
         ) do
      {:ok, %Req.Response{status: 200, body: body}} ->
        {:ok, body}

      {:ok, %Req.Response{status: 503}} ->
        {:error, :geo_unavailable}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, {status, body}}

      {:error, %Req.TransportError{} = error} ->
        Logger.warning("geo request failed: #{inspect(error)}")
        {:error, :geo_unavailable}

      {:error, reason} ->
        {:error, reason}
    end
  end
end
