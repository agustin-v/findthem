defmodule FindThemApi.Repo.Migrations.CreateVolunteerLocations do
  use Ecto.Migration

  def change do
    create table(:volunteer_locations, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :search_id, references(:searches, type: :binary_id), null: false
      add :volunteer_id, references(:volunteers, type: :binary_id), null: false

      add :lat, :float, null: false
      add :lng, :float, null: false
      # usec, not second precision — same reasoning as Message's own
      # :recorded_at-equivalent column: a GPS feed (or a client retry) can
      # produce two pings within the same second, and this table's
      # ordering (list_trail/2, last_known_by_search/1) needs a
      # deterministic tiebreak rather than leaving same-second rows in
      # whatever order Postgres happens to return them.
      add :recorded_at, :utc_datetime_usec, null: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    # Serves both the breadcrumb trail (list_trail/2, WHERE search_id AND
    # volunteer_id, ORDER BY recorded_at) and the last-known-position lookup
    # (last_known_by_search/1, DISTINCT ON volunteer_id ORDER BY volunteer_id,
    # recorded_at DESC) off the same leading-column order — search_id is the
    # common filter for both, volunteer_id the common grouping/tiebreak.
    create index(:volunteer_locations, [:search_id, :volunteer_id, :recorded_at])
  end
end
