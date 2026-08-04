defmodule FindThemApi.ZonesTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Zones}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_zones", %{email: "z@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    %{search: search}
  end

  test "upsert_zone/3 creates a zone when none exists yet", %{search: search} do
    {:ok, zone} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "assigned"})

    assert zone.search_id == search.id
    assert zone.h3_index == "891f1d48177ffff"
    assert zone.status == "assigned"
    assert zone.searched_at == nil
  end

  test "upsert_zone/3 sets searched_at when status becomes searched", %{search: search} do
    {:ok, zone} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})

    assert zone.status == "searched"
    assert zone.searched_at != nil
  end

  test "upsert_zone/3 clears searched_at when status moves off searched", %{search: search} do
    {:ok, _} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})
    {:ok, zone} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "not_assigned"})

    assert zone.status == "not_assigned"
    assert zone.searched_at == nil
  end

  test "upsert_zone/3 is idempotent — calling twice with the same status doesn't error", %{
    search: search
  } do
    {:ok, _} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})
    {:ok, zone} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})

    assert zone.status == "searched"
  end

  test "upsert_zone/3 broadcasts {:zone_updated, zone} on search:#{"{search_id}"}", %{
    search: search
  } do
    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    {:ok, zone} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "assigned"})

    assert_receive {:zone_updated, %{h3_index: "891f1d48177ffff"}}
    assert zone.status == "assigned"
  end

  test "upsert_zone/3 does not clobber segment_id on a status-only update", %{search: search} do
    {:ok, _} =
      Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "assigned", segment_id: "seg-1"})

    {:ok, zone} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "in_progress"})

    assert zone.status == "in_progress"
    assert zone.segment_id == "seg-1"
  end

  test "upsert_zone/3 with an empty attrs map does not reset an existing status", %{
    search: search
  } do
    {:ok, _} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})
    {:ok, zone} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{})

    assert zone.status == "searched"
    assert zone.searched_at != nil
  end

  test "upsert_zone/3 keeps searched_at stable across repeated identical PATCHes", %{
    search: search
  } do
    {:ok, first} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})
    Process.sleep(1100)
    {:ok, second} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "searched"})

    assert first.searched_at == second.searched_at
  end

  test "list_by_search/1 returns zones for the search", %{search: search} do
    {:ok, _} = Zones.upsert_zone(search.id, "891f1d48177ffff", %{status: "assigned"})
    {:ok, _} = Zones.upsert_zone(search.id, "891f1d48178ffff", %{status: "not_assigned"})

    zones = Zones.list_by_search(search.id)

    assert length(zones) == 2
  end
end
