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
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:volunteer_id)
  end
end
