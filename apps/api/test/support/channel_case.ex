defmodule FindThemApiWeb.ChannelCase do
  @moduledoc """
  This module defines the test case to be used by
  tests that require setting up a connection to a channel.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import FindThemApiWeb.ChannelCase

      @endpoint FindThemApiWeb.Endpoint
    end
  end

  setup tags do
    FindThemApi.DataCase.setup_sandbox(tags)
    :ok
  end
end
