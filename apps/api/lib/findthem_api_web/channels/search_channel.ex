defmodule FindThemApiWeb.SearchChannel do
  @moduledoc """
  Topic `search:<id>`. Joining subscribes this channel process to the same
  raw `search:<id>` PubSub topic every context already broadcasts to
  (Volunteers, Searches, Segments, SegmentAssignments, Remarks).

  `join/3` only authorizes *access to the topic* — it does NOT mean every
  event on that topic is safe to hand to every joined identity. Coordinator
  and volunteer sockets share one topic, but several event payloads carry
  data the REST API deliberately withholds from volunteers (the search's
  `join_token`, other volunteers' name/phone). `handle_info/2` below is where that scoping is enforced,
  per event, per identity — every clause must decide who it's safe to push
  to, not just how to shape the payload. When adding a new broadcast event,
  the safe default is "coordinator only" unless you've deliberately checked
  what a volunteer identity should see.

  A struct type with no matching clause falls through to the catch-all and
  is silently dropped — that's a real gap for whoever adds a new broadcast
  event and forgets to add a clause here, not just defensive coding. It is
  logged at debug level specifically so that's discoverable during
  development instead of being a silent landmine.
  """

  use Phoenix.Channel
  require Logger

  alias FindThemApi.{Searches, Volunteers}

  @impl true
  def join("search:" <> search_id, _params, socket) do
    case authorize(socket, search_id) do
      :ok -> {:ok, socket}
      :error -> {:error, %{reason: "unauthorized"}}
    end
  end

  defp authorize(%{assigns: %{identity: {:coordinator, user}}}, search_id) do
    case Searches.get_search_for_owner(user.id, search_id) do
      {:ok, _search} -> :ok
      _ -> :error
    end
  end

  defp authorize(
         %{assigns: %{identity: {:volunteer, %Volunteers.Volunteer{} = volunteer}}},
         search_id
       ) do
    if volunteer.search_id == search_id, do: :ok, else: :error
  end

  defp authorize(_socket, _search_id), do: :error

  # Coordinator-only: the roster (name/phone/status) has no volunteer-facing
  # REST equivalent at all — GET /volunteer/search deliberately returns none
  # of it (see VolunteerSearchJSON's own header comment). Fires on every
  # join (including still-pending applicants) and every approve/remove.
  @impl true
  def handle_info({event, %FindThemApi.Volunteers.Volunteer{} = volunteer}, socket) do
    if coordinator?(socket) do
      push(socket, to_string(event), %{
        data: FindThemApiWeb.SearchVolunteerJSON.volunteer_data(volunteer)
      })
    end

    {:noreply, socket}
  end

  # Volunteer-authored hazard/sighting reports — deliberately relayed to
  # every identity, not just the coordinator. Unlike the roster/messages
  # cases above and below, this one is *intended* to become a shared,
  # all-volunteers-visible board (coordinator-postable map notices,
  # Story 37) — relaying it to volunteers now is forward-compatible with
  # that, not a scoping bug.
  def handle_info({event, %FindThemApi.Remarks.Remark{} = remark}, socket) do
    push(socket, to_string(event), %{data: FindThemApiWeb.RemarkJSON.remark_data(remark)})
    {:noreply, socket}
  end

  def handle_info({event, %FindThemApi.Searches.Segment{} = segment}, socket) do
    push(socket, to_string(event), %{data: FindThemApiWeb.SegmentJSON.segment_data(segment)})
    {:noreply, socket}
  end

  def handle_info({event, %FindThemApi.Searches.Generation{} = generation}, socket) do
    push(socket, to_string(event), %{
      data: FindThemApiWeb.GenerationController.generation_data(generation)
    })

    {:noreply, socket}
  end

  def handle_info({event, %FindThemApi.Searches.SegmentAssignment{} = assignment}, socket) do
    push(socket, to_string(event), %{
      data: FindThemApiWeb.SegmentAssignmentJSON.assignment_data(assignment)
    })

    {:noreply, socket}
  end

  # Plain map, not a struct (SegmentAssignments.unassign/3 has nothing left
  # to load after Repo.delete_all) — already exactly the shape the client
  # needs, no *_json.ex shaping to reuse.
  def handle_info({:segment_assignment_removed, %{} = payload}, socket) do
    push(socket, "segment_assignment_removed", %{data: payload})
    {:noreply, socket}
  end

  # Coordinator-only: SearchJSON.search_data/1 includes join_token and
  # coordinator-only aggregates (pending_count, rebalance_suggested, ...).
  # A volunteer receiving this would get the *current* join_token on every
  # search_updated broadcast — including the one JoinTokenController.rotate
  # itself fires, which would hand a still-connected, possibly-already-
  # removed volunteer the brand new token at the exact moment rotation is
  # trying to revoke the old one. Volunteers get search fields through
  # GET /volunteer/search (VolunteerSearchJSON) over REST instead; nothing
  # on the volunteer client listens for this event today.
  def handle_info({event, %FindThemApi.Searches.Search{} = search}, socket) do
    if coordinator?(socket) do
      push(socket, to_string(event), %{data: FindThemApiWeb.SearchJSON.search_data(search)})
    end

    {:noreply, socket}
  end

  # Anything else (including Phoenix's own internal channel messages) is
  # dropped — but logged, so a future broadcast event with no matching
  # clause above is discoverable instead of silently going nowhere.
  def handle_info(other, socket) do
    Logger.debug("SearchChannel: unhandled broadcast #{inspect(other)}")
    {:noreply, socket}
  end

  defp coordinator?(%{assigns: %{identity: {:coordinator, _}}}), do: true
  defp coordinator?(_socket), do: false
end
