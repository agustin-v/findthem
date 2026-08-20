defmodule FindThemApi.Repo.Migrations.AddSegmentLocking do
  use Ecto.Migration

  def change do
    alter table(:segments) do
      add :locked_at, :utc_datetime
      # Coordinator who locked it, for audit — never exposed to a
      # volunteer device (see VolunteerSearchJSON's own segment shaping).
      add :locked_by_user_id, references(:users, type: :binary_id)
      # Who the lock is reserved FOR — a locked segment blocks every
      # OTHER volunteer's status PATCH; this volunteer's own successful
      # PATCH is allowed and auto-clears the lock. Without this field the
      # lock can't express "this is Alice's, not everyone's."
      add :locked_for_volunteer_id, references(:volunteers, type: :binary_id)
      add :lock_reason, :string
    end
  end
end
