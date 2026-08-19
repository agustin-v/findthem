defmodule FindThemApi.MessagesTest do
  use FindThemApi.DataCase, async: true

  alias FindThemApi.{Accounts, Searches, Messages, Volunteers}

  setup do
    {:ok, owner} = Accounts.get_or_provision("user_owner_msg", %{email: "msg@example.com"})

    {:ok, search} =
      Searches.create_search(owner.id, %{
        subject_type: "person",
        subject_name: "Marco Rossi",
        contact_phone: "+390612345"
      })

    {:ok, volunteer} = Volunteers.join_volunteer(search.id, %{name: "Giulia", phone: "+39061"})

    %{search: search, volunteer: volunteer}
  end

  test "create_message/2 broadcasts {:message_created, message} on search:#{"{search_id}"}", %{
    search: search,
    volunteer: volunteer
  } do
    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    id = Ecto.UUID.generate()

    {:ok, message} =
      Messages.create_message(search.id, %{
        id: id,
        volunteer_id: volunteer.id,
        sender: "coordinator",
        text: "Check the north fence line"
      })

    assert message.id == id
    assert message.search_id == search.id
    assert_receive {:message_created, %{id: ^id}}
  end

  test "create_message/2 accepts a volunteer_id that belongs to the same search", %{
    search: search,
    volunteer: volunteer
  } do
    {:ok, message} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: volunteer.id,
        sender: "volunteer",
        text: "On my way"
      })

    assert message.volunteer_id == volunteer.id
  end

  test "create_message/2 rejects a volunteer_id that belongs to a different search", %{
    search: search
  } do
    {:ok, owner2} = Accounts.get_or_provision("user_owner_msg_b", %{email: "msgb@example.com"})

    {:ok, other_search} =
      Searches.create_search(owner2.id, %{
        subject_type: "person",
        subject_name: "Someone Else",
        contact_phone: "+390612345"
      })

    {:ok, other_volunteer} =
      Volunteers.join_volunteer(other_search.id, %{name: "Luca", phone: "+39062"})

    {:error, changeset} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: other_volunteer.id,
        sender: "coordinator",
        text: "Hello"
      })

    assert "must belong to the same search" in errors_on(changeset).volunteer_id
  end

  test "create_message/2 requires a volunteer_id, unlike Remarks (a message always belongs to exactly one thread)",
       %{search: search} do
    {:error, changeset} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        sender: "coordinator",
        text: "Hello"
      })

    assert "can't be blank" in errors_on(changeset).volunteer_id
  end

  test "create_message/2 rejects an invalid sender instead of persisting it", %{
    search: search,
    volunteer: volunteer
  } do
    {:error, changeset} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: volunteer.id,
        sender: "bystander",
        text: "Hello"
      })

    assert "is invalid" in errors_on(changeset).sender
  end

  test "create_message/2 replaying the same client-supplied id is a safe no-op, not a crash", %{
    search: search,
    volunteer: volunteer
  } do
    id = Ecto.UUID.generate()

    attrs = %{
      id: id,
      volunteer_id: volunteer.id,
      sender: "volunteer",
      text: "On my way"
    }

    {:ok, _first} = Messages.create_message(search.id, attrs)
    {:ok, _replay} = Messages.create_message(search.id, attrs)

    assert length(Messages.list_by_search(search.id)) == 1
  end

  test "replaying the same id with DIFFERENT text returns the originally-persisted row, not the new text",
       %{search: search, volunteer: volunteer} do
    id = Ecto.UUID.generate()

    {:ok, original} =
      Messages.create_message(search.id, %{
        id: id,
        volunteer_id: volunteer.id,
        sender: "volunteer",
        text: "original"
      })

    {:ok, replay} =
      Messages.create_message(search.id, %{
        id: id,
        volunteer_id: volunteer.id,
        sender: "volunteer",
        text: "overwritten?"
      })

    # on_conflict: :nothing means the second call never actually wrote
    # "overwritten?" — the returned struct (and anything broadcast from
    # it) must reflect the real stored row, not the just-submitted attrs.
    assert replay.text == original.text
    assert replay.text == "original"
    assert [%{text: "original"}] = Messages.list_by_search(search.id)
  end

  test "replaying the same id with different text does not broadcast the unpersisted text", %{
    search: search,
    volunteer: volunteer
  } do
    id = Ecto.UUID.generate()

    Messages.create_message(search.id, %{
      id: id,
      volunteer_id: volunteer.id,
      sender: "volunteer",
      text: "original"
    })

    Phoenix.PubSub.subscribe(FindThemApi.PubSub, "search:#{search.id}")

    Messages.create_message(search.id, %{
      id: id,
      volunteer_id: volunteer.id,
      sender: "volunteer",
      text: "overwritten?"
    })

    assert_receive {:message_created, %{text: text}}
    assert text == "original"
  end

  test "create_message/2 rejects an oversized text instead of hitting the DB column limit", %{
    search: search,
    volunteer: volunteer
  } do
    {:error, changeset} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: volunteer.id,
        sender: "coordinator",
        text: String.duplicate("a", 2001)
      })

    assert "should be at most 2000 character(s)" in errors_on(changeset).text
  end

  test "create_message/2 rejects grapheme-cheap-but-codepoint-heavy text instead of hitting the DB column limit",
       %{search: search, volunteer: volunteer} do
    # A ZWJ family emoji is 1 grapheme but 7 codepoints — 2000 of them is
    # "2000 characters" by grapheme count (what validate_length counts by
    # default) but 14000 codepoints, well past the varchar(2000) column
    # (Postgres bounds by codepoint). Without count: :codepoints on the
    # changeset, this would pass validation and then raise
    # Postgrex.Error: string_data_right_truncation instead of a clean 422.
    family_emoji = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}"
    text = String.duplicate(family_emoji, 2000)
    assert String.length(text) == 2000

    {:error, changeset} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: volunteer.id,
        sender: "coordinator",
        text: text
      })

    assert "should be at most 2000 character(s)" in errors_on(changeset).text
  end

  test "list_by_search_and_volunteer/2 with a malformed volunteer_id returns an empty list instead of crashing",
       %{search: search} do
    assert Messages.list_by_search_and_volunteer(search.id, "not-a-uuid") == []
  end

  test "create_message/2 rejects an empty text", %{search: search, volunteer: volunteer} do
    {:error, changeset} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: volunteer.id,
        sender: "coordinator",
        text: ""
      })

    assert "can't be blank" in errors_on(changeset).text
  end

  test "list_by_search_and_volunteer/2 scopes to one thread", %{
    search: search,
    volunteer: volunteer
  } do
    {:ok, other_volunteer} =
      Volunteers.join_volunteer(search.id, %{name: "Andrea", phone: "+39063"})

    {:ok, _mine} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: volunteer.id,
        sender: "coordinator",
        text: "For Giulia"
      })

    {:ok, _theirs} =
      Messages.create_message(search.id, %{
        id: Ecto.UUID.generate(),
        volunteer_id: other_volunteer.id,
        sender: "coordinator",
        text: "For Andrea"
      })

    thread = Messages.list_by_search_and_volunteer(search.id, volunteer.id)

    assert length(thread) == 1
    assert hd(thread).text == "For Giulia"
  end
end
