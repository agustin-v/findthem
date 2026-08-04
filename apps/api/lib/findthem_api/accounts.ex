defmodule FindThemApi.Accounts do
  alias FindThemApi.Accounts.User
  alias FindThemApi.Repo

  def get_or_provision(clerk_user_id, attrs \\ %{}) do
    changeset =
      User.changeset(%User{}, Map.merge(attrs, %{clerk_user_id: clerk_user_id}))

    Repo.insert(changeset,
      on_conflict: {:replace, [:email, :name]},
      conflict_target: :clerk_user_id,
      returning: true
    )
  end
end
