defmodule FindThemApi.Searches.Zone do
  use Ecto.Schema
  import Ecto.Changeset

  # Must mirror ZONE_STATUS_CYCLE in apps/ui/src/lib/zones.ts exactly.
  @statuses ~w(not_assigned assigned in_progress searched)

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
    |> validate_inclusion(:status, @statuses)
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:searched_by_volunteer_id)
  end
end
