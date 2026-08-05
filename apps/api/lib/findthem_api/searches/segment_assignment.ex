defmodule FindThemApi.Searches.SegmentAssignment do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  @foreign_key_type :binary_id
  schema "segment_assignments" do
    belongs_to :search, FindThemApi.Searches.Search, primary_key: true
    field :segment_id, :integer, primary_key: true
    belongs_to :volunteer, FindThemApi.Volunteers.Volunteer, primary_key: true

    field :assigned_at, :utc_datetime
  end

  def changeset(assignment, attrs) do
    assignment
    |> cast(attrs, [:search_id, :segment_id, :volunteer_id, :assigned_at])
    |> validate_required([:search_id, :segment_id, :volunteer_id, :assigned_at])
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:volunteer_id)
  end
end
