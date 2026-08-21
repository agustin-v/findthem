defmodule FindThemApiWeb.MessageJSON do
  def index(%{messages: messages}) do
    %{data: Enum.map(messages, &message_data/1)}
  end

  def show(%{message: message}) do
    %{data: message_data(message)}
  end

  # Public so FindThemApiWeb.SearchChannel can shape a broadcasted %Message{}
  # struct the same way, instead of pushing it raw (which won't JSON-encode).
  def message_data(message) do
    %{
      id: message.id,
      search_id: message.search_id,
      volunteer_id: message.volunteer_id,
      sender: message.sender,
      text: message.text,
      sent_at: message.sent_at,
      inserted_at: message.inserted_at
    }
  end
end
