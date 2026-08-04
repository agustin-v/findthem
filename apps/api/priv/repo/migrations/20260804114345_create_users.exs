defmodule FindThemApi.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:users, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :clerk_user_id, :string, null: false
      add :email, :string
      add :name, :string

      timestamps(type: :utc_datetime)
    end

    create unique_index(:users, [:clerk_user_id])
  end
end
