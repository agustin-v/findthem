import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/findthem_api start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :findthem_api, FindThemApiWeb.Endpoint, server: true
end

config :findthem_api, FindThemApiWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "4000"))]

# CORS_ORIGINS is a comma-separated list, e.g. "http://localhost:5173,https://app.example.com".
# Required in prod (fail fast, same as DATABASE_URL/SECRET_KEY_BASE below).
# When unset outside prod, allow any localhost port via regex rather than an
# ever-growing hardcoded list — apps/ui (Vite) and apps/mobile (Expo) both
# auto-bump to the next free port when their default is taken, which would
# otherwise silently re-break this exact-match allowlist. Native iOS/Android
# builds aren't subject to CORS at all; only browser targets need this.
cors_origins =
  case System.get_env("CORS_ORIGINS") do
    nil ->
      if config_env() == :prod do
        raise """
        environment variable CORS_ORIGINS is missing.
        For example: CORS_ORIGINS=https://app.example.com
        """
      end

      [~r{^http://localhost:\d+$}]

    value ->
      String.split(value, ",", trim: true)
  end

config :findthem_api, :cors_origins, cors_origins

# Clerk issuer + JWKS URL aren't secret (they're embedded in every session JWT / the
# publishable key); dev defaults point at the FindThem dev Clerk instance.
config :findthem_api, :clerk,
  issuer: System.get_env("CLERK_ISSUER", "https://polished-grizzly-42.clerk.accounts.dev"),
  authorized_parties:
    System.get_env("CLERK_AUTHORIZED_PARTIES", "http://localhost:5173")
    |> String.split(",", trim: true)

# Shared secret gating the geo proxy (Story 14) — never call geo from the browser directly.
config :findthem_api, :geo,
  url: System.get_env("GEO_URL", "http://localhost:8000"),
  internal_token: System.get_env("GEO_INTERNAL_TOKEN")

# Subject-photo storage (Story 27) — R2 is S3-compatible, so ex_aws_s3 talks
# to it unmodified via a custom :s3 host/scheme. Uploads are proxied through
# this app (browser never talks to R2 directly, same "never call the
# external service directly" shape as the geo proxy above) — the browser
# posts multipart form data to us, we PUT it to R2 with our own credentials,
# and we hand back short-lived presigned GET URLs when serving photos back
# to a coordinator, so the bucket itself stays fully private.
config :findthem_api, :r2, bucket: System.get_env("R2_BUCKET")

r2_account_id = System.get_env("R2_ACCOUNT_ID")

config :ex_aws,
  access_key_id: System.get_env("R2_ACCESS_KEY_ID"),
  secret_access_key: System.get_env("R2_SECRET_ACCESS_KEY"),
  region: "auto",
  json_codec: Jason

if r2_account_id do
  config :ex_aws, :s3,
    scheme: "https://",
    host: "#{r2_account_id}.r2.cloudflarestorage.com",
    region: "auto"
end

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :findthem_api, FindThemApi.Repo,
    # ssl: true,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    # For machines with several cores, consider starting multiple pools of `pool_size`
    # pool_count: 4,
    socket_options: maybe_ipv6

  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :findthem_api, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :findthem_api, FindThemApiWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      # See the documentation on https://bandit.hexdocs.pm/Bandit.html#t:options/0
      # for details about using IPv6 vs IPv4 and loopback vs public addresses.
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :findthem_api, FindThemApiWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://plug.hexdocs.pm/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :findthem_api, FindThemApiWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.
end
