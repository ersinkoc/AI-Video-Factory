# Changelog

Releases are cut with `pnpm release`. The Studio shows an update banner when a newer GitHub release exists.

## v0.2.1 (2026-11-03)

- Pointing at something within reach stops at its edge
- Talking distance: standing people in a wide shot come within 1.5 m
- Thinking poses: chin on hand, head scratch or arms crossed, picked per shot
- Thinking pose: chin rests on the hand in front of the face
- Standing poses: weight on one leg, listener rest poses, give, nod and head shake

## v0.2.0 (2026-11-03)

- Word timings aligned to the pauses in the recorded voice
- Speech beats: head, brows and hands move with the stressed words
- Lip sync: talking mouths take the shape of each sound
- Arm IK and measured faces: the thinking hand reaches each drawing's own jaw
- Devices cast as people are drawn as props
- Render: retry with half the tabs when Chrome cannot take a screenshot
- Room shells: a calm stage band instead of a bare wall
- Auto callout also for tiny props resting on furniture
- Ready-made SVGs: skip text-only drawings and year-only title matches
- Walking-steps test samples every third frame
- Think gesture becomes the thinker pose
- Text animations play at a readable pace, then hold
- Surprise reads as a startle instead of joy
- Person close-ups framed from the waist up; shot sizes vary across cuts
- Render watchdog: cancel and retry a render that stops making progress
- Framing: never cut a standing person at the ankles, shins or knees
- Action gestures: typing, writing, reading, show, clap, hands on hips, arms crossed
- Readable scenes: magnified inset for small key props, cleaner text and people layout
- 3D figure previews in the concept step, character bank and style gallery
- 3D packs use 3D figures: figure-designer agent, walking turn, low-poly finish
- 3D figures: code-built three.js characters on the puppet rig; GPU render backend
- Four 3D-look style packs: soft 3D, claymation, vinyl toy, low-poly
- Style packs get a code-drawn texture over vector scenes
- Short render logs its progress
- Style gallery with sample drawings in the new-episode form
- Vertical Short from every horizontal episode
- CLAUDE.md in English
- Background music synthesized from scene moods, ducked under narration
- Publishing package: YouTube title, description with chapters, tags and thumbnail
- Thumbnail keeps the title's casing and avoids covering faces
- Episodes get a YouTube thumbnail rendered locally
- Studio toggle for sound effects
- Vertical videos keep captions and labels clear of the platform UI
- Fix director schema rejected by the API (Manim graph points)
- Desk scenes frame the person at the desk
- Frame-locked sound effects synthesized from the animations
- Videos open on a filled first frame instead of black
- Wide shots recentre content piled to one side
- Manim work folder is named by hash, not by shot id
- Formula and data graph boards rendered locally with Manim
- Key text can land with GSAP kinetic typography
- Objects can be sketched onto the screen stroke by stroke
- Planet-scale maps render as a three.js 3D globe
- Particle atmospheres render with PixiJS (WebGL)
- Close-ups of a held object keep the holder's face in frame
- Quality gate catches plans that change what an asset is
- Wrist joint for newly drawn characters
- Talking characters move their lips with the narration
- Characters move their whole upper body, not just their arms
- Empty wide shots move in to a medium shot
- Close-ups frame the object in a hand or on a desk
- Close-ups keep the narrated props in frame

## v0.1.2 (2026-11-01)

- Shot previews appear while props are still being drawn
- Voice-over no longer needs ffprobe on PATH
- Episode jobs survive the Studio going away
- Wide shots keep everyone in frame
- Hide name tags whose face is out of frame
- Close-ups zoom on the things on a table, not the table
- Hidden name tags no longer use up an on-screen text slot
- Side-by-side name tags stay above their own heads
- Name tags follow their person through camera moves and walks
- Director frames narrated small objects as close-ups
- Characters hold objects up at chest height instead of letting them hang at the hip
- Director stages each moment in its own place instead of reusing unrelated rooms
- Review frames match the video when subtitles are off

## v0.1.1 (2026-10-31)

- Rename the product to AI Video Factory and refresh the READMEs

## v0.1.0 (2026-10-31)

First public release.

### Pipeline
- Topic to finished video: style → story → script → approval → cast → concept → approval → voice → shots → keyframes → clips → timeline → render → review. Every stage is idempotent and resumes where it stopped; a per-episode run lock prevents two runs at once.
- Four motion modes: `vector` (Claude-drawn SVG on a puppet rig, animated in code), `still`, `mixed` and `animated`.
- Quality gate for every SVG: a drawing plan from reference images, a blind recognition test and a gate score. Rejected drawings are not redrawn automatically; a human decides in the Studio.
- Real subjects are drawn from Wikipedia and Wikimedia Commons references. When the planner says the references miss the subject, the search runs again with its suggested query. Maps and flags come from real data.
- 24 style packs, series, a character library and a character bank (on-screen presenters, cast picks and series mascots).
- Learning loop: frames are reviewed after each render and lessons are kept for later episodes.

### Vector animation
- Motion obeys physics: grounded things do not float, walk steps follow the distance travelled, held objects stay in the hand, characters are never held or seated on another character.
- Gestures with anticipation, overshoot and overlapping action; pointing aims at its target, eyes follow the listener, explaining uses one dominant hand, thinking uses the free hand when holding something.
- Optional side views for walking characters.
- A character appears at most once per shot.
- Close-ups reframe when the subject would stay tiny.
- On-screen text follows one layout: an info card at the top-left for place, date and event, name tags next to their person.

### Media and cost
- One gateway for all paid calls with a cost/quality router, content-hash cache, budget cap and fallback.
- Providers: fal (FLUX, Kontext, Seedream 4.5, Kling 3 / 2.6, MiniMax H3 Max Turbo, PixVerse V6, Vidu Q3 Turbo, Seedance 2), Gemini (Nano Banana, TTS, optional Omni Flash video), ElevenLabs (voice, SFX, music) and local ComfyUI.
- Shut-down Veo preview models are skipped instead of failing at render.
- Estimates before any money is spent; Claude agent costs are shown separately.

### Studio
- Bilingual (Turkish and English) web Studio with live pipeline status, activity log, quality-gate decisions, per-agent model choice and cost pages.
- New episode page with motion-mode cards that show each mode's estimated cost.
- Subtitles are always written as an `.srt`; burning them into the video is a per-episode switch.
- Update banner when a newer GitHub release exists.

### Engineering
- TypeScript monorepo, 100% test coverage enforced, CLI (`pnpm ys`) next to the Studio.
- MIT license.
