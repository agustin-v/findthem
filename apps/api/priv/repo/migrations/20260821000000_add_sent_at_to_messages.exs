defmodule FindThemApi.Repo.Migrations.AddSentAtToMessages do
  use Ecto.Migration

  def change do
    alter table(:messages) do
      add :sent_at, :utc_datetime_usec
    end
  end
end
