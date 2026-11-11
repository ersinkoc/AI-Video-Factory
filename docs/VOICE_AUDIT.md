# Voice stem and alignment evidence

**Script → Voice audio and alignment** audits the current scene voice files independently of music and effects. The mixed-audio audit remains useful for the final program, but audible music cannot establish that a separate narration stem contains expected activity. These are complementary evidence sources.

This audit does not recognize speech, verify pronunciation, establish intelligibility, detect masking in the final mix or approve an export. Its energy measurements are advisory. A tone, noise or an incorrect spoken sentence can still contain energy; correct words require listening or a separately validated recognition/alignment method.

## Run and inspect

Open the panel on demand, then select **Audit existing voice files for free**. The job holds the episode producer lock and reads existing source bytes; it does not run production stages, regenerate audio, invoke an agent or consume a provider API. CLI equivalent:

```powershell
pnpm.cmd ys episode audit-voice EPISODE_ID
```

Missing records can be audited as findings. An absent script produces a failed audit. The command exits nonzero for failed or incomplete measurement, while a complete audit can still contain advisory findings and skipped checks. The panel exposes every scene's checks and supports 20 scenes per page, a source audio player and a JSON download.

The script tab compares four forms without rewriting any of them:

| Form | Evidence |
| --- | --- |
| Current script | Current scene narration |
| Script bound to recording | `SceneVoice.text`; absent in some legacy records |
| Spoken form sent to TTS | `SceneVoice.spoken`, falling back to its recorded text |
| Caption text from word timings | Joined original `WordTiming.text` values |

Text comparisons normalize Unicode compatibility forms and whitespace. The pronunciation pipeline keeps original spellings in caption words and stores alternate spoken forms separately. Tests cover multiword names and numbers, and the real-media fixture uses `C++ 2026.` with a different Turkish spoken form. This verifies metadata spelling preservation, not that an audio file actually speaks those words. Shared editor rules and explicit episode overrides are managed through [Pronunciation dictionaries](PRONUNCIATIONS.md); desired new forms are reviewed separately from existing recorded-source evidence.

## Measurements and findings

Each file is decoded at its original sample rate and channel count into 100 ms full-band RMS blocks. Sampled levels below −50 dBFS, including digital silence, are treated as quiet for this advisory policy. Thresholds are retained in the full report.

- A missing scene record or source file is visible as missing voice evidence.
- A decoded file that is at least 98% quiet despite expected lexical narration produces a near-silent-voice finding.
- With valid supplied word timings, a contiguous quiet intersection of at least 400 ms inside expected word windows produces a word-gap finding. Overlapping windows are merged; gaps between words are excluded. A long intentional pause between words is therefore not treated as missing speech. A valid dramatic pause inside a single long word/group window may still need editorial review.
- Estimated word timings explicitly skip the word-activity check. Whole-file silence is still measured. A mathematically valid timing bound is not proof of independently verified alignment.
- Missing, non-finite, unordered, excessive or out-of-range word timings are disclosed as invalid. Up to 8,000 timing records per scene are supported.
- Recorded script and caption-text mismatches remain separate findings from energy measurements.
- Source duration differences larger than 250 ms or 1% are flagged. Missing decoded coverage or word windows outside the decoded range produce coverage findings rather than fabricated silence. The endpoint tolerance is 100 ms.
- Decoder, format, filter and source failures are failed checks. They cannot become a clean pass. Semantic speech quality is always explicitly skipped.

Scenes with no lexical narration, such as a punctuation-only pause, skip voice measurement. The audit does not inspect scene-gap padding, music-only timeline sections or the encoded final mix as if those were voice stems.

The current bounds are 300 script scenes, 64 MiB per source, 1,200 seconds per source, a 120-second timeout per media-tool invocation and 16 MiB of returned tool metadata. Files are analyzed sequentially. Tool calls use the existing FFmpeg/ffprobe wrapper and its fallback behavior. Temporary decoder inputs are removed on success and failure.

## Evidence identity and production boundary

