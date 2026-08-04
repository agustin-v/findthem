defmodule FindThemApi.Searches.Zone do
  use Ecto.Schema
  import Ecto.Changeset

  # Must mirror ZONE_STATUS_CYCLE in apps/ui/src/lib/zones.ts exactly.
  @statuses ~w(not_assigned assigned in_progress searched)

  # A real H3 cell index is a 15-character hex string. This isn't a full
  # semantic validation (doesn't confirm it decodes to a valid cell — Elixir
  # has no h3 library), but it rejects the obvious garbage a client could
  # PATCH in via VolunteerZoneController's free-text :h3_index path — an
  # unvalidated h3_index here previously let any approved volunteer persist
  # a poisoned zone that crashed h3-js's cellToBoundary (an uncaught
  # exception with no ErrorBoundary) on every volunteer's map render.
  @h3_index_format ~r/^[0-9a-fA-F]{15}$/

  @primary_key false
  @foreign_key_type :binary_id
  schema "zones" do
    belongs_to :search, FindThemApi.Searches.Search, primary_key: true
    field :h3_index, :string, primary_key: true

    field :status, :string, default: "not_assigned"
    field :segment_id, :string

    field :searched_at, :utc_datetime
    belongs_to :searched_by_volunteer, FindThemApi.Volunteers.Volunteer
  end

  def changeset(zone, attrs) do
    zone
    |> cast(attrs, [
      :search_id,
      :h3_index,
      :status,
      :segment_id,
      :searched_at,
      :searched_by_volunteer_id
    ])
    |> validate_required([:search_id, :h3_index])
    |> validate_format(:h3_index, @h3_index_format)
    |> validate_inclusion(:status, @statuses)
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:searched_by_volunteer_id)
  end
end
