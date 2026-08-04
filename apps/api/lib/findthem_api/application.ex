defmodule FindThemApi.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      FindThemApiWeb.Telemetry,
      FindThemApi.Repo,
      {DNSCluster, query: Application.get_env(:findthem_api, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: FindThemApi.PubSub},
      FindThemApi.RateLimit,
      # Start a worker by calling: FindThemApi.Worker.start_link(arg)
      # {FindThemApi.Worker, arg},
      # Start to serve requests, typically the last entry
      FindThemApiWeb.Endpoint
    ]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: FindThemApi.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    FindThemApiWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
