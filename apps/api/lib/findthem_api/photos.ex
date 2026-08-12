defmodule FindThemApi.Photos do
  @moduledoc """
  Subject photo upload/serving (Story 27) — coordinator-only, never sent in
  any volunteer-facing payload (see VolunteerSearchJSON, which doesn't
  include photo_urls at all).
  """

  require Logger
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches.Search

  @max_photos 5
  @max_size 10 * 1024 * 1024

  def upload(%Search{} = search, %Plug.Upload{} = upload) do
    with :ok <- validate_count(search),
         :ok <- validate_size(upload),
         {:ok, body} <- File.read(upload.path),
         {:ok, content_type} <- sniff_content_type(body),
         key = build_key(search.id, upload.filename),
         :ok <- put(key, body, content_type) do
      append_photo_with_cleanup(search.id, key)
    end
  end

  # The client's declared Content-Type (multipart part header) is never
  # trusted for what actually gets stored/served — it's attacker-
  # controlled independent of the real file bytes (a raw multipart POST
  # can claim any Content-Type regardless of what's actually in the part).
  # Instead the real magic-byte signature is what determines both whether
  # this is accepted at all and what Content-Type R2 serves it back with
  # on GET — a mislabeled non-image can no longer get stored under an
  # image Content-Type it doesn't actually have.
  defp sniff_content_type(<<0xFF, 0xD8, 0xFF, _rest::binary>>), do: {:ok, "image/jpeg"}
  defp sniff_content_type(<<0x89, "PNG", 0x0D, 0x0A, 0x1A, 0x0A, _rest::binary>>), do: {:ok, "image/png"}
  defp sniff_content_type(<<"GIF87a", _rest::binary>>), do: {:ok, "image/gif"}
  defp sniff_content_type(<<"GIF89a", _rest::binary>>), do: {:ok, "image/gif"}

  defp sniff_content_type(<<"RIFF", _size::binary-size(4), "WEBP", _rest::binary>>),
    do: {:ok, "image/webp"}

  defp sniff_content_type(_other), do: {:error, :invalid_content_type}

  # Atomic, race-free append — apps/ui fires one upload request per file
  # concurrently (Promise.allSettled over all selected photos), and a plain
  # read-modify-write (search.photo_urls ++ [key], then Repo.update) lost
  # photos under that concurrency: every concurrent request read the same
  # stale photo_urls off the struct the controller had already fetched, so
  # whichever write committed last silently discarded every other photo —
  # with every individual request still returning 201, no error anywhere.
  # array_append computed server-side inside one UPDATE is atomic per
  # Postgres's row-level locking regardless of how many requests land at
  # once. The cardinality guard in the WHERE clause makes the 5-photo cap
  # race-free the same way — validate_count/1 above is only a cheap
  # pre-check to skip a wasted R2 upload in the common (non-concurrent)
  # over-cap case; this is what actually enforces it under concurrency.
  defp append_photo(search_id, key) do
    query =
      from(s in Search,
        where: s.id == ^search_id and fragment("cardinality(?)", s.photo_urls) < @max_photos,
        update: [set: [photo_urls: fragment("array_append(?, ?)", s.photo_urls, ^key)]]
      )

    # A plain re-fetch after the atomic UPDATE, not `returning: true` — that
    # option didn't actually add a RETURNING clause with this Ecto/Postgrex
    # combination (verified: the logged SQL had none, so `update_all`
    # always returned {count, nil} regardless), and a `:returning` field
    # list would give back a partial struct unsuitable for SearchJSON's
    # full render anyway. One extra round trip, but always a fully-loaded
    # struct.
    case Repo.update_all(query, []) do
      {1, _} -> {:ok, Repo.get!(Search, search_id)}
      {0, _} -> {:error, :too_many_photos}
    end
  end

  # A photo that loses the race for the last of 5 slots (append_photo
  # returns :too_many_photos even though put/3 above already succeeded)
  # leaves an orphaned object in R2 — nothing in photo_urls ever points at
  # it. Best-effort cleanup: delete it rather than leaking storage
  # forever. If the delete itself fails, that's logged and swallowed —
  # the caller already has a definitive answer (too many photos) and a
  # failed cleanup attempt shouldn't turn that into a different error.
  defp append_photo_with_cleanup(search_id, key) do
    case append_photo(search_id, key) do
      {:ok, updated} ->
        {:ok, updated}

      {:error, :too_many_photos} = error ->
        cleanup(key)
        error
    end
  end

  defp cleanup(key) do
    case storage_client().delete_object(key) do
      :ok ->
        :ok

      {:error, reason} ->
        Logger.warning("failed to clean up orphaned photo #{key}: #{inspect(reason)}")
    end
  end

  # Normalizes whatever the storage backend's own error term looks like
  # (e.g. a raw %ExAws.Error{}) into a known atom, so FallbackController
  # only ever has to pattern-match recognized reasons instead of needing a
  # catch-all for arbitrary opaque terms.
  defp put(key, body, content_type) do
    case storage_client().put_object(key, body, content_type) do
      :ok ->
        :ok

      {:error, reason} ->
        Logger.warning("photo storage put_object failed: #{inspect(reason)}")
        {:error, :photo_storage_unavailable}
    end
  end

  # Computed at read time, not stored — keeps the bucket private (no public
  # bucket policy needed) and access control piggybacks on whatever already
  # gated the request that's rendering these (owner-scoped Clerk auth for
  # the coordinator endpoints this is used from). A key whose presign fails
  # is dropped rather than surfacing an error for the whole search — one
  # bad photo shouldn't 500 the rest of the search's details.
  def presigned_urls(%Search{photo_urls: keys}) do
    storage = storage_client()

    Enum.flat_map(keys, fn key ->
      case storage.presigned_url(key) do
        {:ok, url} -> [url]
        {:error, _reason} -> []
      end
    end)
  end

  defp validate_count(%Search{photo_urls: urls}) do
    if length(urls) >= @max_photos, do: {:error, :too_many_photos}, else: :ok
  end

  defp validate_size(%Plug.Upload{path: path}) do
    case File.stat(path) do
      {:ok, %{size: size}} when size <= @max_size -> :ok
      {:ok, _stat} -> {:error, :file_too_large}
      # Normalizes File.stat's raw posix error atom (e.g. :enoent — rare,
      # but possible if the temp upload was somehow already cleaned up)
      # into a recognized error, so FallbackController never has to
      # catch-all an arbitrary atom it can't render a sensible message for.
      {:error, reason} ->
        Logger.warning("photo upload File.stat failed: #{inspect(reason)}")
        {:error, :invalid_photo}
    end
  end

  defp build_key(search_id, filename) do
    "searches/#{search_id}/#{Ecto.UUID.generate()}#{Path.extname(filename)}"
  end

  defp storage_client do
    Application.get_env(:findthem_api, :photo_storage, FindThemApi.Photos.Storage)
  end
end
