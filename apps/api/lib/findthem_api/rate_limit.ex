defmodule FindThemApi.RateLimit do
  use Hammer, backend: :ets
end
