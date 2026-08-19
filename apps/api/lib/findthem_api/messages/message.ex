defmodule FindThemApi.Messages.Message do
  use Ecto.Schema
  import Ecto.Changeset

  @senders ~w(coordinator volunteer)

  @primary_key {:id, :binary_id, autogenerate: false}
  @foreign_key_type :binary_id
  schema "messages" do
    belongs_to :search, FindThemApi.Searches.Search
    belongs_to :volunteer, FindThemApi.Volunteers.Volunteer

    field :sender, :string
    field :text, :string

    # usec, not the Remark-inherited default of second precision — a fast
    # exchange (two messages in the same search-detail session) can easily
    # land in the same second, and unlike Remark this actually gets sorted
    # for display (list_by_search/2's order_by(asc: :inserted_at)), where a
    # tie leaves Postgres free to return either order on any given query.
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  # Client supplies the id so an offline sync queue can replay this call
  # safely — same reasoning as Remark.changeset, on_conflict: :nothing in
  # Messages.create_message/2 makes a replay with the same id a no-op.
  def changeset(message, attrs) do
    message
    |> cast(attrs, [:id, :search_id, :volunteer_id, :sender, :text])
    |> validate_required([:id, :search_id, :volunteer_id, :sender, :text])
    |> validate_inclusion(:sender, @senders)
    # count: :codepoints, not Ecto's default of :graphemes — the DB column
    # is varchar(2000), which Postgres bounds by character (~codepoint),
    # not by grapheme cluster. A combining-mark/ZWJ-heavy string (e.g. a
    # family emoji is 1 grapheme but 5+ codepoints) could pass a
    # grapheme-counted validation yet still overflow the column, turning
    # into an unhandled Postgres error instead of a clean 422 — exactly
    # what this bound exists to prevent.
    |> validate_length(:text, min: 1, max: 2000, count: :codepoints)
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:volunteer_id)
  end
end
