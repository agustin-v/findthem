defmodule FindThemApiWeb.MessageController do
  use FindThemApiWeb, :controller

  alias FindThemApi.{Searches, Messages}

  action_fallback FindThemApiWeb.FallbackController

  # ?volunteer_id= scopes to one thread; omitted returns every thread for
  # the search (apps/ui derives the thread list from the volunteers it
  # already fetches, grouping these by volunteer_id client-side — no
  # separate "list of threads" endpoint).
  def index(conn, %{"search_id" => search_id} = params) do
    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id) do
      messages =
        case params["volunteer_id"] do
          nil -> Messages.list_by_search(search_id)
          volunteer_id -> Messages.list_by_search_and_volunteer(search_id, volunteer_id)
        end

      render(conn, :index, messages: messages)
    end
  end

  # sender is always forced to "coordinator" here, never trusted from the
  # request body — same reasoning as VolunteerRemarkController forcing
  # volunteer_id server-side: the authenticated identity decides who sent
  # it, not client-supplied data.
  def create(conn, %{"search_id" => search_id, "message" => message_params})
      when is_map(message_params) do
    attrs = Map.put(message_params, "sender", "coordinator")

    with {:ok, _search} <- Searches.get_search_for_owner(conn.assigns.current_user.id, search_id),
         {:ok, message} <- Messages.create_message(search_id, attrs) do
      conn
      |> put_status(:created)
      |> render(:show, message: message)
    end
  end

  # A missing OR malformed (non-map) "message" value must not crash —
  # same guard VolunteerMessageController already has.
  def create(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{message: ["can't be blank"]}})
  end
end
