defmodule FindThemApiWeb.SegmentAssignmentJSON do
  def index(%{assignments: assignments}) do
    %{data: Enum.map(assignments, &assignment_data/1)}
  end

  def show(%{assignment: assignment}) do
    %{data: assignment_data(assignment)}
  end

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted
  # %SegmentAssignment{} struct the same way, instead of pushing it raw
  # (which won't JSON-encode).
  def assignment_data(assignment) do
    %{
      search_id: assignment.search_id,
      segment_id: assignment.segment_id,
      volunteer_id: assignment.volunteer_id,
      assigned_at: assignment.assigned_at
    }
  end
end
