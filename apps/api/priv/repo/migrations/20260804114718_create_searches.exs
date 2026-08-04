defmodule FindThemApi.Repo.Migrations.CreateSearches do
  use Ecto.Migration

  def change do
    create table(:searches, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :owner_id, references(:users, type: :binary_id), null: false

      add :subject_type, :string, null: false
      add :subject_name, :string, null: false
      add :subject_details, :map, null: false, default: %{}
      add :contact_phone, :string, null: false
      add :photo_urls, {:array, :string}, null: false, default: []

      add :status, :string, null: false, default: "active"

      add :lkp_lat, :float
      add :lkp_lng, :float
      add :lkp_address, :string
      add :lkp_at, :utc_datetime

      add :radius_km, :float
      add :h3_resolution, :integer

      add :join_token, :string, null: false

      add :outcome, :string
      add :closed_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:searches, [:owner_id])
    create unique_index(:searches, [:join_token])
  end
end
