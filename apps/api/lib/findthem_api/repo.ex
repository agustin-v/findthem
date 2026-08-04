defmodule FindThemApi.Repo do
  use Ecto.Repo,
    otp_app: :findthem_api,
    adapter: Ecto.Adapters.Postgres
end
