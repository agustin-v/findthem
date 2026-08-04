# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :findthem_api,
  namespace: FindThemApi,
  ecto_repos: [FindThemApi.Repo],
  generators: [timestamp_type: :utc_datetime, binary_id: true]

# Configure the endpoint
config :findthem_api, FindThemApiWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: FindThemApiWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: FindThemApi.PubSub,
  live_view: [signing_salt: "ey70yGGa"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Swapped for FindThemApi.Geo.ClientMock in config/test.exs (Mox) so tests
# never hit the real geo service.
config :findthem_api, :geo_client, FindThemApi.Geo.Client

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
