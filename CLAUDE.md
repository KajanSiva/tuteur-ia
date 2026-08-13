# tuteur-ia

Socratic AI tutor with compounding memory — multi-child (parent admin +
per-child logins), any school subject. See the [README](README.md) for the
project overview. This file holds working conventions.

## Stack

pnpm workspaces + Turborepo, Node 20.19+.
`apps/backend` (Fastify + Prisma + Postgres) · `apps/frontend` (React + Vite +
Tailwind v4 + shadcn/ui) · `packages/shared` (shared TS contracts).

## Commands

- `pnpm dev` — backend (:3001) + frontend (:5173) together
- `pnpm build` / `pnpm typecheck` — all packages
- `pnpm test` — needs Postgres up; auto-provisions a dedicated `tuteur_test` DB
- `docker compose up -d postgres` then `pnpm --filter @tuteur/backend db:migrate`

The Prisma 7 client is generated (gitignored) into `apps/backend/src/generated`;
run `db:migrate` or `db:generate` before `typecheck`/`build` on a fresh checkout.

Before starting dev servers, check that nothing stale already holds :3001 / :5173
(EADDRINUSE bites otherwise) — kill leftovers first.

## Conventions

- **Comments: English only, and only about the code.** Never progress or status
  narration ("stub for now", "wired in a later slice", references to steps).
  Notes about the plan belong in the conversation, not in source.
- **Styling: tokens, never hardcoded values.** Colors/radius/fonts are CSS
  variables in `apps/frontend/src/index.css` (the "Atelier" theme); use the
  Tailwind token classes (`bg-primary`, `text-muted-foreground`, …). To tame long
  class lists, extract a component with CVA variants (like `Button`,
  `MessageBubble`) — do not extract class strings via `@apply`.
- **Work in small, verifiable slices; one commit per validated slice.**

## Testing

Vitest, with `*.test.ts` co-located next to the code. Integration tests run
against the auto-provisioned `tuteur_test` database (Postgres must be up).

- **A test must be able to fail for a real bug.** Assert the *behaviour* a
  function produces — mastery overlaid → the unknown set shrinks; silence → NOOP,
  never DELETE — not seed literals, row counts, or "the ORM returned something".
  Coupling to fixture content is a light smoke check at most, never the point.
- **Never mock the database.** Correctness here lives in real SQL: anti-joins,
  transactions, merge-not-overwrite. A mocked repository tests nothing — hit real
  Postgres.
- **Functional core / imperative shell.** Where logic is dense (the memory applier
  above all), split a *pure decision* (current state + proposed ops → actions)
  from the *thin persistence* (write current state + `*_history` in one
  transaction). Unit-test the pure core exhaustively with zero DB — instant, and
  it belongs in a vitest project with no DB `globalSetup`. Integration-test the
  shell with a few cases proving the atomic write actually lands.
- **Each branch once.** Cover both sides of every conditional, every `throw`, the
  empty/zero case, and every "absence = X" rule (unknown = no row). One test per
  distinct behaviour — no near-duplicates, nothing that re-tests the framework.
- **Isolate, then concentrate.** Each test cleans the rows it writes (`afterEach`)
  and depends on no other; DB tests run serialized. Put the density where the risk
  is — the applier's write policy (silence≠contradiction, merge, `is_locked`,
  history provenance) — not on getters or glue.
