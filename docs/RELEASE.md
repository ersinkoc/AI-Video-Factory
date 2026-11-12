# Release ownership and recovery

The root version is maintained by `scripts/release.ts`:

```sh
pnpm release patch --dry-run
pnpm release patch
pnpm release minor --publish
```

The helper requires `main` and a clean working tree, calculates the next version and notes, then runs typecheck and tests. It compares branch, HEAD and clean-tree status again after validation, before writing metadata. Changes during those checks abort the release with the current files and commits preserved. The version commit explicitly includes only `package.json` and `CHANGELOG.md`; another file staged just before commit stays outside the release commit.

## Failure behavior

An error after metadata writing preserves the current working files, index, commits and tags. The helper performs no automatic rollback. This includes generated metadata from this invocation: it may remain staged or unstaged after a failed commit. A failed tag operation keeps a successfully created release commit. If another process creates a newer commit or a conflicting tag, those are preserved too.

The error prints `git status`, `git diff` and `git diff --cached` inspection guidance. When the release commit hash is known, it identifies that exact commit for completing a missing tag. It does not infer that the current HEAD or tag still belongs to the failed invocation.

This policy addresses reproduced data loss: the old post-commit cleanup reset the entire index/working tree, and pre-commit cleanup overwrote later edits to metadata. Comparing files before restoring them cannot lock out an independent writer between comparison and mutation. Keeping the failure state permits review without destructive compensation.

## Recovery

First inspect the state:

```sh
git status --short
git diff -- package.json CHANGELOG.md
git diff --cached -- package.json CHANGELOG.md
git log -3 --oneline
```

- **Validation refused a changed tree:** no release metadata was written. Finish the parallel work, obtain a clean tree and repeat the release checks.
- **Metadata exists without a release commit:** review both index and working-file diffs. Preserve changes that belong to another writer. Either finish the intended metadata commit or undo only reviewed release hunks using your editor/Git tools; the helper does not do that review automatically. Do not start a second version bump over this partial state.
- **Release commit exists, tag is missing:** use the exact commit hash from the error. Inspect its contents and the proposed version, and ensure the tag is still absent before creating it. Keep the intended release notes in the annotated tag. Do not bump the version again just to retry tagging.
- **A tag already exists:** inspect where it points and who created it. The helper does not remove or replace it.
- **Push or GitHub release creation failed:** the existing publication error retains the prepared commit/tag and supplies continuation commands. Check the remote state before retrying publication.

The clean-tree/HEAD checks are checkpoints, not a repository-wide lock. Keep release metadata quiescent while the helper writes it. Git hooks can change repository state and require their own review. This change does not claim to serialize arbitrary external writers, certify published assets or configure required GitHub status checks.

## Tests and CI

```sh
pnpm exec vitest run scripts/release.test.ts
pnpm exec vitest run --config vitest.release.config.ts
pnpm typecheck
pnpm test:coverage
```

The normal suite tests the real release entry point and filesystem with a deterministic Git/check-process boundary. Twelve scenarios cover normal completion, concurrent file/index changes, a newer commit, foreign tags, generated/new metadata retained after failure, validation-time HEAD/branch/tree changes and a late unrelated staged file. Forbidden cleanup commands are asserted absent. Event callbacks force completion order; there are no race sleeps.

The separate target runs those ownership scenarios against real, disposable Git repositories outside the shared checkout. It configures a fixture-only identity, disables signing/hooks there, and mocks expensive validation commands and injected failures. Git process startup measured 1.9–2.8 seconds locally, so its setup and process tests have explicit bounded budgets. It is part of the CI verification job. Neither target pushes a real repository or contacts GitHub/providers.

The root 100% coverage include covers `packages/*/src` and `apps/*/src`; it does not instrument root release scripts. The dedicated functional tests are the release-helper evidence. A green unit/coverage job does not replace the real-Git target or hosted CI verification. Existing release-helper typecheck/test gates and publication flags remain unchanged.

## Verification on 12 November 2026

Validated on Windows with Node.js 26.13.0, pnpm 11.25.0, Vitest 5.0.5 and Git 2.56.0.windows.4, against `4057df4` plus the current working tree.

| Check | Observed result |
| --- | --- |
| Before proof | All three defects reproduced against the unmodified helper; normal release control passed |
| Real-Git target after patch | 12 passed, no skipped cases; original failure inputs no longer reproduced |
| Independent unit verifier | 12 scenarios passed three consecutive runs, including the ordered neighboring ownership cases |
| Full coverage suite | 2,160 passed in 195 files; two opt-in database/S3 tests skipped; lines/branches/functions/statements 100% |
| Typecheck | Passed |
| Workflow / whitespace | `actionlint` and `git diff --check` passed |
| Actual dirty-checkout `--dry-run` | Refused with exit 1 before a version write, commit, tag or publication |

Existing Studio paths (`steps.tsx` and `src/lib/i18n.ts`) and their notes in `CLAUDE.md` changed outside this release task while the round was in progress. They were left intact. The final full suite included the newer Studio source; its results are working-tree evidence, not certification of the published tag. Socket MaxListeners warnings remained without a leak diagnosis. Studio production build/browser behavior, database/S3 services and hosted CI were not rerun in this release-helper round. Coverage evidence is retained in this round's completed command log; the shared `coverage/` report directory was unavailable during final fingerprint capture.

The audit ledger and before/after proofs are retained under `.temp_files/ledger_release-ownership.md` and `.temp_files/release-ownership-2026-11-12/`. No commit, tag, push or new release was created in the shared source repository. Real-Git test commits/tags existed only in owned disposable fixtures.
