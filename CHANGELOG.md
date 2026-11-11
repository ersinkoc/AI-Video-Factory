# Changelog

Releases are cut with `pnpm release`. The Studio shows an update banner when a newer GitHub release exists.

## v0.5.0 (2026-11-11)

- Add a searchable, filtered and paginated character gallery for new vector episodes, with persistent presenter/cast selections.
- Add reusable custom styles, reference measurements, original local style previews, bundled typography and archive-image provenance.
- Share structured shot intent across planning and playback, and freeze benchmark inputs and bounded comparison clips.
- Measure main/Short exports and isolated voices, with quality decisions tied to the exact reviewed export.
- Track narration-anchored claims and editor-provided sources, freeze export credits, and keep script rewriting explicit.
- Preview narration changes, restore saved revisions and manage shared pronunciation rules with episode overrides.
- Reject undo snapshots missing the original scene and expand regression coverage for media failures, stale requests and editorial workflows.

## v0.4.10 (2026-11-08)

- Confetti is thrown once and settles on the floor instead of raining through the whole shot
- Rain and snow no longer fall inside a room
- The magnifier inset keeps off the shot's other props

## v0.4.9 (2026-11-08)

- The magnifier's pointer stops at the edge of a screen instead of running across its text
- The director gives cork boards, notice boards, signs and posters their text, as it does screens
- The frame reviewer treats legs wholly below the frame edge as framing, not cut-off feet or shins

## v0.4.8 (2026-11-08)

- A pointing person walks up to what they point at, and a point at itself aims at the key prop
- A reader or presenter picks up a small prop from the desk instead of losing the gesture

## v0.4.7 (2026-11-08)

- A prop on a desk stays on it whole instead of hanging off the edge
- The frame reviewer does not ask for a name label in every shot: code tags each person where they first appear

## v0.4.6 (2026-11-07)

- The frame reviewer treats medium and close framing that leaves the legs out as film grammar, not a cut-off character
- Screen text shows on a drawing that is itself the panel, and the lint replans a shot whose screen text has no screen to go on

## v0.4.5 (2026-11-07)

- The frame reviewer treats the magnifier inset as intended, and lessons cannot forbid the code's camera devices
- A robot or mascot with legs that the casting marked as an object is cast as a person, so it can act and stays in frame

## v0.4.4 (2026-11-07)

- The final review sends the frames the critic left out once more instead of staying open
- A map fits a focus country's home land, not its overseas parts: the USA map is no longer world-scale
- The info card keeps off the key prop, held props and things on the wall
- No macro insert when someone is in the frame: the holder or the people around the prop stay sharp, the magnifier opens instead

## v0.4.3 (2026-11-07)

- Episode locks are taken by compare-and-swap; an incomplete review stays open, Studio reads lighter and renders use fewer tabs
- Shots can carry procedural Three.js illustrations and PixiJS/CSS effects; the director plans motion in most shots
- Props placed half off the stage are moved back in, with whatever stands on them
- The magnifier inset never opens on furniture, and its pointer keeps off faces and bodies

## v0.4.2 (2026-11-06)

- Three or more people in a row form an arc open to the camera
- Extras look like people: cast proportions, bending arms and fists, faces that shout or smile, varied poses
- A speech bubble's tail stops at the edge of the head, not on a narrow face's eye
- Eyes and mouth stay inside the face, pupils carry the look; nobody stands on a low table

## v0.4.1 (2026-11-06)

- Screen keys get a readable inset of the screen itself; key camera and callout work after fillWide
- The info card keeps off screen and board text; hollow props get a paper base in the macro
- Entrances last under a second; the review frame waits for late texts
- Re-planned scenes get a final check before render; the director sees the draft frames
- Weather seen from a room stays inside its windows
- A giant object is shown whole as if seen from afar, not as a strip of its base

## v0.4.0 (2026-11-05)

