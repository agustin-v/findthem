defmodule FindThemApi.Photos.Storage do
  @moduledoc """
  Real R2 client for subject-photo storage (Story 27). R2 is fully
  S3-compatible, so this is just ex_aws_s3 pointed at R2's endpoint (see
  config/runtime.exs's :ex_aws / :ex_aws, :s3 config) — no R2-specific SDK
  needed.

  Uploads are proxied through apps/api (the browser posts multipart form
  data to us, we PUT it to R2 with our own credentials) rather than
  presigned-PUT-from-the-browser — same "never call the external service
  directly from the browser" shape as the geo proxy. The bucket itself
  stays fully private; presigned_url/1 is only ever used server-side, to
  hand the coordinator's browser a short-lived signed GET link when
  rendering photo_urls (see SearchJSON).
  """

  @behaviour FindThemApi.Photos.StorageBehaviour

  @presign_expires_in 3600

  @impl true
  def put_object(key, body, content_type) do
    bucket()
    |> ExAws.S3.put_object(key, body, content_type: content_type)
    |> ExAws.request()
    |> case do
      {:ok, _response} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def presigned_url(key) do
    ExAws.Config.new(:s3)
    |> ExAws.S3.presigned_url(:get, bucket(), key, expires_in: @presign_expires_in)
  end

  @impl true
  def delete_object(key) do
    bucket()
    |> ExAws.S3.delete_object(key)
    |> ExAws.request()
    |> case do
      {:ok, _response} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp bucket do
    Application.get_env(:findthem_api, :r2, []) |> Keyword.fetch!(:bucket)
  end
end
