# Rendered-video audit

The audit reads an existing export and writes advisory, time-coded evidence. It makes no model or media-generation calls and does not alter the video, timeline or production-agent isolation. Its implementation belongs to YoutubeStudio; Cinecode served as a reference for useful outcomes, without importing its code, prompts, templates or runtime.

## Run

```powershell
pnpm.cmd exec tsx scripts/audit-render.ts out/episode.mp4
pnpm.cmd exec tsx scripts/audit-render.ts out/episode.mp4 --timeline out/timeline.json --out out/review-01.json
```

An existing report is never overwritten. Exit code `0` means the enabled measurements completed without findings, `1` means advisory findings need review, and `2` means an enabled check failed or input/output was invalid. None of these is an editorial approval. Missing audio and editorial checks are explicitly marked skipped, rather than counted as passes.

## Pipeline and Studio

Every successful main render automatically runs the same analysis against its shot ranges. The report is stored under `episodes/<id>/render-audits/<unique-id>.json`, with the render timestamp and source-file identity. `state.render.audit` contains check statuses, counts and at most twelve findings; full motion arrays and all findings stay in the report artifact, outside Studio polling responses.

New renders also freeze their shot times in `render.auditRanges`. Rerunning an audit uses these times even if the authoring timeline was changed or removed. Older exports can still use the current timeline; the report records `rangeBasis: current_timeline` and Studio warns that those times may have changed. Frozen render times use `rangeBasis: render`.

The Studio overview shows measured, skipped and failed checks separately. Clicking a finding seeks the main player to its start; the full JSON report is downloadable. An export created before this integration can be audited with **Audit video**. **Audit again** reruns only measurements, without rendering or making model/media-generation calls. The same operation is available from the CLI:

```powershell
pnpm.cmd ys episode audit <episode-id>
```

This operation holds the episode lock. Each run creates a new report artifact. A rerender clears its prior audit summary before rendering begins and attaches new evidence only to the new export. Analysis or report-storage failures are persisted as failed/incomplete audits; advisory findings and measurement failures do not discard a successfully rendered video or automatically trigger regeneration. The dedicated audit CLI command reports incomplete measurements as an error. A completed audit with advisory findings is still a completed measurement, not an approval.

New Short exports are automatically audited with their own frozen shot ranges and export identity. Use `pnpm.cmd ys episode audit <episode-id> --short` to rerun only their measurements. Older Shorts without ranges use file-derived windows; main-video timeline times are never reused. The Short measurement card seeks the Short player and downloads its own report. A crashed audit can leave a running marker; Studio presents it as interrupted when no job is active and offers a rerun.

The on-demand [quality issue workflow](QUALITY_WORKFLOW.md) combines full audit findings with reference comparisons and separately labelled preview critiques. Editorial decisions are bound to the exact export and report and do not trigger regeneration or publication approval.

## Measurements

- Black intervals lasting at least 0.25 seconds and near-frozen intervals lasting at least 1.5 seconds, including freezes continuing to EOF. These use FFmpeg's [documented detection filters](https://ffmpeg.org/ffmpeg-filters.html#blackdetect).
- Local motion at two grayscale samples per second. Registration fits an outer ring of the picture to a small translation and scale, then measures change in twelve local tiles. Flat backgrounds cannot establish a camera transform and are marked unreliable. Camera-dominated change and low motion are advisory findings, not proof of missing narrated action.
- Whole-program integrated loudness and true peak measured by FFmpeg. Review targets are -14 ±3 LUFS and at most -1 dBFS true peak; silence is represented explicitly with null measurements and a finding.
- Full-band mixed-audio RMS energy and sample peaks in approximately 100 ms blocks at the source's sample rate and channel count. Shot windows combine these measurements into a 32-bin energy envelope, RMS, quiet share, longest quiet interval, coverage and level differences against the median audible window and previous non-overlapping window. Stereo channels are measured independently before combining their energy; opposite phases do not cancel into a false silence result.

### Audio by shot

The `shot_audio` check reads statistics from FFmpeg's [astats metadata](https://ffmpeg.org/ffmpeg-filters.html#astats), without retaining decoded PCM or reducing the source's frequency range. `aresample` aligns timestamped audio to the video origin; it can represent a delayed audio start as leading quiet time. A final partial block retains its actual sample count. Missing or discontinuous statistics fail the check instead of becoming zero energy. Trailing video without decoded audio is explicitly missing coverage, not measured silence; a gap greater than 100 ms makes the check incomplete while retaining measured windows.

An `audio_gap` suggests reviewing at least 0.8 seconds below -50 dBFS RMS. An `audio_level_change` suggests reviewing a window of at least 0.5 seconds differing by more than 12 dB from the median audible window or previous non-overlapping window. The reference median excludes windows below -50 dBFS and those with less than 98% measured coverage. The previous-window comparison also requires at least 98% coverage. Intentional silence, accents, music changes and dramatic dynamics can trigger these heuristics legitimately. Sample peaks are not true peaks; the existing whole-program loudness check still measures true peak separately.

Studio's **Shot audio energy** disclosure shows up to twelve windows, prioritizing windows with audio findings. Each row seeks the main player and shows RMS, quiet share, reference/previous-window differences and coverage. Its bars are an energy envelope mapped from -60 to 0 dBFS, not a signed waveform. The full JSON keeps every window. These are total-mix measurements: music can hide missing dialogue, and neither speech intelligibility nor vocal harshness is established. No normalization, regeneration or paid calls follow a finding.

The metadata subprocess keeps the existing two-minute timeout and 16 MiB output bound. Preflight budgeting uses 256 bytes per expected 100 ms block; unusually long videos or more than eight channels fail explicitly. Metadata precision makes shot-boundary measurements approximate to a block. Older FFmpeg builds without the required filters report failure, rather than a fabricated pass.

To create an isolated original test-pattern MP4 with normal, quiet and silent windows, persist a genuine pipeline audit, and verify zero generation/model ledger entries:

```powershell
pnpm.cmd run audio:audit:preview
```

Artifacts are written under `out/shot-audio-workflow/`. This is a development verification fixture, not a delivered episode or an editorial approval.

With a timeline, motion pairs stay within each shot and exclude 0.35 seconds at either boundary. Without one, five-second windows are used; cuts inside a window can inflate measured motion. Very short shots cannot establish motion and are not given invented measurements. Each motion entry includes its number of frame pairs and registration reliability share. If no window can be assessed, the check is incomplete.

Each subprocess has a two-minute timeout and a 16 MiB output bound. Motion analysis also has a preflight sample-memory bound. Large or unusually tall videos should use a shorter review export. The report records the absolute input path, byte count and modification timestamp; an input that changes during analysis invalidates the report.

## Evidence limits and next steps

Parallax, lighting changes, fast movement outside the small registration search and compression can distort motion scores. Tiny actions can disappear at review resolution. Inspect flagged intervals against the narration and the intended quiet holds. These measurements cannot judge action semantics, factual accuracy, typography legibility, audio pleasantness or artistic merit.

One-frame flashes, long-range visual repetition and independent editorial review remain future work. [Typography selection](TYPOGRAPHY.md), [archive provenance](ARCHIVE_IMAGES.md) and [reference-palette comparison](REFERENCE_STYLE.md) are separate implemented workstreams.
