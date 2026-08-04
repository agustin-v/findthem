defmodule FindThemApiWeb.RemarkJSON do
  def index(%{remarks: remarks}) do
    %{data: Enum.map(remarks, &data/1)}
  end

  def show(%{remark: remark}) do
    %{data: data(remark)}
  end

  defp data(remark) do
    %{
      id: remark.id,
      search_id: remark.search_id,
      volunteer_id: remark.volunteer_id,
      kind: remark.kind,
      text: remark.text,
      lat: remark.lat,
      lng: remark.lng,
      reported_at: remark.reported_at,
      inserted_at: remark.inserted_at
    }
  end
end
