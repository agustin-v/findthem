# FindThem Volunteer App

Expo/React Native volunteer app for the FindThem search-and-rescue platform — join a
search via a coordinator-shared code, see your assigned road-bounded segments on a live
map, mark them searched, report sightings/hazards, and chat with the coordinator. Built
to keep working with poor or no connectivity: an encrypted local cache renders the map
offline, a durable outbox queues writes until they can sync, and map tiles can be
downloaded ahead of time. See `CLAUDE.md` for full architecture and key files.

**Stack:** Expo SDK 57 · React Native · TypeScript · Expo Router (file-based) ·
expo-secure-store · expo-sqlite (SQLCipher-encrypted) · MapLibre + TomTom

## Run

```sh
pnpm install
pnpm start   # Expo dev server — press i/a for a simulator/emulator, or `pnpm web`
```

Requires `.env` (see `.env.example`) — `EXPO_PUBLIC_API_URL` pointing at `apps/api`
(default `http://localhost:4000`) and `EXPO_PUBLIC_TOMTOM_API_KEY`.

The native map view (`@maplibre/maplibre-react-native`) has no web backing — `pnpm web`
only renders the join/pending flow. Testing the map/offline features needs a native
dev-client build (`npx expo run:ios` / `run:android`); no EAS project is linked yet.

## Test & lint

```sh
pnpm test   # vitest — pure-logic modules only (policy/adapter split, see CLAUDE.md)
pnpm lint
```
