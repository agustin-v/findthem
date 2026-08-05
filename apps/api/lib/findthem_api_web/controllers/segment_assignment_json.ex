defmodule FindThemApiWeb.SegmentAssignmentJSON do
  def index(%{assignments: assignments}) do
    %{data: Enum.map(assignments, &data/1)}
  end

  def show(%{assignment: assignment}) do
    %{data: data(assignment)}
  end

  defp data(assignment) do
    %{
      search_id: assignment.search_id,
      segment_id: assignment.segment_id,
      volunteer_id: assignment.volunteer_id,
      assigned_at: assignment.assigned_at
    }
  end
end
