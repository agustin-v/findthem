defmodule FindThemApi.Volunteers.Volunteer do
  use Ecto.Schema
  import Ecto.Changeset

  @statuses ~w(pending approved removed)
  @resource_types ~w(people motorbikes cars drones)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "volunteers" do
    belongs_to :search, FindThemApi.Searches.Search

    field :name, :string
    field :phone, :string
    field :resource_type, :string

    field :status, :string, default: "pending"

    field :consent_name, :boolean, default: false
    field :consent_location, :boolean, default: false
    field :consent_phone, :boolean, default: false

    field :last_active_at, :utc_datetime
    field :joined_at, :utc_datetime
    field :approved_at, :utc_datetime
    field :removed_at, :utc_datetime
  end

  def changeset(volunteer, attrs) do
    volunteer
    |> cast(attrs, [
      :search_id,
      :name,
      :phone,
      :resource_type,
      :status,
      :consent_name,
      :consent_location,
      :consent_phone,
      :last_active_at,
      :joined_at,
      :approved_at,
      :removed_at
    ])
    |> validate_required([:search_id, :name, :phone])
    |> validate_length(:name, max: 200)
    |> validate_length(:phone, max: 32)
    |> validate_inclusion(:status, @statuses)
    |> validate_inclusion(:resource_type, @resource_types)
    |> foreign_key_constraint(:search_id)
  end
end
