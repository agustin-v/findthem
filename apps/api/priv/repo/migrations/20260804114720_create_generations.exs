defmodule FindThemApi.Repo.Migrations.CreateGenerations do
  use Ecto.Migration

  def change do
    create table(:generations, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :search_id, references(:searches, type: :binary_id), null: false

      add :request_params, :map, null: false, default: %{}
      add :meta, :map, null: false, default: %{}
      add :response, :map, null: false, default: %{}

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:generations, [:search_id])
  end
end
