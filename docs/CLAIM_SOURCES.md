# Narration claims and source evidence

The episode's **Script → Research** panel records editor-supplied sources, exact narration quotes and editorial decisions. It does not fetch source URLs, perform live web research, establish semantic entailment or certify factual accuracy. Archive image attribution remains a separate workflow in [Archive image inserts](ARCHIVE_IMAGES.md).

## Record and review

1. Add a source title, HTTP(S) URL and relevant excerpt. Publisher, publication date and passage/page locator are optional. URLs containing embedded credentials are rejected.
2. Add a claim against an existing scene and an exact quote from its current narration. Classify it as fact, estimate, quotation, interpretation or reconstruction. Link sources as supporting, contradicting or contextual evidence.
3. Review the claim as supported, disputed or needing a source. Only interpretations and reconstructions can be excluded from factual review. A supported decision requires a nonempty supporting excerpt and no linked contradiction. This checks the record's structure; the editor must assess whether the excerpt actually supports the claim.

The panel shows dependent shot IDs. Unreviewed, disputed, source-needed and stale claims also appear in the quality issue board as authoring evidence. They do not approve a render, block production or trigger regeneration.

A review is bound to the claim and its linked source records. Editing a linked source or claim makes an old decision stale. Any change to the scene's full narration also makes its anchor stale, even if the quoted substring remains. Rebind the claim to the current narration, then review it again. Unlinked source edits do not invalidate a claim's decision.

Writes acquire the episode producer lock and require the revision loaded by the editor. A stale form is rejected instead of overwriting a newer edit. Each successful save writes content-addressed history before replacing the current book:

```text
episodes/<id>/research/book.json
episodes/<id>/research/history/<sha256>.json
```

The current bounds are 80 sources, 300 claims and 12 source links per claim. History is retained. Older episodes need no migration; absent books behave as empty registers.

## Ground the next script explicitly

Story, screenwriter and script-doctor agents receive a compact JSON context when source excerpts exist. It contains at most 12 sources, 1,200 characters per excerpt and 30 claim records, with omission counts. Claim links retain references to omitted sources so a known contradiction is not silently removed. Excerpts are untrusted data, not instructions or verified facts. Runtime agents remain tool-free and cannot browse, load coding skills or verify these URLs.

The final script can supply candidate claim quotes with known source IDs. Only exact quotes present in the final narration become register entries. Unknown source IDs cannot create new sources, and writer candidates receive no editorial approval. This is not an exhaustive detector of every factual statement.

Saving research does not rewrite the script. **Rewrite script with sources** is a separate action that incurs configured Claude usage. It requires an existing story, clears production approvals and dependent stage completion markers, and reruns only the script stage. Existing artifacts remain available until their stages run again. It stops before voice, images, motion and rendering. CLI equivalent:

```powershell
pnpm.cmd ys episode rewrite-script EPISODE_ID
```

The rewrite path was verified with mocked agents; it was not invoked against a paid agent during implementation.

## Freeze evidence for the main export

A successful main render with a nonempty register saves its current derived claim statuses and sources into a separate report, bound to the episode, render time and export ID. State stores a summary and fingerprint; reading the report verifies its content hash and identity.

```text
episodes/<id>/research/exports/<uuid>.json
<episode work directory>/<id>.research.json
```

The overview downloads the frozen report through `GET /api/episodes/<id>/research?render`. Current research is read and edited through the same endpoint without `?render`. Working edits never update the previous export's report. The fingerprint detects inconsistent content; it is not a signature or an independent authenticity guarantee.

Publication packaging appends narration source credits from supported claims in the frozen main-render report. It does not use later working edits or unreviewed claims. These credits are separate from archive asset credits. This implementation does not create a separate research sidecar for a Short.

## Reproduce the isolated verification

```powershell
pnpm.cmd run research:preview
```

The fixture creates a real four-second, 640×360, 12 fps main MP4 and frozen JSON report under `out/research-workflow`. It then changes the working source and narration and asserts that the current claim becomes stale while the original report and credits remain intact. All source content is synthetic; its example URL is never fetched. No model or media-provider call is made.

On 11 November 2026 this fixture ran at `.temp_files/research-workflow-2026-11-11`, with zero ledger entries. Its `verification.json` records the render and frozen-evidence checks. A production Studio server pointed at that isolated store also passed HTTP reads, a source write, stale-revision rejection, stale-anchor review rejection and unchanged frozen download checks; evidence is in `http-verification.json` beside it.

Component tests cover on-demand loading, editing, errors, revision retention and explicit rewrite controls. Browser visual inspection was unavailable in this session, so these tests do not establish layout quality. Live web research, cloud integrations and paid script output were not exercised.

The final `pnpm.cmd test --maxWorkers=2` run passed 176 files and 1,921 tests, with the PostgreSQL/RustFS integration file and its two tests skipped. Root and Studio typecheck and the optimized Studio production build passed. The default four-worker run had timed out in the existing real-video audit fixture's ten-second setup hook; no assertion or timeout was relaxed. The two-worker run included all seven encoded-video audit tests. A Socket `MaxListenersExceededWarning` remained; this run does not identify its cause. Coverage thresholds were not measured.
