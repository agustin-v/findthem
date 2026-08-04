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
end
