# Quality evidence and fixed benchmarks

## Review an episode

Open **Quality issues** in the episode overview. The panel loads evidence on demand and offers source, output and decision filters, with 50 results per page. Full video-audit findings are read from their report artifact; the twelve-item polling summary is not treated as a complete list.

Sources remain distinct:

- Video measurements and reference-palette comparisons describe an actual export.
- Plan lint, draft critiques and final frame critiques describe authoring previews. They remain visible as preview evidence, without an export approval control. A still does not establish motion quality or certify the encoded MP4.
- [Structured narrative intent checks](SHOT_INTENT.md) describe subject/action and timing contradictions in the current plan. They never approve an encoded export or initiate regeneration.
- [Narration claim reviews](CLAIM_SOURCES.md) expose unresolved or stale source decisions in the working script. They are editorial metadata, not automatic factual verification or export approval.
- [Voice stem audits](VOICE_AUDIT.md) describe current working voice files independently of music. Only current findings enter the issue board; they have no export approval control and do not certify an encoded output's dialogue.
- Failed, skipped and absent measurements remain visible in the measurement disclosure. An empty findings list is not proof that every check ran.

For current measured exports, decisions are **Open**, **Reviewed**, **Accepted** and **Needs a fix**. A decision changes only metadata. It does not approve publishing, change production gates, regenerate media or invoke a model.

Decisions are bound to the export identity, report artifact and finding content. They are stored separately at `episodes/<id>/quality-decisions.json`, under the episode producer lock. New exports get a new identity. Legacy exports use path/time identity until rerendered. A decision request from a stale page is rejected. The measured file's size/time identity must still match; changed or missing files cannot retain an accepted measurement decision. These checks are provenance guards, not a cryptographic guarantee of byte identity.

The panel reports how many decisions belong to previous exports. They remain in history and do not apply to the current output. A new audit report resets decisions for that report's findings. The current storage bound is 5,000 decisions per episode; reaching it rejects new entries rather than deleting history.

## Main video and Short audits

Both new main renders and new Shorts automatically run technical video/audio measurements. Each keeps its own export identity, frozen shot ranges, status and report. Audit failure preserves a successfully rendered video.

```powershell
pnpm.cmd ys episode audit EPISODE_ID
pnpm.cmd ys episode audit EPISODE_ID --short
```

The Short card seeks the Short player, uses Short-relative times and downloads the Short report. A legacy Short without frozen ranges uses file-derived windows; it never borrows times from the main authoring timeline. No new media or paid calls are involved in an audit rerun.

## Freeze a benchmark

The existing benchmark now requires a frozen fixture before new runs:

```powershell
pnpm.cmd bench pick 30
pnpm.cmd bench freeze
pnpm.cmd bench run baseline --free --clips=6
pnpm.cmd bench run candidate --free --clips=6
```

`pick` preserves an existing set. `freeze` copies the selected episodes' planning inputs and referenced local media into `.data/bench/fixture-v1`, hashes their bytes and atomically publishes a manifest. It refuses to replace a published fixture. Missing media and remote URLs fail freezing; stage remote media locally first. Later edits to the original episodes do not change the fixture. Failed freezes can leave an unpublished `.pending-*` directory for diagnosis; it is never used as a valid corpus.

Runs verify the manifest and media hashes before and after execution. Source fingerprints cover dirty source content, prompts and pinned dependency files; each run also records runtime/render settings and reviewer configuration identity. A code change during execution invalidates the run. Package script entry points now participate in the root TypeScript check.

Stills use the production review-moment selector. Up to six clips are selected deterministically, taking category representatives first. Each clip covers at most six seconds, including context around the selected shot's ending cut where available. Clips render a frame range of the original composition, preserving its absolute clock rather than shortening its animation recipe. Their source frames and technical audits are saved beside the run. No clips are produced with `--clips=0`; at most 30 can be requested.

`--free` renders and measures without a critic/model call. It saves a result with `reviewStatus: skipped`; it does not produce an editorial score or measure reviewer noise. To score the same corpus explicitly:

```powershell
pnpm.cmd bench run scored-baseline --clips=6
pnpm.cmd bench run scored-repeat --clips=6
pnpm.cmd bench diff scored-baseline scored-repeat
```

Scored runs invoke the configured scene critic and incur agent usage. The reviewer receives each frozen episode's style and caption context; batches remain contiguous and separate different styles/caption settings. Only complete reviews with the same fixture and reviewer configuration can produce a score comparison. Older runs without provenance, incomplete reviews and free runs are not comparable as quality gains. Compare repeats with identical source fingerprints to estimate reviewer variability before evaluating a candidate. Clip audits remain technical/advisory; no automated semantic clip critic has been added.

Missing stills, failed/incomplete clip audits or incomplete scored reviews produce a nonzero exit with the partial result retained. Individual clip errors are recorded rather than counted as successful samples. Historical benchmark files are preserved.

## Isolated workflow verification

```powershell
pnpm.cmd run quality:preview
```

This writes synthetic main/portrait MP4s and isolated episode state under `out/quality-workflow`. It runs real audits, persists an accepted finding, verifies that it does not apply to another export identity, and asserts zero generation/model ledger entries. The JSON evidence is `out/quality-workflow/verification.json`. It is a development fixture, not an authored episode delivery.

Related contracts: [rendered-video audit](RENDER_AUDIT.md), [reference comparison](REFERENCE_STYLE.md), [episode locking](LOCKING.md), [scene motion](SCENE_MOTION.md).

The default test suite uses four concurrent workers so real media fixture setup does not compete with an unbounded number of test processes. Assertions, coverage thresholds and media-tool timeouts remain unchanged.

## Verification on 11 November 2026

- Normal `pnpm.cmd test`: 169 files passed, one integration file skipped; 1,873 tests passed and two PostgreSQL/RustFS tests skipped.
- Root/Studio typecheck and optimized Studio production build passed.
- The isolated real-media fixture completed both main and Short audits, persisted a decision and verified isolation from a newer export. A running production server also served the paginated issues and Short download and persisted/filtered a Short decision through HTTP.
- `pnpm.cmd bench run quality-baseline-20261111 --free --clips=6` rendered all 30 selected stills and six actual MP4 clips. All six technical audits completed without failed checks, with five advisory findings in total. The run recorded zero critic cost and explicitly skipped editorial scoring.
- Benchmark artifacts: `.data/bench/runs/20261111114126411-quality-baseline-20261111/result.json`; fixture identity `7bba36dc2cbd663468526477d8b0b02a289023ae422a6f6cb7c2376cf9c49af3`.
- Browser interaction/visual inspection was unavailable because the browser access host could not be reached. Component tests cover filtering, seeking, decisions, pagination and errors; these do not establish a visual layout review. Live cloud integrations and paid critic comparisons were not run.
