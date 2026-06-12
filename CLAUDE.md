# tuteur-ia

Socratic AI tutor (CM2 / History) with compounding memory. **Design source of
truth: [AGENT-BRIEF.md](AGENT-BRIEF.md)** — read it before non-trivial work.
This file only holds working conventions, not the design.

## Stack

pnpm workspaces + Turborepo, Node 20+.
`apps/backend` (Fastify + Prisma + Postgres) · `apps/frontend` (React + Vite +
Tailwind v4 + shadcn/ui) · `packages/shared` (shared TS contracts).

## Commands

- `pnpm dev` — backend (:3001) + frontend (:5173) together
- `pnpm build` / `pnpm typecheck` — all packages
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
