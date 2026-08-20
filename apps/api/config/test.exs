import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :findthem_api, FindThemApi.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "findthem_api_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :findthem_api, FindThemApiWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "8eYiU/N/a82bX8mMzgsITJ47wY+sK7BZIopfNulM31mVmn71zshZVf7TyQL6GOYO",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Mox — tests must never hit the real geo service.
config :findthem_api, :geo_client, FindThemApi.Geo.ClientMock

# Mox — tests must never hit real R2.
config :findthem_api, :photo_storage, FindThemApi.Photos.StorageMock

# The Sandbox is :manual mode per-test (test_helper.exs) — a background
# process making its own Repo calls has nothing to check it out of.
config :findthem_api, :start_location_retention_job, false

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
