# Development guide

[Documentation](README.md) · [Project home](../README.md)

Read [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md) for repository conventions. The [project
plan](PROJE_PLANI.md) is the architecture and roadmap document (Turkish); it includes planned work as well as
design decisions.

## Repository layout

| Path | Contents |
|---|---|
| `packages/core` | Shared Zod schemas, money in micro-dollars, quality-gate rules, model roles, versions |
| `packages/media-gateway` | Every paid generation call: cost and quality router, cache, budget cap, fallback |
| `packages/agents` | Claude Agent SDK agents with JSON-schema output |
| `packages/pipeline` | Episode state machine and stages, references, map and flag generation, estimates |
| `packages/video` | Remotion compositions, including the vector scene renderer, PixiJS (WebGL) particle atmospheres, a three.js 3D globe for planet-scale maps, paper.js-measured draw-on reveals, GSAP kinetic text, Manim formula/graph boards, synthesized background music and frame-locked sound effects |
| `packages/storage`, `packages/db` | Local or S3 asset store; Postgres cost ledger |
| `apps/studio` | Next.js Studio |
| `apps/cli` | `pnpm ys` |
| `apps/worker` | Trigger.dev task (optional) |

## Commands

The checked-in GitHub workflow runs coverage, types, the Studio build, an offline render/audit smoke and
disposable PostgreSQL/RustFS integration. See [Continuous verification](CI.md) for local commands, retained
evidence and release boundaries.

| Command | What it does |
|---|---|
| `pnpm studio` / `studio:build` / `studio:start` | Studio in development or production mode |
| `pnpm ys …` | CLI |
| `pnpm ys doctor [--json] [--check-local]` | [Local environment diagnostics](DOCTOR.md), without generation or paid calls |
| `pnpm typecheck` | TypeScript 7 check |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:coverage` | Unit tests with coverage; fails below 100% lines/branches/functions/statements |
| `pnpm test:integration` | Postgres and RustFS tests (needs Docker) |
| `pnpm release` | Version bump, changelog and tag |
| `pnpm db:generate` / `db:migrate` | Drizzle migrations |
| `pnpm infra:up` / `infra:down` | Docker infrastructure |

## Releases

The root `package.json` owns the version. The release helper requires `main` and a clean working tree, and
runs typecheck and tests before changing version metadata.

```sh
pnpm release patch --dry-run
pnpm release patch
pnpm release minor --publish
```

A plain release is local; `--publish` also pushes and creates a GitHub release. Read [Release ownership and
recovery](RELEASE.md) before publishing or resuming a failed release.
