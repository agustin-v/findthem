defmodule FindThemApi.Repo.Migrations.CreateSegmentAssignments do
  use Ecto.Migration

  # Many-to-many: a segment can eventually have multiple resources assigned
  # (e.g. a drone and a foot volunteer on the same segment), and a volunteer
  # could in principle be assigned more than one segment. No FK constraint
  # to segments(search_id, segment_id) — Ecto's migration DSL doesn't support
  # composite-column references cleanly, so segment existence is checked at
  # the application layer instead (FindThemApi.SegmentAssignments.assign/3),
  # matching the same pattern already used by Segments.update_segment_status/3.
  def change do
    create table(:segment_assignments, primary_key: false) do
      add :search_id, references(:searches, type: :binary_id), null: false, primary_key: true
      add :segment_id, :integer, null: false, primary_key: true
      add :volunteer_id, references(:volunteers, type: :binary_id), null: false, primary_key: true

      add :assigned_at, :utc_datetime, null: false
    end
  end
end
