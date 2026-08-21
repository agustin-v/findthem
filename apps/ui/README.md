# FindThem UI

React/TypeScript coordinator frontend for the FindThem search-and-rescue platform —
create a search, generate road-bounded segments, manage volunteers, chat, and track
coverage on a live map. See `CLAUDE.md` for full architecture, data flow, and key files.

**Stack:** React 19 · TypeScript · Vite · TailwindCSS · shadcn/ui · Zustand · React Query ·
React Hook Form + Zod · i18next · Clerk (auth) · MapLibre + TomTom (maps)

## Run

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

Requires `.env` (see `.env.example`) — a `VITE_TOMTOM_API_KEY`, `VITE_API_URL` pointing
at `apps/api` (default `http://localhost:4000`), and a `VITE_CLERK_PUBLISHABLE_KEY`.
This app never talks to `apps/geo` directly — segment generation is proxied through
`apps/api`.

## Test & lint

```sh
pnpm test    # vitest
pnpm build   # type-check + build
pnpm lint    # eslint
```
