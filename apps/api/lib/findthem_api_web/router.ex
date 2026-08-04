defmodule FindThemApiWeb.Router do
  use FindThemApiWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated do
    plug FindThemApiWeb.Plugs.ClerkAuth
  end

  pipeline :join_rate_limited do
    plug FindThemApiWeb.Plugs.RateLimit, bucket: "join"
  end

  scope "/", FindThemApiWeb do
    pipe_through :api

    get "/health", HealthController, :index
  end

  scope "/", FindThemApiWeb do
    pipe_through [:api, :join_rate_limited]

    get "/join/:code/preview", JoinController, :preview
    post "/join", JoinController, :create
  end

  scope "/api", FindThemApiWeb do
    pipe_through [:api, :authenticated]

    get "/me", MeController, :show

    resources "/searches", SearchController, only: [:index, :show, :create] do
      resources "/zones", ZoneController, only: [:index, :update], param: "h3_index"
      resources "/remarks", RemarkController, only: [:index, :create]
    end
  end

  # Enable LiveDashboard in development
  if Application.compile_env(:findthem_api, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      live_dashboard "/dashboard", metrics: FindThemApiWeb.Telemetry
    end
  end
end
