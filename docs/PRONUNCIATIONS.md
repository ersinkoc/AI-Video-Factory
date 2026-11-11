# Shared pronunciation rules and episode overrides

The Script tab's **Pronunciation dictionary** manages reusable spoken forms without changing narration spelling or captions. It is available before script generation as well as after rendering. Opening it loads the dictionary on demand; it does not load coding skills into runtime agents or invoke a model.

## Rule precedence

For the episode's base language (`tr-TR` uses `tr`), rules resolve in this order, highest first:

| Layer | Meaning |
| --- | --- |
| Episode override | Explicit editor preference for this episode |
| Shared dictionary | Explicit editor rule reused by episodes in this language |
| Learned/legacy episode term | Existing `state.pronunciations` records, including older manual values |
| Built-in lexicon | Existing project-owned `LEXICON` values |

Term identity ignores case and collapses whitespace between words. `C++` and `c++` cannot coexist as competing priority variants. The effective rule list shows each entry's origin. Shared and episode entries remain individually editable even when a higher layer shadows them.

Choose a scope, enter the written term and spoken form, then save. Removing an entry restores the lower layer. Set the spoken form to the same written term to read it as written, overriding an inherited expansion. Written terms allow 120 characters, spoken forms 240; empty/control-character and reserved object-key inputs are rejected. Shared storage supports 1,000 entries across languages; each episode supports 200 explicit overrides. Existing built-ins are retained.

Shared rules do not rewrite legacy episode terms or silently invalidate every existing episode. Legacy manual values remain supported but sit below the new shared editor layer. Pin a rule as an episode override when it must take precedence over shared settings.

## Review effects before reopening voices

Saving a rule changes configuration only. It does not delete voice records, clear production completion markers, regenerate media or change a rendered output. Unsaved form contents cannot be used for an impact review; save or cancel the form first.

**Review impact on existing voices** compares the current resolved spoken form with each scene's recorded `spoken` field, falling back to its recorded `text` when speech was sent as written. The preview distinguishes:

- **Current:** the recording's known spoken form and script still match.
- **Changed:** current rules or narration produce different spoken text.
- **Unknown:** a legacy recording has no known source/spoken text.
- **Missing:** there is no voice record for the scene.

**Apply reviewed voice changes** removes only affected voice records, keeps unchanged scene audio and preserves the previous export reference. It removes the working timeline, clears preview approval and reopens completion markers from voice onward. Script and concept approvals remain. No job or paid call starts. Resuming production later may incur provider costs; shot planning still runs at episode scope.

The preview binds a full episode fingerprint, shared dictionary revision and editor-rule fingerprint. Stale applications are rejected before records are removed. Applying stores a pending rule snapshot identity. If editor rules change before the voice stage starts, production stops before provider generation or the pronunciation agent and requests another review. A running voice stage uses the dictionary snapshot captured at its start; later shared edits are for a subsequent reviewed run.

New voice records retain the shared revision and a fingerprint of the effective terms used at generation time. Cache eligibility compares actual spoken text, so an unrelated dictionary change does not by itself regenerate a matching recording. An explicit voice-stage run can also recognize changed spoken forms even when the written narration is unchanged. Merely saving shared settings does not reopen an already completed voice stage.

The pronunciation agent receives existing resolved terms as known entries. It cannot override editor rules, including case variants. Newly learned terms remain episode-local and cannot modify the shared dictionary. Learning during a partially completed voice stage does not alter the editor-rule fingerprint, so retrying preserves completed voice records rather than blocking on the agent's own additions. Original caption words are restored through the existing `sayPlan` / `restoreWords` path.

## Persistence and concurrency

```text
settings/pronunciations.json
settings/pronunciations/history/<sha256>.json
episodes/<id>/state.json
```

The shared book has version, revision, update time and language-scoped entries. Each mutation requires the loaded revision and commits through storage compare-and-swap against the exact previous bytes. No unconditional fallback exists when CAS is unavailable. A competing writer is rejected and can retry against the new revision; it cannot overwrite another writer's entry.

A content-addressed history snapshot is written before CAS. A rejected race or failed commit may leave an unused history snapshot; readers use only the committed book. History is retained. Shared settings survive individual episode deletion.

Explicit overrides and pending impact metadata live in episode state. Their mutation uses the episode producer lock and optimistic state fingerprint. Global changes and episode state are not a cross-object transaction; a pending revision that becomes old is caught by the voice-stage guard. Removing a shared rule does not rewrite saved audio or its recorded provenance.

`GET /api/episodes/<id>/pronunciations` returns the current language, revision, state fingerprint, effective origins, shared entries, overrides and pending plan. `POST` supports `put`/`remove` with `shared` or `episode` scope, `preview`, and revision-bound `apply`. The server derives the language from the episode. Read and preview responses use `Cache-Control: no-store`.

The [voice stem audit](VOICE_AUDIT.md) describes existing source files and their recorded text. A newly saved dictionary rule does not make those measurements false; the pronunciation impact panel shows the desired new form separately. Applying the impact removes affected records, making the old working voice audit stale. Frozen render evidence stays associated with its previous output.

## Verification fixture

```powershell
pnpm.cmd run pronunciation:preview
```

Choose a new output directory. The fixture uses actual filesystem persistence and CAS, saves shared and episode rules, rejects a stale preview, reopens one scene and preserves another, and checks caption spelling restoration. It invokes no model, voice generator or renderer.

The fixture is explicitly metadata-only: its old recording and export paths are synthetic references, not delivered audio or video. On 11 November 2026 it ran at `.temp_files/pronunciation-workflow-2026-11-11`; `verification.json` records its checks. Unit tests cover a gated shared-writer race, history failures, unsupported CAS, precedence, language isolation, stale state/global revisions and producer exclusion. Pipeline tests use fake agents/providers to verify outgoing TTS text, caption spelling, stale-rule rejection before paid calls and partial-retry reuse. No listening or pronunciation-quality claim follows from these tests.

## Validation on 11 November 2026

- Root and Studio typecheck and optimized Studio production build passed.
- Six focused files passed 117 tests. The full `pnpm.cmd test --maxWorkers=2` run passed 186 files and 1,984 tests; one PostgreSQL/RustFS integration file and its two tests were skipped. Duration: 75.36 seconds. The existing Socket listener warning remained; it was not established as a product leak. Coverage was not measured.
- A production Studio server using the isolated filesystem fixture passed shared and episode rule writes, current impact preview and application. Shared saves preserved the episode state; episode saves preserved voice records until review. Changing the shared revision rejected the old impact with HTTP 400. Applying a fresh preview retained the other scene's voice, written script and old export reference. Invalid input returned 400. Evidence is `http-verification.json` beside the fixture.
- No agent/provider generation, authored media delivery, browser visual inspection or live S3 compatibility check was performed. Runtime integration tests use fake providers and the existing prompt/tool isolation remains intact. The owned fixture server was stopped after verification.
- `git diff --check` passed with Windows CRLF handling. The root project has no standalone formatter/linter script. Existing unrelated working-tree changes were preserved; no commit or push was made.
