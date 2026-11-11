# Structured shot intent

New director instructions request an `intent` for each shot. The shared contract identifies the subject, one narrated action, an optional interaction target, the intended visible result, the relevant narration words, the reveal fraction and a readable hold. It travels from both director schemas through saved shot plans, resolved timings and timeline visuals.

```json
{
  "subject": "c-student-2",
  "action": "typing",
  "target": "p-computer",
  "payoff": "The program listing appears on the student's screen",
  "narration": { "startWord": 5, "endWord": 12 },
  "reveal": 0.55,
  "holdSec": 1.5
}
```

Word indices are zero-based, scene-relative and inclusive. They refer to the indexed script supplied to the director, not an index within the shot or a translated text. `reveal` is a fraction of the shot; `holdSec` is seconds after that declared reveal. Neither field changes narration duration or creates a visual effect.

In vector mode, the subject uses an exact visible asset ID, `background`, `text:N` or `three:N`, with zero-based local indices for text/illustrations. Interaction targets use exact layer asset IDs. A point targets the indicated layer; a give targets the receiver. Media shots use a concise visible-subject description. A payoff is direction for what should be understood, not an assertion that the result was rendered or factually verified.

## Runtime behavior

An explicit character action selects its actor by asset ID. It takes precedence over English description parsing, including when names are shared or a description mentions another person. The existing conservative repair can replace a generic explanation gesture or add a supported gesture when safe. Explicit point/give targets bind to the named layer rather than a nearest-neighbor guess.

Geometry validation still compares the before/after plan. A correction that introduces a new staging defect is discarded. Existing deliberate arm gestures and walking remain protected by that repair policy. Missing subjects/targets are reported rather than guessed. Walk and move require their own planned destination; intent metadata does not invent one.

`hold` is an intentional quiet beat and suppresses automatic gesture inference from the description. It does not freeze the renderer or remove explicitly authored animation. Reveal/compare also remain creative labels for existing composition primitives. They do not install new effects, shaders or animation engines.

The scene critic and fixed benchmark receive structured intent as planned context, with instructions not to repeat the payoff as observed success or claim timing was proven by a still. Runtime agents retain empty tool/skill configuration. The compact project motion policies use the installed HyperFrames motion/explainer guidance; no external engine execution by a runtime agent is implied.

## Plan checks and Studio

The on-demand quality issue list includes a **Narrative intent check** source. It recomputes checks from current authoring state, outside normal polling, and labels results as plan evidence:

- Invalid fields, missing vector subjects/targets and missing/misdirected planned gestures.
- A declared hold longer than the time remaining after the reveal.
- Narration word ranges absent from saved alignment or extending outside the shot.
- Independent action promised by still media, which can depict an action but cannot perform it over time.
- Text holds below the reading guideline, or text entrance/exit timing leaving less time than the declared hold. Typewriter, kinetic and counter timings use the renderer's existing `revealWindow` calculation.

These checks are advisory. They do not establish pixel legibility, performance of the narrated action in an encoded video, factual accuracy or real audio alignment. A real archive override is an intentional documentary choice; old vector-layer/action expectations are not applied to its photograph. No check initiates paid regeneration, changes approvals or turns a preview critique into an export decision.

The Shots detail view displays the direction with TR/EN labels, readable cast/prop names when available, and the selected narration phrase. Saved IDs remain canonical. Text/illustration indices refer to the current plan and must be updated when those arrays are edited.

## Compatibility

The outer `intent` field is optional in saved plans and timelines. Existing episodes remain readable and retain description-based action inference. Missing legacy intent is not counted as a defect and is not backfilled. New director prompts request it, but optional-schema compatibility does not guarantee a model will supply it; the application does not claim every historical/new shot has been migrated.

The existing media gateway, approval gates, budgets and Remotion pipeline remain in place. No HyperFrames block name was added to an effect enum. The HyperFrames CLI was unavailable locally during this change, so no HyperFrames check/render is claimed.

## Offline verification

```powershell
pnpm.cmd run intent:preview
```

This writes an editable native Remotion timeline, original SVG assets embedded in the timeline, snapshots, a silent MP4 and `verification.json` under `out/shot-intent`. A parcel moves into place and a following shot holds it. The fixture asserts intent preservation, detection of an impossible hold, and byte-identical JPEG output when a held frame is sought again. Its saved word timings are synthetic test inputs; no narration or external media is generated.

This is a development fixture, not a delivered episode or an automatic semantic video review. Relevant tests cover schema compatibility, stable actor selection, old-plan fallback, explicit targets, geometry-repair rejection, timing propagation, quality evidence and localized Studio details.

Related: [scene motion](SCENE_MOTION.md), [quality workflow](QUALITY_WORKFLOW.md).

## Verification on 11 November 2026

- Full `pnpm.cmd test`: 172 files passed and one integration file skipped; 1,895 tests passed, two PostgreSQL/RustFS tests skipped.
- Root/Studio typecheck and optimized Studio build passed. Prompt-wiring tests cover both directors, reviewer evidence limits and empty tool configuration.
- The native fixture produced a 1920×1080 MP4 with 211 video frames at 24 fps (about 8.79 seconds). Opening, landed and quiet snapshots were inspected. Repeated seeking to the held frame produced byte-identical JPEGs. Word timings are synthetic; the fixture is silent and makes no real speech-alignment claim.
- No paid model/provider calls, cloud integrations, HyperFrames render or full coverage measurement were run. Browser layout inspection remained unavailable; localized details and malformed saved metadata are covered by component tests.
