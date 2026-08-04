defmodule FindThemApi.Repo.Migrations.CreateRemarks do
  use Ecto.Migration

  def change do
    create table(:remarks, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :search_id, references(:searches, type: :binary_id), null: false
      add :volunteer_id, references(:volunteers, type: :binary_id)

      add :kind, :string, null: false
      add :text, :string

      add :lat, :float
      add :lng, :float

      add :reported_at, :utc_datetime, null: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:remarks, [:search_id])
  end
end
