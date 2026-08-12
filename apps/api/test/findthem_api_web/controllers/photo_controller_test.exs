defmodule FindThemApiWeb.PhotoControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import Mox
  import FindThemApi.ClerkFixtures

  alias FindThemApi.{Accounts, Searches}
  alias FindThemApi.Photos.StorageMock

  setup :verify_on_exit!

  setup %{conn: conn} do
    {:ok, owner} =
      Accounts.get_or_provision("user_owner_photos_ctrl", %{email: "p@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{conn: authed_conn(conn, "user_owner_photos_ctrl"), search: search}
  end

  defp upload_fixture do
    path = Path.join(System.tmp_dir!(), "photo_ctrl_test_#{System.unique_integer([:positive])}")
    File.write!(path, <<0xFF, 0xD8, 0xFF>> <> "rest-of-file")
    %Plug.Upload{path: path, filename: "fixture.jpg", content_type: "image/jpeg"}
  end

  test "POST /api/searches/:id/photos uploads and returns the search with a signed photo URL", %{
    conn: conn,
    search: search
  } do
    expect(StorageMock, :put_object, fn _key, _body, _content_type -> :ok end)
    expect(StorageMock, :presigned_url, fn key -> {:ok, "https://signed.example.com/#{key}"} end)

    conn = post(conn, ~p"/api/searches/#{search.id}/photos", %{"photo" => upload_fixture()})

    assert %{"data" => data} = json_response(conn, 201)
    assert [url] = data["photo_urls"]
    assert String.starts_with?(url, "https://signed.example.com/searches/#{search.id}/")
  end

  test "POST without a photo param returns 422 without touching storage", %{
    conn: conn,
    search: search
  } do
    conn = post(conn, ~p"/api/searches/#{search.id}/photos", %{})

    assert json_response(conn, 422)
  end

  test "POST with a non-image content type returns 422", %{conn: conn, search: search} do
    path = Path.join(System.tmp_dir!(), "not_an_image_#{System.unique_integer([:positive])}")
    File.write!(path, "hello")
    upload = %Plug.Upload{path: path, filename: "f.txt", content_type: "text/plain"}

    conn = post(conn, ~p"/api/searches/#{search.id}/photos", %{"photo" => upload})

    assert json_response(conn, 422)
  end

  test "POST when storage fails returns 503, not a raw error", %{conn: conn, search: search} do
    expect(StorageMock, :put_object, fn _key, _body, _content_type -> {:error, :timeout} end)

    conn = post(conn, ~p"/api/searches/#{search.id}/photos", %{"photo" => upload_fixture()})

    assert json_response(conn, 503)
  end

  test "POST for a search owned by another user returns 404 without touching storage", %{
    conn: conn
  } do
    {:ok, other_owner} =
      Accounts.get_or_provision("user_other_photos_ctrl", %{email: "other@example.com"})

    {:ok, theirs} =
      Searches.create_search(other_owner.id, %{
        subject_type: "person",
        subject_name: "Theirs",
        contact_phone: "+390612345"
      })

    conn = post(conn, ~p"/api/searches/#{theirs.id}/photos", %{"photo" => upload_fixture()})

    assert json_response(conn, 404)
  end
end
