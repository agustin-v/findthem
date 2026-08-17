defmodule FindThemApi.PhotosTest do
  use FindThemApi.DataCase, async: true

  import Mox

  alias FindThemApi.{Accounts, Photos, Repo, Searches}
  alias FindThemApi.Photos.StorageMock
  alias FindThemApi.Searches.Search

  setup :verify_on_exit!

  @jpeg_magic <<0xFF, 0xD8, 0xFF>>
  @png_magic <<0x89, "PNG", 0x0D, 0x0A, 0x1A, 0x0A>>

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_photos", %{email: "p@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{search: search}
  end

  defp upload(fixture \\ "fixture.jpg", content_type \\ "image/jpeg", body \\ @jpeg_magic <> "rest-of-file") do
    path = Path.join(System.tmp_dir!(), "photos_test_#{System.unique_integer([:positive])}")
    File.write!(path, body)
    %Plug.Upload{path: path, filename: fixture, content_type: content_type}
  end

  test "upload/2 stores the photo (sniffed content type, not the client's claim) and appends its key",
       %{search: search} do
    expect(StorageMock, :put_object, fn key, body, content_type ->
      assert String.starts_with?(key, "searches/#{search.id}/")
      assert String.ends_with?(key, ".jpg")
      assert body == @jpeg_magic <> "rest-of-file"
      assert content_type == "image/jpeg"
      :ok
    end)

    {:ok, updated} = Photos.upload(search, upload())

    assert length(updated.photo_urls) == 1
  end

  for {name, magic, expected_type} <- [
        {"jpeg", <<0xFF, 0xD8, 0xFF>>, "image/jpeg"},
        {"png", <<0x89, "PNG", 0x0D, 0x0A, 0x1A, 0x0A>>, "image/png"},
        {"gif87a", "GIF87a", "image/gif"},
        {"gif89a", "GIF89a", "image/gif"},
        {"webp", "RIFF" <> <<0, 0, 0, 0>> <> "WEBP", "image/webp"}
      ] do
    test "upload/2 recognizes real #{name} magic bytes and stores it as #{expected_type}", %{
      search: search
    } do
      expect(StorageMock, :put_object, fn _key, _body, content_type ->
        assert content_type == unquote(expected_type)
        :ok
      end)

      assert {:ok, _} = Photos.upload(search, upload("f", "application/octet-stream", unquote(magic) <> "..."))
    end
  end

  test "upload/2 rejects bytes that don't match any recognized image signature, regardless of claimed content type",
       %{search: search} do
    assert {:error, :invalid_content_type} =
             Photos.upload(search, upload("evil.jpg", "image/jpeg", "not actually an image"))
  end

  test "upload/2 ignores a mismatched client-claimed content type and trusts the real bytes", %{
    search: search
  } do
    # Claims GIF, but the bytes are really a PNG — the sniffed type wins.
    expect(StorageMock, :put_object, fn _key, _body, content_type ->
      assert content_type == "image/png"
      :ok
    end)

    assert {:ok, _} = Photos.upload(search, upload("f.gif", "image/gif", @png_magic <> "rest"))
  end

  test "upload/2 does not lose photos under concurrent uploads to the same search", %{
    search: search
  } do
    stub(StorageMock, :put_object, fn _key, _body, _content_type -> :ok end)

    parent = self()

    tasks =
      for i <- 1..3 do
        Task.async(fn ->
          Ecto.Adapters.SQL.Sandbox.allow(Repo, parent, self())
          Mox.allow(StorageMock, parent, self())
          Photos.upload(search, upload("photo#{i}.jpg"))
        end)
      end

    results = Task.await_many(tasks, 5000)

    assert Enum.all?(results, &match?({:ok, _}, &1))

    updated = Repo.get!(Search, search.id)
    assert length(updated.photo_urls) == 3
  end

  test "upload/2 cleans up the R2 object when it loses the race for the last photo slot", %{
    search: search
  } do
    # Simulates the actual race: the DB row already has 5 photos, but the
    # in-memory `search` struct being uploaded against (as if fetched
    # moments earlier by a concurrent request) is stale and still shows 0
    # — so the cheap pre-check (validate_count/1) passes and put/3 actually
    # runs, and only the atomic DB-level check in append_photo/2 correctly
    # catches that the cap was already reached by the time this commits.
    Repo.update_all(
      from(s in Search, where: s.id == ^search.id),
      set: [photo_urls: for(i <- 1..5, do: "searches/#{search.id}/#{i}.jpg")]
    )

    expect(StorageMock, :put_object, fn _key, _body, _content_type -> :ok end)

    expect(StorageMock, :delete_object, fn key ->
      assert String.starts_with?(key, "searches/#{search.id}/")
      :ok
    end)

    assert {:error, :too_many_photos} = Photos.upload(search, upload())
  end

  test "upload/2 rejects a file over 10MB without touching storage", %{search: search} do
    big = @jpeg_magic <> String.duplicate("a", 10 * 1024 * 1024 + 1)
    assert {:error, :file_too_large} = Photos.upload(search, upload("big.jpg", "image/jpeg", big))
  end

  test "upload/2 rejects a 6th photo on a search that already has 5, without touching storage", %{
    search: search
  } do
    {:ok, search} =
      search
      |> Ecto.Changeset.change(photo_urls: for(i <- 1..5, do: "searches/#{search.id}/#{i}.jpg"))
      |> Repo.update()

    assert {:error, :too_many_photos} = Photos.upload(search, upload())
  end

  test "upload/2 normalizes a storage failure into :photo_storage_unavailable", %{search: search} do
    expect(StorageMock, :put_object, fn _key, _body, _content_type -> {:error, :timeout} end)

    assert {:error, :photo_storage_unavailable} = Photos.upload(search, upload())
  end

  test "presigned_urls/1 returns a signed URL per stored key", %{search: search} do
    {:ok, search} =
      search
      |> Ecto.Changeset.change(photo_urls: ["searches/#{search.id}/a.jpg", "searches/#{search.id}/b.jpg"])
      |> Repo.update()

    expect(StorageMock, :presigned_url, fn "searches/" <> _ = key ->
      {:ok, "https://signed.example.com/#{key}"}
    end)

    expect(StorageMock, :presigned_url, fn key -> {:ok, "https://signed.example.com/#{key}"} end)

    urls = Photos.presigned_urls(search)

    assert length(urls) == 2
    assert Enum.all?(urls, &String.starts_with?(&1, "https://signed.example.com/"))
  end

  test "presigned_urls/1 drops a key whose presign fails instead of erroring", %{search: search} do
    {:ok, search} =
      search
      |> Ecto.Changeset.change(photo_urls: ["searches/#{search.id}/a.jpg", "searches/#{search.id}/b.jpg"])
      |> Repo.update()

    expect(StorageMock, :presigned_url, fn _key -> {:error, :boom} end)
    expect(StorageMock, :presigned_url, fn key -> {:ok, "https://signed.example.com/#{key}"} end)

    assert length(Photos.presigned_urls(search)) == 1
  end

  test "presigned_urls/1 returns an empty list for a search with no photos", %{search: search} do
    assert Photos.presigned_urls(search) == []
  end

  test "presigned_urls/1 degrades to an empty list instead of raising when the storage client raises",
       %{search: search} do
    {:ok, search} =
      search
      |> Ecto.Changeset.change(photo_urls: ["searches/#{search.id}/a.jpg"])
      |> Repo.update()

    expect(StorageMock, :presigned_url, fn _key -> raise "missing R2 bucket config" end)

    assert Photos.presigned_urls(search) == []
  end
end
