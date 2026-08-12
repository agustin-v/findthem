ExUnit.start()
Ecto.Adapters.SQL.Sandbox.mode(FindThemApi.Repo, :manual)

Mox.defmock(FindThemApi.Geo.ClientMock, for: FindThemApi.Geo.ClientBehaviour)
Mox.defmock(FindThemApi.Photos.StorageMock, for: FindThemApi.Photos.StorageBehaviour)
