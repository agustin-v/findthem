defmodule FindThemApiWeb.MultipartLengthTest do
  @moduledoc """
  Regression test for the Plug.Parsers :multipart :length override in
  endpoint.ex. Plug's undocumented-here default is 8MB per parser, which
  would silently reject anything between ~8-10MB before it ever reached
  Photos.upload/2's own 10MB check — a real bug, caught only by testing a
  real HTTP request against the running dev server, because
  Phoenix.ConnTest's %Plug.Upload{}-in-params shortcut (used by
  photo_controller_test.exs) sets conn.params directly and never touches
  the real body-reading/length-limiting code path at all.

  This calls FindThemApiWeb.Endpoint.call/2 directly with a genuine raw
  multipart body (not the %Plug.Upload{} shortcut), so it runs through the
  endpoint's *actual* configured Plug.Parsers — not a copy of the options
  hardcoded in this test file, which would pass regardless of what
  endpoint.ex really configures. No valid auth token is provided; the
  point isn't to reach PhotoController, just to distinguish "rejected for
  size before parsing finished" (413, Plug.Parsers.RequestTooLargeError)
  from "parsed fine, rejected by auth instead" (401) — the same
  distinguishing technique used to originally catch and verify this fix
  live against the dev server.
  """
  use ExUnit.Case, async: true

  test "a 9MB photo upload clears the real endpoint's multipart length limit" do
    conn =
      9 * 1024 * 1024
      |> multipart_conn()
      |> Plug.Conn.put_req_header("authorization", "Bearer garbage")

    conn = FindThemApiWeb.Endpoint.call(conn, [])

    assert conn.status == 401
  end

  defp multipart_conn(size) do
    boundary = "findthem-test-boundary"
    file_bytes = :binary.copy(<<0>>, size)

    body =
      "--#{boundary}\r\n" <>
        "Content-Disposition: form-data; name=\"photo\"; filename=\"big.jpg\"\r\n" <>
        "Content-Type: image/jpeg\r\n\r\n" <>
        file_bytes <>
        "\r\n--#{boundary}--\r\n"

    :post
    |> Plug.Test.conn("/api/searches/00000000-0000-0000-0000-000000000000/photos", body)
    |> Plug.Conn.put_req_header("content-type", "multipart/form-data; boundary=#{boundary}")
  end
end
