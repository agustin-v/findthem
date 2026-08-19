defmodule FindThemApi.ClerkFixtures do
  @moduledoc false

  def rsa_keypair(kid) do
    private_jwk = JOSE.JWK.generate_key({:rsa, 2048})
    {_, private_map} = JOSE.JWK.to_map(private_jwk)
    {_, public_map} = private_jwk |> JOSE.JWK.to_public() |> JOSE.JWK.to_map()

    public_jwk = Map.merge(public_map, %{"kid" => kid, "use" => "sig", "alg" => "RS256"})

    %{private: private_map, public_jwks_entry: public_jwk, kid: kid}
  end

  def sign_token(private_jwk_map, kid, claims) do
    signer = Joken.Signer.create("RS256", private_jwk_map, %{"kid" => kid})
    {:ok, token, _claims} = Joken.generate_and_sign(%{}, claims, signer)
    token
  end

  def serve_jwks(bypass, public_jwks_entries) do
    Bypass.stub(bypass, "GET", "/.well-known/jwks.json", fn conn ->
      body = Jason.encode!(%{"keys" => public_jwks_entries})

      conn
      |> Plug.Conn.put_resp_content_type("application/json")
      |> Plug.Conn.resp(200, body)
    end)
  end

  def now, do: DateTime.utc_now() |> DateTime.to_unix()

  @doc """
  Sets up a Bypass-served JWKS + Clerk config for the duration of the test and
  returns `conn` with a valid Bearer token for `sub` attached.
  """
  def authed_conn(conn, sub, opts \\ []) do
    token = authed_token(sub, opts)
    Plug.Conn.put_req_header(conn, "authorization", "Bearer #{token}")
  end

  @doc """
  Same Bypass-served JWKS + Clerk config as `authed_conn/3`, but returns the
  raw token string — for callers with no conn to attach it to (e.g. socket
  connect params in channel tests).
  """
  def authed_token(sub, opts \\ []) do
    bypass = Bypass.open()
    issuer = "http://localhost:#{bypass.port}"
    previous = Application.get_env(:findthem_api, :clerk)
    authorized_parties = Keyword.get(opts, :authorized_parties, ["http://localhost:5173"])

    Application.put_env(:findthem_api, :clerk,
      issuer: issuer,
      authorized_parties: authorized_parties
    )

    ExUnit.Callbacks.on_exit(fn -> Application.put_env(:findthem_api, :clerk, previous) end)

    keypair = rsa_keypair("test-kid-1")
    serve_jwks(bypass, [keypair.public_jwks_entry])

    sign_token(keypair.private, keypair.kid, %{
      "sub" => sub,
      "iss" => issuer,
      "azp" => List.first(authorized_parties),
      "iat" => now(),
      "nbf" => now(),
      "exp" => now() + 3600
    })
  end
end
