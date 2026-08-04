defmodule FindThemApi.Geo.ClientTest do
  use ExUnit.Case, async: false

  alias FindThemApi.Geo.Client

  setup do
    bypass = Bypass.open()
    previous = Application.get_env(:findthem_api, :geo)

    Application.put_env(:findthem_api, :geo,
      url: "http://localhost:#{bypass.port}",
      internal_token: "s3cret"
    )

    on_exit(fn -> Application.put_env(:findthem_api, :geo, previous) end)

    %{bypass: bypass}
  end

  defp json_resp(conn, status, body) do
    conn
    |> Plug.Conn.put_resp_content_type("application/json")
    |> Plug.Conn.resp(status, Jason.encode!(body))
  end

  test "returns {:ok, body} on 200", %{bypass: bypass} do
    Bypass.expect_once(bypass, "POST", "/api/v1/segments/generate", fn conn ->
      json_resp(conn, 200, %{"segments" => %{"features" => []}})
    end)

    assert {:ok, %{"segments" => %{"features" => []}}} =
             Client.generate_segments(%{center: %{lat: 41.9, lng: 12.5}, radius_km: 1.0})
  end

  test "sends the configured x-internal-token header", %{bypass: bypass} do
    Bypass.expect_once(bypass, "POST", "/api/v1/segments/generate", fn conn ->
      assert Plug.Conn.get_req_header(conn, "x-internal-token") == ["s3cret"]
      json_resp(conn, 200, %{})
    end)

    Client.generate_segments(%{})
  end

  test "omits the header entirely when no token is configured", %{bypass: bypass} do
    Application.put_env(:findthem_api, :geo, url: "http://localhost:#{bypass.port}")

    Bypass.expect_once(bypass, "POST", "/api/v1/segments/generate", fn conn ->
      assert Plug.Conn.get_req_header(conn, "x-internal-token") == []
      json_resp(conn, 200, %{})
    end)

    Client.generate_segments(%{})
  end

  test "maps a 503 to {:error, :geo_unavailable}", %{bypass: bypass} do
    Bypass.expect_once(bypass, "POST", "/api/v1/segments/generate", fn conn ->
      Plug.Conn.resp(conn, 503, "")
    end)

    assert {:error, :geo_unavailable} = Client.generate_segments(%{})
  end

  test "maps a connection failure to {:error, :geo_unavailable}", %{bypass: bypass} do
    Bypass.down(bypass)

    assert {:error, :geo_unavailable} = Client.generate_segments(%{})
  end

  test "surfaces an unexpected status as an error tuple instead of swallowing it", %{
    bypass: bypass
  } do
    Bypass.expect_once(bypass, "POST", "/api/v1/segments/generate", fn conn ->
      json_resp(conn, 422, %{"detail" => "bad request"})
    end)

    assert {:error, {422, %{"detail" => "bad request"}}} = Client.generate_segments(%{})
  end
end
