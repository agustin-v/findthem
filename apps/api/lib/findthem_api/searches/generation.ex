defmodule FindThemApi.Searches.Generation do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "generations" do
    belongs_to :search, FindThemApi.Searches.Search

    field :request_params, :map, default: %{}
    field :meta, :map, default: %{}
    field :response, :map, default: %{}

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(generation, attrs) do
    generation
    |> cast(attrs, [:search_id, :request_params, :meta, :response])
    |> validate_required([:search_id])
    |> foreign_key_constraint(:search_id)
  end
end
