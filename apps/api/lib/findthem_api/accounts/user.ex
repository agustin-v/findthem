defmodule FindThemApi.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "users" do
    field :clerk_user_id, :string
    field :email, :string
    field :name, :string

    timestamps(type: :utc_datetime)
  end

  def changeset(user, attrs) do
    user
    |> cast(attrs, [:clerk_user_id, :email, :name])
    |> validate_required([:clerk_user_id])
    |> unique_constraint(:clerk_user_id)
  end
end
