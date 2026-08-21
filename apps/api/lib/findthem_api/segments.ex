defmodule FindThemApi.Segments do
  import Ecto.Query

  alias FindThemApi.Repo
  alias FindThemApi.Searches
  alias FindThemApi.Searches.Segment
  alias FindThemApi.Volunteers

  def list_by_search(search_id) do
    Segment
    |> where(search_id: ^search_id)
    |> Repo.all()
  end

  # apps/geo re-numbers segment_id from scratch on every generation — it's
  # an array index into that run's output, not a stable geographic key
  # (unlike the old per-h3-cell zones, where h3_index stayed valid across
  # regenerates). Reusing on_conflict: :nothing here would silently carry a
  # stale "searched" status onto a same-numbered but physically different
  # segment after a regenerate, so this replaces the whole set instead:
  # every regenerate resets segment progress for the search (locks
  # included — see lock/4's own comment).
  def seed_segments(search_id, entries) do
    Repo.delete_all(from(s in Segment, where: s.search_id == ^search_id))

    rows =
      Enum.map(entries, fn %{segment_id: segment_id} ->
        %{search_id: search_id, segment_id: segment_id, status: "not_assigned"}
      end)

    {count, _} = Repo.insert_all(Segment, rows)
    {:ok, count}
  end

  # Update-only, not upsert — segment rows are only ever created by
  # seed_segments/2 from a real generation. A PATCH for a segment_id with no
  # backing row (never generated, or stale after a regenerate) returns
  # :not_found rather than creating one; letting a PATCH blindly create rows
  # let a client inflate total_segments/segments_searched in
  # Searches.aggregates_for with segments that don't correspond to any real
  # geo feature.
  #
  # Known accepted race: this read-then-write isn't wrapped in a
  # transaction, so a PATCH racing a concurrent regenerate (seed_segments'
  # delete_all + insert_all) can still land on a *new* row that happens to
  # reuse the same segment_id, silently attaching a stale status to an
  # unrelated polygon instead of failing loudly. Closing that fully would
  # need generation-scoped segment identity (out of scope here) — this fix
  # only guarantees the *no matching row at all* case fails cleanly instead
  # of raising Ecto.StaleEntryError, matching the low-frequency-action
  # risk-acceptance already established for rotate_join_token/2 above.
  #
  # `actor` distinguishes a volunteer's own PATCH (subject to the lock
  # check below) from the coordinator's (never blocked by a lock — a
  # coordinator can already unlock outright, so the lock has no reason to
  # also block their own direct edit through the same shared function).
  # Defaults to :volunteer, not :coordinator — the *restrictive* branch is
  # the safe default for a security-relevant check like this one (same
  # "unless you've deliberately checked, assume the more restrictive case"
  # reasoning SearchChannel's own moduledoc states); both current callers
  # already pass an explicit actor, so this only matters for whatever
  # forgets to.
  def update_segment_status(search_id, segment_id, attrs, opts \\ []) do
    actor = Keyword.get(opts, :actor, :volunteer)

    case Repo.get_by(Segment, search_id: search_id, segment_id: segment_id) do
      nil ->
        {:error, :not_found}

      segment ->
        attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)
        generation = Searches.latest_generation(search_id)

        with :ok <- check_lock(segment, actor, attrs),
             :ok <- check_generation(attrs, generation) do
          changeset_attrs =
            attrs
            |> put_searched_at(segment, generation)
            |> maybe_clear_lock(segment, actor, attrs)

          segment
          |> Segment.changeset(changeset_attrs)
          |> Repo.update()
          |> broadcast(search_id)
        end
    end
  rescue
    # opts (a function argument, bound before this implicit try) is what's
    # visible here — actor/retry? derived from it inside the body above are
    # not, that's why they're re-derived from opts again rather than reused.
    _e in Ecto.StaleEntryError ->
      # The row was deleted (regenerate) between our read and write.
      {:error, :not_found}

    e in Ecto.ConstraintError ->
      if Keyword.get(opts, :retry, true) do
        update_segment_status(search_id, segment_id, attrs, Keyword.put(opts, :retry, false))
      else
        reraise(e, __STACKTRACE__)
      end
  end

  # A locked segment rejects a volunteer PATCH from anyone except the
  # volunteer it's reserved for — that volunteer's own PATCH is allowed
  # (though it only *clears* the lock on a genuine transition into
  # "searched" — see maybe_clear_lock/4). The coordinator's own edits are
  # never blocked by a lock they can already remove outright via unlock/2.
  defp check_lock(%Segment{locked_at: nil}, _actor, _attrs), do: :ok
  defp check_lock(_segment, :coordinator, _attrs), do: :ok

  defp check_lock(%Segment{locked_for_volunteer_id: volunteer_id}, :volunteer, %{
         "searched_by_volunteer_id" => volunteer_id
       })
       when not is_nil(volunteer_id) do
    :ok
  end

  defp check_lock(_segment, :volunteer, _attrs), do: {:error, :segment_locked}

  # Only relevant when the caller actually stamps a generation_id (Story
  # #54's offline outbox — a queued mark_segment action records the
  # generation that was current when the volunteer tapped it, widening the
  # already-accepted read-then-write race above from milliseconds to
  # however long the action sat in the queue). Absent entirely for every
  # live, online write (both the coordinator's and a volunteer's own
  # in-the-moment PATCH), which is why this defaults to :ok rather than
  # requiring a match — this check exists to catch a *stale replay*, not
  # to demand every caller thread a generation id through.
  defp check_generation(%{"generation_id" => generation_id}, generation)
       when is_binary(generation_id) and generation_id != "" do
    case generation do
      %{id: ^generation_id} -> :ok
      _ -> {:error, :stale_generation}
    end
  end

  defp check_generation(_attrs, _generation), do: :ok

  # Only clears on a genuine transition into "searched" — the reserved
  # volunteer having finished the work, not merely having sent *any*
  # successful PATCH. Two real bugs this closes, both confirmed by review:
  # (1) resuming to "in_progress" (the natural first tap after
  # reconnecting) used to release the lock two steps before the work was
  # actually done, reopening the exact duplicate-work window the lock
  # exists to close; (2) an empty-body PATCH ({} — Map.take(params,
  # ["status"]) yields that when no status is sent) used to let the
  # reserved volunteer dissolve a coordinator's lock — including one they
  # were never meant to hold, see lock/4's own comment on why
  # locked_for_volunteer_id is never inferred from this same volunteer's
  # own searched_by_volunteer_id — without making any real change at all.
  defp maybe_clear_lock(changeset_attrs, %Segment{locked_at: nil}, _actor, _attrs),
    do: changeset_attrs

  defp maybe_clear_lock(
         changeset_attrs,
         %Segment{locked_for_volunteer_id: volunteer_id},
         :volunteer,
         %{"searched_by_volunteer_id" => volunteer_id, "status" => "searched"}
       )
       when not is_nil(volunteer_id) do
    Map.merge(changeset_attrs, %{
      "locked_at" => nil,
      "locked_by_user_id" => nil,
      "locked_for_volunteer_id" => nil,
      "lock_reason" => nil
    })
  end

  defp maybe_clear_lock(changeset_attrs, _segment, _actor, _attrs), do: changeset_attrs

  # Sticky: searched_at is set once on the transition into "searched" and
  # left alone on repeat PATCHes with the same status.
  defp put_searched_at(
         %{"status" => "searched"} = attrs,
         %Segment{
           status: "searched",
           searched_at: existing
         },
         _generation
       )
       when not is_nil(existing) do
    attrs
  end

  defp put_searched_at(%{"status" => "searched"} = attrs, _segment, generation) do
    Map.put(attrs, "searched_at", clamp_occurred_at(attrs["occurred_at"], generation))
  end

  defp put_searched_at(%{"status" => _other} = attrs, _segment, _generation),
    do: Map.put(attrs, "searched_at", nil)

  defp put_searched_at(attrs, _segment, _generation), do: attrs

  # occurred_at is entirely client-supplied (Story #54's offline outbox —
  # a sweep completed at 09:00 but synced at 13:00 must record as 09:00,
  # not sync time, or the coverage timeline lies and, combined with
  # apps/mobile's own time-based decay-for-searched rendering, makes a
  # genuinely stale mark display as freshly done). Clamped, not rejected —
  # a suspect field-device clock shouldn't fail an otherwise-legitimate
  # "I searched this" report, it should just get bounded into the
  # plausible window: not before the search's current generation existed
  # (this segment's polygon didn't exist for the volunteer to have walked
  # before that), not after now. Falls back to now when absent, unparseable,
  # or there's no generation to bound against (a segment can't exist
  # without one in practice, but this stays defensive rather than crashing).
  defp clamp_occurred_at(raw, generation) do
    now = DateTime.utc_now()

    raw
    |> parse_occurred_at()
    |> case do
      {:ok, dt} -> dt
      :error -> now
    end
    |> clamp_not_before(generation)
    |> clamp_not_after(now)
    |> DateTime.truncate(:second)
  end

  defp parse_occurred_at(value) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, dt, _offset} -> {:ok, dt}
      _ -> :error
    end
  end

  defp parse_occurred_at(%DateTime{} = value), do: {:ok, value}
  defp parse_occurred_at(_value), do: :error

  defp clamp_not_before(dt, %{inserted_at: lower}) when not is_nil(lower) do
    if DateTime.compare(dt, lower) == :lt, do: lower, else: dt
  end

  defp clamp_not_before(dt, _generation), do: dt

  defp clamp_not_after(dt, now) do
    if DateTime.compare(dt, now) == :gt, do: now, else: dt
  end

  # Coordinator-only (enforced by the caller — SegmentController scopes via
  # Searches.get_search_for_owner/2 the same as update_segment_status/3's
  # coordinator path; there is no volunteer-facing route to this
  # function). Update-only, same shape as update_segment_status/3 — a
  # lock references a row seed_segments/2 already created, there's
  # nothing to create here.
  #
  # locked_for_volunteer_id is REQUIRED, never inferred from the segment's
  # own searched_by_volunteer_id. It's tempting to default it (the common
  # case really is "lock the segment the currently-working volunteer is
  # on") but searched_by_volunteer_id is volunteer-writable — any approved
  # volunteer can set it just by PATCHing the segment to any status at
  # all. An implicit default sourced from it would let a volunteer make
  # THEMSELVES the reservee of a future lock they were never meant to
  # hold (by touching the segment first), and then dissolve that lock
  # with their own next PATCH — silently defeating a coordinator's hazard
  # lock. A UI can still pre-fill a suggested volunteer for the
  # coordinator to confirm; the backend requires an explicit, deliberate
  # choice either way.
  def lock(search_id, segment_id, locked_by_user_id, attrs \\ %{}) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    case Repo.get_by(Segment, search_id: search_id, segment_id: segment_id) do
      nil ->
        {:error, :not_found}

      segment ->
        with {:ok, locked_for_volunteer_id} <- require_locked_for(attrs),
             :ok <- validate_volunteer_in_search(locked_for_volunteer_id, search_id) do
          segment
          |> Segment.changeset(%{
            "locked_at" => DateTime.utc_now() |> DateTime.truncate(:second),
            "locked_by_user_id" => locked_by_user_id,
            "locked_for_volunteer_id" => locked_for_volunteer_id,
            "lock_reason" => Map.get(attrs, "lock_reason")
          })
          |> Repo.update()
          |> broadcast(search_id)
        end
    end
  rescue
    _e in Ecto.StaleEntryError -> {:error, :not_found}
  end

  defp require_locked_for(%{"locked_for_volunteer_id" => id}) when is_binary(id) and id != "",
    do: {:ok, id}

  defp require_locked_for(_attrs), do: {:error, :volunteer_required}

  def unlock(search_id, segment_id) do
    case Repo.get_by(Segment, search_id: search_id, segment_id: segment_id) do
      nil ->
        {:error, :not_found}

      segment ->
        segment
        |> Segment.changeset(%{
          "locked_at" => nil,
          "locked_by_user_id" => nil,
          "locked_for_volunteer_id" => nil,
          "lock_reason" => nil
        })
        |> Repo.update()
        |> broadcast(search_id)
    end
  rescue
    _e in Ecto.StaleEntryError -> {:error, :not_found}
  end

  # Same "must be a real, currently-working resource" bar SegmentAssignments.
  # assign/3 already applies — a pending/removed volunteer isn't one, and a
  # volunteer_id from a different search must not be reachable through a
  # foreign search_id (mirrors get_volunteer_in_search's own scoping).
  defp validate_volunteer_in_search(volunteer_id, search_id) do
    case Volunteers.get_volunteer_in_search(search_id, volunteer_id) do
      {:ok, %{status: "approved"}} -> :ok
      {:ok, %{status: _other}} -> {:error, :volunteer_not_approved}
      {:error, :not_found} -> {:error, :volunteer_not_approved}
    end
  end

  defp broadcast({:ok, %Segment{} = segment} = result, search_id) do
    Phoenix.PubSub.broadcast(
      FindThemApi.PubSub,
      "search:#{search_id}",
      {:segment_updated, segment}
    )

    result
  end

  defp broadcast(error, _search_id), do: error
end
