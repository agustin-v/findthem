defmodule FindThemApi.Searches.Search do
  use Ecto.Schema
  import Ecto.Changeset

  @subject_types ~w(person animal object)
  @statuses ~w(active suspended resolved)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "searches" do
    belongs_to :owner, FindThemApi.Accounts.User

    field :subject_type, :string
    field :subject_name, :string
    field :subject_details, :map, default: %{}
    field :contact_phone, :string
    field :photo_urls, {:array, :string}, default: []

    field :status, :string, default: "active"

    field :lkp_lat, :float
    field :lkp_lng, :float
    field :lkp_address, :string
    field :lkp_at, :utc_datetime

    field :radius_km, :float
    field :h3_resolution, :integer

    field :join_token, :string

    field :outcome, :string
    field :closed_at, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  def changeset(search, attrs) do
    search
    |> cast(attrs, [
      :owner_id,
      :subject_type,
      :subject_name,
      :subject_details,
      :contact_phone,
      :photo_urls,
      :status,
      :lkp_lat,
      :lkp_lng,
      :lkp_address,
      :lkp_at,
      :radius_km,
      :h3_resolution,
      :join_token,
      :outcome,
      :closed_at
    ])
    |> validate_required([:owner_id, :subject_type, :subject_name, :contact_phone, :join_token])
    |> validate_inclusion(:subject_type, @subject_types)
    |> validate_inclusion(:status, @statuses)
    |> validate_lkp_at_not_future()
    |> unique_constraint(:join_token)
    |> foreign_key_constraint(:owner_id)
  end

  defp validate_lkp_at_not_future(changeset) do
    validate_change(changeset, :lkp_at, fn :lkp_at, lkp_at ->
      if DateTime.compare(lkp_at, DateTime.utc_now()) == :gt do
        [lkp_at: "cannot be in the future"]
      else
        []
      end
    end)
  end
end
