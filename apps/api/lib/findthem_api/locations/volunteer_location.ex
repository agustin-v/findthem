defmodule FindThemApi.Locations.VolunteerLocation do
  use Ecto.Schema
  import Ecto.Changeset

  # Small tolerance for a mobile device's clock being slightly ahead of the
  # server's, not zero — the point is to reject an implausible timestamp
  # (a forged/misconfigured clock claiming a ping from next year), not to
  # nitpick ordinary drift.
  @future_tolerance_seconds 300

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "volunteer_locations" do
    belongs_to :search, FindThemApi.Searches.Search
    belongs_to :volunteer, FindThemApi.Volunteers.Volunteer

    field :lat, :float
    field :lng, :float
    field :recorded_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(location, attrs) do
    location
    |> cast(attrs, [:search_id, :volunteer_id, :lat, :lng, :recorded_at])
    |> validate_required([:search_id, :volunteer_id, :lat, :lng, :recorded_at])
    |> validate_number(:lat, greater_than_or_equal_to: -90, less_than_or_equal_to: 90)
    |> validate_number(:lng, greater_than_or_equal_to: -180, less_than_or_equal_to: 180)
    |> validate_recorded_at_not_future()
    |> foreign_key_constraint(:search_id)
    |> foreign_key_constraint(:volunteer_id)
  end

  # recorded_at is entirely client-supplied (the mobile device's own GPS
  # timestamp) and, unvalidated, is what last_known_by_search/1 sorts by —
  # one ping dated far in the future would win that ordering forever and
  # freeze the coordinator's live dot at a stale/false position no later
  # genuine ping could ever displace. Same shape as Search's own
  # validate_lkp_at_not_future.
  defp validate_recorded_at_not_future(changeset) do
    validate_change(changeset, :recorded_at, fn :recorded_at, recorded_at ->
      limit = DateTime.add(DateTime.utc_now(), @future_tolerance_seconds, :second)

      if DateTime.compare(recorded_at, limit) == :gt do
        [recorded_at: "cannot be in the future"]
      else
        []
      end
    end)
  end
end
