# Continuous verification

[CI](../.github/workflows/ci.yml) runs on pull requests, pushes to `main`, version tags and manual dispatch. It uses Ubuntu 24.04, Node.js 26.13.0 and the exact pnpm version in the root `packageManager` field. Actions are pinned to commit hashes; installs use `--frozen-lockfile`.

## Required checks

| Job | Checks | Evidence |
| --- | --- | --- |
| Types, coverage and Studio build | Typecheck, real-Git release ownership target, `pnpm test:coverage`, `pnpm studio:build` | Source commit, lockfile hash, tool versions, command logs and coverage summary; 14 days |
| No-generation render and export audits | Existing `render-demo`, explicit audit of its MP4, `quality:preview` | MP4s, state/audit JSON, media hashes and logs; 7 days |
| PostgreSQL and RustFS integration | Migrations, then `pnpm test:integration` against disposable services | Source commit and test log; 14 days |

The default test run deliberately skips the two database/S3 integration cases. The separate integration job enables them with `--mode integration`; its failure is independent of the unit/coverage result. Existing coverage thresholds remain 100% for statements, branches, functions and lines.

FFmpeg and ffprobe are installed explicitly so real encoded-video audit tests run. These fixtures exercise moving footage, black frames, freezes, silence and shot-level audio gaps, including negative assertions. The media job also exercises the actual Remotion bundler/browser/encoder with the existing offline demo. Its store and ledger are created under `out/ci/render`, away from a developer's episodes and `.env`.

The media job supplies no provider credentials. It checks that the render ledger is empty. The quality fixture separately asserts zero generation charges, persists a decision against a main export, audits a portrait Short and rejects carrying that decision to another export identity. Downloading dependencies and Remotion's browser requires network access; no paid generation is part of these jobs.

Technical audit completion is not editorial approval. This smoke test does not certify every vector style, GPU backend, external provider or a complete newly authored episode. HyperFrames production integration is outside this workflow.

## Run the same gates locally

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:coverage
pnpm studio:build
pnpm quality:preview out/ci/quality
```

For the existing real-render demo, use a fresh output directory. Run these commands from the repository root; the relative paths intentionally keep the demo's `.data` in the output directory:

```sh
mkdir -p out/ci/render
cd out/ci/render
STORE=fs LEDGER=jsonl YS_RENDER_GL=swangle node ../../../node_modules/tsx/dist/cli.mjs ../../../apps/cli/src/index.ts render-demo
node ../../../node_modules/tsx/dist/cli.mjs ../../../apps/cli/src/index.ts episode approve <printed-episode-id> preview
node ../../../node_modules/tsx/dist/cli.mjs ../../../apps/cli/src/index.ts episode run <printed-episode-id> --only render
node ../../../node_modules/tsx/dist/cli.mjs ../../../apps/cli/src/index.ts episode audit <printed-episode-id>
```

The demo currently stops at the normal preview approval gate. The commands above approve only this synthetic fixture and resume only its render stage before auditing.

On PowerShell, create the folder with `New-Item -ItemType Directory -Force out/ci/render`, use `Set-Location out/ci/render`, and set `$env:STORE='fs'; $env:LEDGER='jsonl'; $env:YS_RENDER_GL='swangle'` before the same `node` commands.

For storage integration, start the PostgreSQL and RustFS services described in [Setup](../README.md#setup), migrate the database and run:

```sh
pnpm db:migrate
pnpm test:integration
```

The tests insert uniquely named cost records and S3 objects. Use a disposable database and bucket when reproducing CI. CI's service containers exist only for that job; it never connects to a developer's Docker volumes. Redis is not needed by these two tests.

## Evidence and release boundary

Artifact names include the workflow source SHA. For pull requests this is the tested merge commit. The verification and media jobs record `git rev-parse HEAD` and the lockfile SHA-256; the rendered-media manifest links the MP4 and audit files to the same run. Only the listed fixture paths are uploaded, including their hidden `.data` folders. Credentials and a developer's `.env` are not artifacts.

The workflow has read-only repository permission, does not persist checkout credentials and does not publish releases or modify branch protection. To require it before merging, configure the three job names above as required status checks in repository settings. A local pass does not prove a hosted workflow pass; confirm the run's exact commit and all three jobs before using it as release evidence.

`pnpm release` still runs its existing typecheck/test gates. Coverage, production build and the media/storage jobs are separate checks. Its later ownership fixes preserve failed-release state; see [Release ownership and recovery](RELEASE.md). The verification job also runs `pnpm exec vitest run --config vitest.release.config.ts` against disposable local Git repositories.

Action inputs and pinning were checked against the upstream [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [pnpm setup](https://github.com/pnpm/action-setup) and [artifact upload](https://github.com/actions/upload-artifact) documentation. Runner packages and versioned container tags can still change; tool-version logs describe the environment actually used.

## Local verification on 12 November 2026

Validation used Windows, Node.js 26.13.0 and pnpm 11.25.0, starting from `4057df4` plus the existing uncommitted Studio playback/security changes. This is a working-tree result, not certification of the published v0.5.0 tag or a hosted Linux run.

| Check | Observed result |
| --- | --- |
| Workflow syntax | `actionlint` 1.7.12 passed |
| Full coverage run | 193 test files and 2,123 tests passed; two opt-in integration cases skipped; all four coverage metrics 100% |
| Typecheck and Studio production build | Passed in the current workspace and in a fresh source snapshot |
| Fresh install | `pnpm install --frozen-lockfile --offline` passed in the separate snapshot; 610 packages reused |
| Storage integrations | Migrations and `pnpm test:integration` passed against separately named disposable PostgreSQL/RustFS containers: eight tests, including the two previously skipped cases |
| Actual Remotion demo | 1920×1080, 294 frames, 9.8 seconds; explicit MP4 audit complete; no charged ledger entries |
| Main/Short quality fixture | Both technical audits complete; persisted decision and export-identity isolation verified |

The demo's black/freeze, local-motion, audio-level and shot-audio checks completed. Semantic/readability/perceived-audio review was explicitly skipped because it requires editorial review. The coverage run emitted Socket MaxListeners warnings; this run does not establish their cause. The first workspace build encountered a build lock; a retry and the separate clean-snapshot build both passed without deleting the lock or stopping the existing Studio servers.

Local logs, input/media hashes and the preservation check for pre-existing source diffs are under `.temp_files/ci-2026-11-12/`. The rendered fixture remains under `out/ci/render/`. Test containers and their dedicated volumes were removed after verification. No commit, push, GitHub workflow run, required-status configuration or new release was performed in this round.

The fresh-install snapshot remains at `%TEMP%/YoutubeStudio-ci-20261112-snapshot`; automatic approval review blocked its optional recursive cleanup without a more specific reason.

Subsequent diagnostics implementation: the media job now also retains `doctor.json` from
[`pnpm ys doctor --json`](DOCTOR.md). It runs after the browser/render fixture; optional
Manim/LaTeX warnings do not fail the job. This addition still requires a hosted workflow run.
