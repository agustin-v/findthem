defmodule FindThemApi.Clerk.TokenTest do
  use ExUnit.Case, async: false

  import FindThemApi.ClerkFixtures

  alias FindThemApi.Clerk.Token

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

  defp base_claims(issuer) do
    %{
      "sub" => "user_abc123",
      "iss" => issuer,
      "azp" => "http://localhost:5173",
      "iat" => now(),
      "nbf" => now(),
      "exp" => now() + 3600
    }
  end

  test "valid token verifies and returns claims", %{keypair: keypair, issuer: issuer} do
    token = sign_token(keypair.private, keypair.kid, base_claims(issuer))

    assert {:ok, claims} = Token.verify_token(token)
    assert claims["sub"] == "user_abc123"
  end

  test "missing token is rejected" do
    assert {:error, _} = Token.verify_token("")
  end

  test "garbage token is rejected" do
    assert {:error, _} = Token.verify_token("not.a.jwt")
  end

  test "expired token is rejected", %{keypair: keypair, issuer: issuer} do
    claims = %{base_claims(issuer) | "exp" => now() - 10}
    token = sign_token(keypair.private, keypair.kid, claims)

    assert {:error, _} = Token.verify_token(token)
  end

  test "wrong issuer is rejected", %{keypair: keypair} do
    claims = base_claims("https://not-us.clerk.accounts.dev")
    token = sign_token(keypair.private, keypair.kid, claims)

    assert {:error, _} = Token.verify_token(token)
  end

  test "unlisted azp is rejected", %{keypair: keypair, issuer: issuer} do
    claims = %{base_claims(issuer) | "azp" => "https://evil.example.com"}
    token = sign_token(keypair.private, keypair.kid, claims)

    assert {:error, _} = Token.verify_token(token)
  end

  test "missing azp is allowed (Clerk semantics: reject only if present-and-unlisted)", %{
    keypair: keypair,
    issuer: issuer
  } do
    claims = base_claims(issuer) |> Map.delete("azp")
    token = sign_token(keypair.private, keypair.kid, claims)

    assert {:ok, _claims} = Token.verify_token(token)
  end
end