- Renders can use a chosen Chrome (YS_BROWSER_EXECUTABLE); a browser that hangs at start says so
- A startled person raises the guarding hand toward the person they look at
- A worried listener wrings their hands, an angry one crosses their arms, a sad one slumps
- Worried, sad and angry faces frown with a coded mouth; brows drawn in one path split
- A startled person recoils with a guarding hand, and reactions open the mouth
- Review frames are taken when a gesture is fully raised, not while it rises or falls
- A still prop is never left as a thin strip at the side of the frame
- Narrated reactions and emotions reach the pose and face; wall props stay in frame
- An unreviewable episode no longer passes as clean; roads run across the stage
- Set pieces never stand with an edge through or beside a head
- The magnifier inset stays put for the whole shot and keeps off people
- Studio jobs survive a Studio restart; a render stuck on a frame retries
- Rooms get period set dressing, watercolour figures a paper base, fog has depth
- People behind a counter rise into view and clear the sign's pole
- Macro inserts are bigger and stand on a strip of their surface
- Characters speak and think in code-drawn bubbles
- Screen text wraps and stays readable in the frame
- Hands turn at the wrist so the thumb stays on top of a sideways arm
- The nose moves with the eyes and the neck sits behind the collar
- The info card keeps clear of faces and name tags; macro blur is measured on screen
- Fast-moving objects get motion blur; callouts and focus wait for their object
- Scene transitions get motion blur while they move fast
- Light falls into each room from its window side
- The camera behaves like a lens: depth of field, breathing, glowing screens
- Episodes can be deleted from the Studio, unfinished or finished
- A close-up aimed at a tiny object becomes a macro insert
- Two people talking stand 1.1 m apart instead of 1.5 m
- Screens and boards show what each shot is about
- Ready-made SVGs without a viewBox are scaled to their box
- A close-up moving in on an object keeps the people the director framed
- Scenes change with a wipe, slide, iris or zoom, and build up piece by piece
- Hands stay in their own space, and the gate rejects broken arms and hands
- Standing people are not cut between ankle and mid-thigh, in close-ups too
- A person does the action the shot's description narrates
- Review frames are taken when the planned gestures are visible
- A real person is named where they first appear in the episode
- The camera moves in on the object a shot is about until it reads
- Frame review judges each episode in its own style; lessons never override a style's palette
- Wide shots move in closer: a tall machine beside the people may lose a little of its base
- Characters turn to the person they are with instead of staring at the camera
- Crowd sounds: extras applaud, cheer, murmur, chant and march in time with the picture
- Writing on a board: the writer stands at its edge and the pen writes inside it
- Extras: crowd scenes get anonymous people drawn by code behind the cast
- Desk work happens at a real desk: workers go behind it, hands reach its real height
- Reverse angle: a busy room gets its opposite side drawn once, consecutive shots cut between the two
- Render cache: only scenes that changed are rendered again, a crashed render resumes
- Close-ups magnify a subject the camera cannot make readable; props in the air get a readable size

## v0.3.2 (2026-11-04)

- Say acronyms that are words as words: COBOL is 'kobol'
- Read abbreviations out in full with the suffix rebuilt
- Read Turkish numbers by rule; write digits in the script
- Approve the preview before the render; no body slivers at the frame edge
- Re-create in bulk from the review's findings
- Historical maps from real borders; re-create scenes from a producer's note
- Quality bench: re-render a fixed shot set and score it with the scene critic

## v0.3.1 (2026-11-03)

- README: sponsor section (WrongStack)

## v0.3.0 (2026-11-03)

- Twelve more style packs: painting and material studies
- Real people get a likeness sheet measured from their photos
- Force minimatch 11 for the DoS fix; patch trigger.dev's removed makeRe import
- Brows carry the emotion: each drawing's brows split and tilt per expression
- No pose goes past human joint limits; 3D limbs turn toward the camera instead of squashing
- Typing hands rest on the keyboard instead of rubbing; writing no longer crosses the arms
- Foreign terms are read the way the narration language says them
- Animation lint: shots are checked before render, fixed in code or replanned; 24 more style packs
- Key props that fail the gate get an iconic retry, then their scenes are replanned

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
