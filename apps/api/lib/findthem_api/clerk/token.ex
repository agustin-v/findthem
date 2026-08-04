defmodule FindThemApi.Clerk.Token do
  @moduledoc """
  Verifies Clerk session JWTs: signature (via JWKS), exp/nbf/iat, iss == CLERK_ISSUER,
  and azp — rejected only if present-and-unlisted (Clerk's own semantics).
  """

  use Joken.Config

  alias FindThemApi.Clerk.Jwks

  @impl true
  def token_config, do: default_claims(skip: [:iss])

  def verify_token(token) when is_binary(token) and token != "" do
    with {:ok, %{"kid" => kid}} <- peek_header(token),
         {:ok, signer} <- Jwks.get_signer(jwks_url(), kid),
         {:ok, claims} <- verify_and_validate(token, signer),
         :ok <- validate_issuer(claims),
         :ok <- validate_azp(claims) do
      {:ok, claims}
    else
      {:error, _reason} = error -> error
      :error -> {:error, :invalid_token}
    end
  end

  def verify_token(_invalid), do: {:error, :invalid_token}

  defp peek_header(token) do
    Joken.peek_header(token)
  rescue
    _ -> {:error, :invalid_token}
  end

  defp validate_issuer(claims) do
    if claims["iss"] == config()[:issuer], do: :ok, else: {:error, :invalid_issuer}
  end

  defp validate_azp(claims) do
    case claims["azp"] do
      nil ->
        :ok

      azp ->
        if azp in (config()[:authorized_parties] || []),
          do: :ok,
          else: {:error, :unauthorized_party}
    end
  end

  defp jwks_url, do: config()[:issuer] <> "/.well-known/jwks.json"

  defp config, do: Application.get_env(:findthem_api, :clerk, [])
end
