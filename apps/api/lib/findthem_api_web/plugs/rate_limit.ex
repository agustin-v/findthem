defmodule FindThemApiWeb.Plugs.RateLimit do
  @moduledoc """
  ~10 req/min per client IP, scoped by a `:bucket` opt so different route
  groups (e.g. join vs. future public endpoints) don't share one counter.

  Two known, accepted tradeoffs:

  - Uses Hammer's default fixed-window algorithm, which allows up to ~2x
    the limit right at a window boundary. Fine for coarse abuse
    prevention on a low-value public endpoint; switch to
    `algorithm: :sliding_window` if that ever matters here.
  - Keys off `conn.remote_ip` directly (deliberately — trusting
    X-Forwarded-For from an untrusted source would make this trivially
    bypassable). If apps/api ends up behind a reverse proxy/load balancer
    in prod, this needs the proxy to preserve the real client IP (PROXY
    protocol, or a proxy-aware remote-ip plug fed only from a trusted
    source) — otherwise every request collapses onto the proxy's IP and
    a handful of volunteers opening the same join link within a minute
    would 429 each other. Confirm this before relying on it in prod.
  """

  import Plug.Conn

  alias FindThemApi.RateLimit

  @limit 10
  @scale :timer.minutes(1)

  def init(opts), do: opts

  def call(conn, opts) do
    bucket = Keyword.get(opts, :bucket, "default")
    key = "#{bucket}:#{client_ip(conn)}"

    case RateLimit.hit(key, @scale, @limit) do
      {:allow, _count} ->
        conn

      {:deny, retry_after_ms} ->
        conn
        |> put_resp_header("retry-after", Integer.to_string(div(retry_after_ms, 1000)))
        |> put_status(:too_many_requests)
        |> Phoenix.Controller.json(%{error: "rate_limited"})
        |> halt()
    end
  end

  defp client_ip(%Plug.Conn{remote_ip: ip}), do: ip |> :inet.ntoa() |> to_string()
end
