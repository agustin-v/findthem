defmodule FindThemApi.Remarks.Remark do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: false}
  @foreign_key_type :binary_id
  schema "remarks" do
    belongs_to :search, FindThemApi.Searches.Search
    belongs_to :volunteer, FindThemApi.Volunteers.Volunteer

    field :kind, :string
    field :text, :string

    field :lat, :float
    field :lng, :float

    field :reported_at, :utc_datetime

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(remark, attrs) do
    remark
    |> cast(attrs, [
      :id,
      :search_id,
      :volunteer_id,
      :kind,
      :text,
      :lat,
      :lng,
      :reported_at
    ])
    |> validate_required([:id, :search_id, :kind, :reported_at])
    # kind/text are plain :string columns (varchar(255) — Ecto's default,
    # see the create_remarks migration); without a length cap here, an
    # oversized value doesn't get a clean 422, it hits Postgres and raises
    # an unhandled exception. lat/lng have no DB-level bound at all.
    |> validate_length(:kind, max: 100)
    |> validate_length(:text, max: 255)
    |> validate_number(:lat, greater_than_or_equal_to: -90, less_than_or_equal_to: 90)
    |> validate_number(:lng, greater_than_or_equal_to: -180, less_than_or_equal_to: 180)
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:volunteer_id)
  end
end
