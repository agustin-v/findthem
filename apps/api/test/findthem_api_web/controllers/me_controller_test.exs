defmodule FindThemApiWeb.MeControllerTest do
  use FindThemApiWeb.ConnCase, async: false

  import FindThemApi.ClerkFixtures

  setup do
    bypass = Bypass.open()
    issuer = "http://localhost:#{bypass.port}"
    previous = Application.get_env(:findthem_api, :clerk)

    Application.put_env(:findthem_api, :clerk,
      issuer: issuer,
      authorized_parties: ["http://localhost:5173"]
    )

    on_exit(fn -> Application.put_env(:findthem_api, :clerk, previous) end)

    keypair = rsa_keypair("test-kid-1")
    serve_jwks(bypass, [keypair.public_jwks_entry])

    %{keypair: keypair, issuer: issuer}
  end

  defp claims(issuer, overrides \\ %{}) do
    Map.merge(
      %{
        "sub" => "user_me_1",
        "iss" => issuer,
        "email" => "me@example.com",
        "name" => "Me",
        "azp" => "http://localhost:5173",
        "iat" => now(),
        "nbf" => now(),
        "exp" => now() + 3600
      },
      overrides
    )
  end

  test "GET /api/me with a valid bearer token returns the provisioned user", %{
    conn: conn,
    keypair: keypair,
    issuer: issuer
  } do
    token = sign_token(keypair.private, keypair.kid, claims(issuer))

    conn = conn |> put_req_header("authorization", "Bearer #{token}") |> get(~p"/api/me")

    assert %{"email" => "me@example.com", "name" => "Me"} = json_response(conn, 200)
  end

  test "GET /api/me with no Authorization header returns 401", %{conn: conn} do
    conn = get(conn, ~p"/api/me")

    assert json_response(conn, 401)
  end

  test "GET /api/me with a garbage token returns 401", %{conn: conn} do
    conn = conn |> put_req_header("authorization", "Bearer garbage") |> get(~p"/api/me")

    assert json_response(conn, 401)
  end

  test "GET /api/me with an expired token returns 401", %{
    conn: conn,
    keypair: keypair,
    issuer: issuer
  } do
    token = sign_token(keypair.private, keypair.kid, claims(issuer, %{"exp" => now() - 10}))

    conn = conn |> put_req_header("authorization", "Bearer #{token}") |> get(~p"/api/me")

    assert json_response(conn, 401)
  end
end
