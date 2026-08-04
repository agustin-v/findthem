defmodule FindThemApi.Geo.ClientBehaviour do
  @moduledoc """
  Behaviour for the geo segmentation service client — lets Story 6's
  generate endpoint be tested against `FindThemApi.Geo.ClientMock` (Mox)
  instead of the real HTTP service. See `config/test.exs`.
  """

  @callback generate_segments(params :: map()) ::
              {:ok, map()} | {:error, :geo_unavailable} | {:error, term()}
end
