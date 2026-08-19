defmodule FindThemApi.Repo.Migrations.CreateMessages do
  use Ecto.Migration

  def change do
    create table(:messages, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :search_id, references(:searches, type: :binary_id), null: false
      # Unlike remarks (optional volunteer_id — a coordinator-authored map
      # notice has no single-volunteer author), a message is always part of
      # exactly one coordinator<->volunteer thread, so this is required.
      add :volunteer_id, references(:volunteers, type: :binary_id), null: false

      add :sender, :string, null: false
      # varchar(2000), not the :string default of 255 — a chat message is
      # longer than a remark's short note. Bounded at the DB level (not
      # just the changeset) so an oversized value gets a clean 422 instead
      # of an unhandled Postgres exception (same reasoning as Remark's
      # own :kind/:text columns).
      add :text, :string, size: 2000, null: false

      # usec, not Remark's inherited second precision — see Message
      # schema's own comment: this table is actually sorted for display,
      # where a same-second tie leaves ordering up to Postgres.
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    # One-thread view (list_by_search_and_volunteer/2 — VolunteerMessageController's
    # GET, and the coordinator's ?volunteer_id= scoping).
    create index(:messages, [:search_id, :volunteer_id, :inserted_at])
    # All-threads view (list_by_search/1 — the coordinator's unscoped GET);
    # the composite index above can't serve this sort since volunteer_id
    # sits between search_id and inserted_at.
    create index(:messages, [:search_id, :inserted_at])
  end
end