The full report is stored at `episodes/<id>/voice-audits/<uuid>.json`. Episode state contains a summary with at most twelve findings, the report hash and an input fingerprint. Full scene forms, checks and measurements are loaded only on demand. Existing episode deletion already covers the report prefix.

The report binds the ordered scene narration and voice metadata, as well as each measured source's SHA-256. On-demand reads verify the report identity/hash and compare the working inputs and source bytes. A changed script, word timing, source key or source content makes the previous report stale. Filling a previously missing file also makes its missing-source evidence stale. Source bytes are re-read for this check; it is not performed in the regular polling response.

Current findings appear in the quality board as **Voice stem audit → Authoring plan**, with no export decision control. Stale findings are withheld from current issues while their historical report and staleness disclosure remain available. Corrupt evidence becomes a failed notice without suppressing unrelated quality findings.

This job leaves production completion markers, voice records, costs and existing render evidence intact. Its report describes current working voice files. It is not frozen into a main render or Short and cannot certify the voice track used by an old encoded export. Run the mixed-export audit separately for that output. It runs only when explicitly requested; no automatic post-generation audit was added in this phase.

`GET /api/episodes/<id>/voice-audit` returns the summary and current/stale full evidence. Add `?download` to download the same evidence with its freshness disclosure. The Studio action `audit-voice` starts the dedicated CLI job. Responses use `Cache-Control: no-store`; cross-episode report pointers and content-hash mismatches are rejected.

The lightweight report module receives its decoder as an explicit dependency. The heavy CLI pipeline supplies the FFmpeg adapter. Studio report reads do not import Remotion or native platform packages; this separation is also checked by the production build.

## Reproduce the real-media boundary

```powershell
pnpm.cmd run voice:audit:preview
```

Use a new fixture directory; existing output is protected. The fixture makes actual WAV stems and a four-second 320×180 MP4 containing an audible synthetic music tone over a silent expected voice track. It also creates correctly timed tone bursts separated by an intentional pause, a missing word interval and an estimated-timing case. No real speech, model or provider is used. This is technical test media, not an authored episode delivery.

On 11 November 2026, the final fixture ran under `.temp_files/voice-audit-workflow-final-2026-11-11`. Its mixed track measured about −21.05 dBFS RMS and had no mixed-audio gap, while the voice-only audit flagged the silent voice. It accepted the intentional pause, detected the missing word interval, preserved caption spelling, disclosed the estimated check and rejected changed source bytes as current evidence. `verification.json` records these checks and zero ledger entries; `mix-audit.json` retains the full mixed-video measurements.

The normal test suite uses fake media tools for new decoder tests; actual FFmpeg verification lives in the standalone fixture. Component tests establish behavior, not a browser layout or listening review. Live cloud storage, automatic speech recognition, paid narration and measured intelligibility were not tested.

## Validation on 11 November 2026

- Root and Studio typecheck passed. The optimized Studio build passed after separating the media adapter from the lightweight report module; the initial build correctly exposed an unwanted Remotion import through the report collector.
- `pnpm.cmd test --maxWorkers=2`: 182 files and 1,958 tests passed; one PostgreSQL/RustFS integration file and its two tests skipped. The final run took 129.88 seconds. The existing Socket `MaxListenersExceededWarning` remained; its cause was not established. Coverage was not measured.
- Nine focused files passed 124 tests before the import-boundary adjustment; the six affected files passed 94 tests after it, followed by the complete passing run above. New decoder tests mock media-tool invocations.
- The real CLI ran against the isolated fixture and returned `complete, 2 findings`, with zero agent cost and no generation ledger entries. Its output is `cli-verification.txt` beside the fixture evidence.
- A production Studio server served the full report and JSON download through HTTP, exposed exactly two working-plan findings and rejected an invalid episode ID. Changing source bytes marked the report stale and removed both findings from current quality issues; restoring the source made the report current again. Evidence: `http-verification.json` beside the fixture. The owned server process was stopped after verification.
- `git diff --check` passed with Windows CRLF handling. Unrelated dirty-path status matched the starting snapshot. No standalone lint/format script is configured; no commit or push was made.
