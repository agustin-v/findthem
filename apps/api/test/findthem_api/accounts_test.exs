defmodule FindThemApi.AccountsTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.Accounts

  test "get_or_provision/2 provisions exactly one row across two requests for the same sub" do
    {:ok, first} = Accounts.get_or_provision("user_abc123", %{email: "a@example.com", name: "A"})

    {:ok, second} =
      Accounts.get_or_provision("user_abc123", %{email: "a2@example.com", name: "A2"})

    assert first.id == second.id
    assert second.email == "a2@example.com"
    assert second.name == "A2"
    assert Repo.aggregate(Accounts.User, :count) == 1
  end
end
