defmodule FindThemApi.Photos.StorageBehaviour do
  @moduledoc """
  Behaviour for subject-photo object storage — lets Story 27's upload/serve
  paths be tested against `FindThemApi.Photos.StorageMock` (Mox) instead of
  hitting real R2. See `config/test.exs`.
  """

  @callback put_object(key :: String.t(), body :: binary(), content_type :: String.t()) ::
              :ok | {:error, term()}

  @callback presigned_url(key :: String.t()) :: {:ok, String.t()} | {:error, term()}

  @callback delete_object(key :: String.t()) :: :ok | {:error, term()}
end
