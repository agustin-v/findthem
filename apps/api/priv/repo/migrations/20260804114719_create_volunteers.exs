defmodule FindThemApi.Repo.Migrations.CreateVolunteers do
  use Ecto.Migration

  def change do
    create table(:volunteers, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :search_id, references(:searches, type: :binary_id), null: false

      add :name, :string, null: false
      add :phone, :string, null: false
      add :resource_type, :string

      add :status, :string, null: false, default: "pending"

      add :consent_name, :boolean, null: false, default: false
      add :consent_location, :boolean, null: false, default: false
      add :consent_phone, :boolean, null: false, default: false

      add :last_active_at, :utc_datetime
      add :joined_at, :utc_datetime
      add :approved_at, :utc_datetime
      add :removed_at, :utc_datetime
    end

    create index(:volunteers, [:search_id])
  end
end
