defmodule FindThemApi.Repo.Migrations.CreateZones do
  use Ecto.Migration

  def change do
    create table(:zones, primary_key: false) do
      add :search_id, references(:searches, type: :binary_id), null: false, primary_key: true
      add :h3_index, :string, null: false, primary_key: true

      add :status, :string, null: false, default: "not_assigned"
      add :segment_id, :string

      add :searched_at, :utc_datetime
      add :searched_by_volunteer_id, references(:volunteers, type: :binary_id)
    end
  end
end
