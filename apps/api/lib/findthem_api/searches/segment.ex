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

    field :locked_at, :utc_datetime
    belongs_to :locked_by_user, FindThemApi.Accounts.User
    belongs_to :locked_for_volunteer, FindThemApi.Volunteers.Volunteer
    field :lock_reason, :string
  end

  def changeset(segment, attrs) do
    segment
    |> cast(attrs, [
      :search_id,
      :segment_id,
      :status,
      :searched_at,
      :searched_by_volunteer_id,
      :locked_at,
      :locked_by_user_id,
      :locked_for_volunteer_id,
      :lock_reason
    ])
    |> validate_required([:search_id, :segment_id])
    |> validate_inclusion(:status, @statuses)
    # count: :codepoints, not the default :graphemes — same reasoning as
    # Remark/Message's own free-text fields: varchar(255) bounds by
    # codepoint, and a grapheme-counted check can pass a string that still
    # overflows the column (see Message.changeset's family-emoji repro).
    |> validate_length(:lock_reason, max: 255, count: :codepoints)
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:searched_by_volunteer_id)
    |> foreign_key_constraint(:locked_by_user_id)
    |> foreign_key_constraint(:locked_for_volunteer_id)
  end
end
