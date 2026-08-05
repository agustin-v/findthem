defmodule FindThemApi.Repo.Migrations.ReplaceZonesWithSegments do
  use Ecto.Migration

  # Volunteers now mark whole segments as searched (the road-bounded areas
  # apps/geo actually assigns resources to) instead of individual H3 cells
  # within them — the cells were only ever a computational grid inside
  # apps/geo, never a real assignment unit. This drops the per-cell zones
  # table entirely in favor of one row per segment.
  #
  # Explicit up/down (not change/0): Ecto can't infer a reverse for
  # `drop table/1`, so a bare `change do drop table(:zones) end` would make
  # `mix ecto.rollback` past this migration raise Ecto.MigrationError. down/0
  # recreates the original zones table (see
  # 20260804114722_create_zones.exs) so a rollback actually works, even
  # though any data in either table at the time of migrate/rollback is lost
  # either way — this only restores the schema, not the rows.
  def up do
    drop table(:zones)

    create table(:segments, primary_key: false) do
      add :search_id, references(:searches, type: :binary_id), null: false, primary_key: true
      add :segment_id, :integer, null: false, primary_key: true

      add :status, :string, null: false, default: "not_assigned"

      add :searched_at, :utc_datetime
      add :searched_by_volunteer_id, references(:volunteers, type: :binary_id)
    end
  end

  def down do
    drop table(:segments)

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
