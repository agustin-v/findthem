defmodule FindThemApi.Searches.Segment do
  use Ecto.Schema
  import Ecto.Changeset

  # Must mirror SEGMENT_STATUS_CYCLE in apps/mobile/src/lib/segments.ts exactly.
  @statuses ~w(not_assigned assigned in_progress searched)

  @primary_key false
  @foreign_key_type :binary_id
  schema "segments" do
    belongs_to :search, FindThemApi.Searches.Search, primary_key: true
    field :segment_id, :integer, primary_key: true

    field :status, :string, default: "not_assigned"

    field :searched_at, :utc_datetime
    belongs_to :searched_by_volunteer, FindThemApi.Volunteers.Volunteer
  end

  def changeset(segment, attrs) do
    segment
    |> cast(attrs, [
      :search_id,
      :segment_id,
      :status,
      :searched_at,
      :searched_by_volunteer_id
    ])
    |> validate_required([:search_id, :segment_id])
    |> validate_inclusion(:status, @statuses)
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:searched_by_volunteer_id)
  end
end
