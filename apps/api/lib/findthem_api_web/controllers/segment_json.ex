defmodule FindThemApiWeb.SegmentJSON do
  def index(%{segments: segments}) do
    %{data: Enum.map(segments, &segment_data/1)}
  end

  def show(%{segment: segment}) do
    %{data: segment_data(segment)}
  end

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted %Segment{}
  # struct the same way, instead of pushing it raw (which won't JSON-encode).
  def segment_data(segment) do
    %{
      search_id: segment.search_id,
      segment_id: segment.segment_id,
      status: segment.status,
      searched_at: segment.searched_at,
      searched_by_volunteer_id: segment.searched_by_volunteer_id
    }
  end
end
