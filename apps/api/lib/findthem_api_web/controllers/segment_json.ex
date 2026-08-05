defmodule FindThemApiWeb.SegmentJSON do
  def index(%{segments: segments}) do
    %{data: Enum.map(segments, &data/1)}
  end

  def show(%{segment: segment}) do
    %{data: data(segment)}
  end

  defp data(segment) do
    %{
      search_id: segment.search_id,
      segment_id: segment.segment_id,
      status: segment.status,
      searched_at: segment.searched_at,
      searched_by_volunteer_id: segment.searched_by_volunteer_id
    }
  end
end
