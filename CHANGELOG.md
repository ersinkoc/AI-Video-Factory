# Changelog

Releases are cut with `pnpm release`. The Studio shows an update banner when a newer GitHub release exists.

## v0.6.21 (2026-11-28)

- Things put on a desk, table, counter or lectern stand on its top, and typing hands go there: many furniture drawings had their top height recorded from the wrong end, so a laptop, a map or a terminal stood in front of the drawers. The top is now measured from the drawing when the recorded height points into the body; chairs and sofas someone sits on keep their seat height.
- A floor-standing machine the plan put on a desk (a pedestal teletype, an analog computer) stands beside the desk on its own feet instead of towering on top of it and hiding the person at the desk.
- The designer and the physics agent are told that a surface height is measured from the bottom.

## v0.6.20 (2026-11-27)

- 3D illustrations no longer sit on faces, bodies or props, or get cut at the frame edge: a bad spot moves to the nearest clear one, also in the vertical Short. Their colour is darkened or lightened when it would vanish into the room behind them.
- Sparks, energy rings, speed lines and other screen effects start at the shot's subject and stop short of faces instead of bursting from the frame centre over people.
- A pointing person walks close enough for the arm to reach the target, close-ups included, and the fingertip stops at the target's edge, including a laptop on a desk below the shoulder; the hand no longer ends in mid-air short of what is named.
- The frame check no longer fails a shot because an on-screen title shortens the narration, or because a still frame cannot show a nod, a head shake or a walk.
- Studio → Developer tools (and `pnpm ys skills`) installs a chosen set of three.js skills and the three.js devtools MCP for coding sessions; it does not affect video production.

## v0.6.19 (2026-11-25)

- Motion-graphics films: a highlight box no longer runs into the line below it; with a tight two-line title the box could cover the tall letters of the next line and, on an accent background, blend with them.

## v0.6.18 (2026-11-24)

- Motion-graphics films: in vertical films a number stays on the same line as its magnitude ("1,2 milyon", "3 million") and, inside a highlight, as the word after it; a highlighted "1,2 milyon" could split over two lines into a lopsided box.

## v0.6.17 (2026-11-24)

- Motion-graphics films: a line chart's note now sits above the highlighted point; at the top of the chart it could cover the point.
- Figures written out in words in the brief ("one day", "iki yıl") count as given, so a card showing them no longer gets the "illustrative data" badge.
- A montage's last card stays on screen long enough to read; a one-card montage could be cut after a second.

## v0.6.16 (2026-11-24)

- Motion-graphics films: a highlighted word with a dotted or accented capital (İ, Ö, Ü, Ğ, Â) now sits fully inside its highlight box; the dot of "İ" could stick out of the top and blend into the background.

## v0.6.15 (2026-11-24)

- Motion-graphics films: a counter with a note now keeps the note in its own space below the number; in 16:9 the note could cover the digits.
- A diagram's connector labels keep clear of the boxes; between close boxes they could disappear behind them.
- When a film's revision fixes the frames but loses rhythm, the log now says so and names what got worse.

## v0.6.14 (2026-11-23)

- Motion-graphics films: a counter in a short scene now finishes counting and stays on its final value long enough to read; it could be cut mid-count and show the wrong number.
- A counter or a montage figure uses the accent colour only when it reads on that background; otherwise it takes the text colour.
- A highlight box in the middle of a line no longer runs into the word next to it.
- A diagram node's label keeps clear of the node's border and wraps onto two lines when it does not fit.

## v0.6.13 (2026-11-23)

- Motion-graphics films: the caption of a logo or particle scene without a title is now drawn at a readable size (it was about 30 px tall in vertical films and 23 px in landscape), and a caption such as "Name · tagline" breaks onto two lines at the dot.
- A caption under a title is at least 32 px.

## v0.6.12 (2026-11-23)

- Motion-graphics films: the highlight box now covers the right words when a capital "İ" (Turkish) comes before them in the line; it slipped one letter to the right.
- A card's figure stays on one line ("31-60 sn" was split in two), and card titles wrap at most once.
- A figure on a grid card uses the accent colour only when it reads on that card; otherwise it takes the card's text colour.
- A diagram node labelled "name · detail" shows the name over a smaller second line instead of leaving the dot at the end of a line.

## v0.6.11 (2026-11-23)

- Vertical motion-graphics films: a diagram whose nodes run step by step is drawn as one column, so its nodes and labels are about twice as large.
- A chart's callout over a short highlighted bar no longer runs into the tall bar beside it.
- Wrapped headlines (rise, slam and chapter lines) and chart and diagram titles no longer end on a single word.
- Charts and diagrams leave room for a title that wraps onto two lines.

## v0.6.10 (2026-11-23)

- Motion-graphics films: a montage now shows its title as a small label at the top while the cards cut underneath; before, the title was never drawn.
- A highlighted word in a word-by-word line no longer touches the word before it.
- Long grid and montage titles shrink to fit one line instead of running into the cards.
- The frame check knows that montage cards alternate the ground and ink colours.

## v0.6.9 (2026-11-23)

- Security: the Prisma config in the trigger.dev worker chain pinned `effect` 3.21.0, which has a ReDoS in `Schema.TemplateLiteral` (GHSA-7589-6fvf-x4pw); it now uses 3.22.4, the copy the same chain already had. Development tooling only; the trigger.dev CLI and the Prisma config load were checked.

## v0.6.8 (2026-11-23)

- Motion-graphics films get a frame check before the render: a film critic looks at every scene after its last element has settled and checks that the listed elements are there and that no text is cut, overlapping or unreadable. A scene passes at 8 out of 10, like the draft review. Without narration, scenes below the bar go back to the director once and the revision is kept only if it checks better; the render waits for your approval while a scene is below the bar.
- The frame check found and these fixes removed: a highlight cut off at the text edge in rising lines, descenders (y, g, Ç) hanging below a large highlight, and a diagonal arrow's label sitting on its line.
- Models page: the film critic can be set to its own model.

## v0.6.7 (2026-11-22)

- Motion-graphics films show a preview still for every scene in the Shots tab before the render, so the preview gate can be judged without rendering.
- Montage cards stay readable: a body that cannot be read while cards change on the beat is dropped, and long titles slow the montage down. A counter no longer repeats its unit ("50 ms ms").
- In vertical films a highlighted phrase keeps its full stop, and counters stay on one line.
- Tried on a real 9:16 film with Gemini 4 Neon through agy, including a remake with a producer note, through the preview gate to the render.

## v0.6.6 (2026-11-22)

- **Motion-graphics films:** a new episode kind with no people and no drawings. A director agent writes a rhythm sheet (hook, build, stop, peak, resolve) and scenes measured in beats: kinetic type (slams, mask rises, word by word, chapter counters, a highlight pill), data (bars from zero, a line drawn to its point, a counter), system diagrams (edges drawing on, packets on the beat), card grids and full-frame montages cut on the beat, particle fields and 3D objects with your logo. Code draws every frame; transitions (cut, flash, colour flip, flood, iris, whip, push-through), the camera, a synthesized score that follows the rhythm sheet and the sound effects all share the film's tempo.
- The plan is checked in code: a hook within 3 s, a burst of cuts near the middle, no more than two bars without something new, readable text. Scenes are lengthened until their text reads; other findings go back to the director once. Chart values, counters and card figures come only from your brief; any other number is shown with an "illustrative data" badge.
- Studio: **New episode → Motion-graphics film** (brief, length, 16:9 or 9:16, brand colours, logo and screenshots, optional narration). The Script tab shows the rhythm sheet and scenes, with **Remake with a note**.
- CLI: `pnpm ys episode new --film --topic "…" [--sec 30] [--vertical] [--color "#2563eb"] [--asset logo.png] [--narration]`. Without narration no paid API is used. Preview fixture: `pnpm motion:film`.
- Tried on a real brief with Gemini 4 Neon through agy: a 14-scene, 32-second film at 120 BPM with no check findings, rendered with its package and a vertical Short.
- Fixed: the Script tab of a footage Short showed the plain scene list instead of the edit (its data was not sent with the tab), and footage Shorts and YouTube analyses were labelled "Living stills + effects"; they are now named by kind.

After updating, rebuild and restart the Studio: `pnpm studio:build && pnpm studio:start`.

## v0.6.5 (2026-11-22)

- **ACP security:** `YS_ACP_COMMANDS` now lists full command lines, arguments included (semicolon separated, e.g. `claude-code-acp; gemini --experimental-acp`), and an agent runs only on an exact match. Allowing a bare command name let the Models page add any arguments, so an allowed launcher such as `npx` could run anything. If you set `YS_ACP_COMMANDS` for v0.6.4, write each entry with its arguments.
- An agent call stopped because the agent started using a tool is never retried, whatever the tool is called.

## v0.6.4 (2026-11-22)

- **ACP security:** the Models page can no longer store an arbitrary program to run. Only the ready-made Antigravity (`agy acp`) definition, or a command listed in `YS_ACP_COMMANDS` in the shell that starts the Studio and the CLI, is accepted; arguments that turn off an agent's permission prompts (`--dangerously-skip-permissions`, `--yolo`, `--auto-approve`…) are always refused. An agent that starts using a tool during a call is stopped, and the prompt marks video titles, transcripts and captions as untrusted data.
- A YouTube download that fails with HTTP 403 is retried once.
- CI: a platform-dependent branch in the ACP spawn kept branch coverage at 99.99% on Linux; it is now tested on every platform.

## v0.6.3 (2026-11-22)

- **Shorts from a YouTube video:** paste the address of a video you own or may use. It is downloaded once (yt-dlp, up to 1080p, kept in the library), its captions, chapters and replay graph are read, its scenes, frames and long silences measured, and an analyst goes through it a few minutes at a time with contact sheets and the transcript. You get a scene log, what a tighter edit would cut, and ranked Short candidates fitted to word boundaries. The candidates you pick become vertical footage Shorts with the original speech as captions and the hook on screen; an interrupted analysis resumes where it stopped.
- Studio: **New episode → From YouTube** (rights confirmation required); the episode's **Analysis** tab shows the report, links every time range to that moment on YouTube and makes Shorts from the ticked candidates, produced right away or opened for editing first.
- CLI: `pnpm ys episode new --youtube <address> [--count 6] [--min 20] [--max 60]`, then `pnpm ys episode run <id>` and `pnpm ys episode shorts <id> --candidates c1,c3 [--review] [--no-music]`. Needs yt-dlp (`winget install yt-dlp.yt-dlp`, or `YS_YTDLP`).
- **Agents through ACP:** any agent can run on an Agent Client Protocol agent instead of Claude. On the Models page, **Add Antigravity (agy)** or any ACP command, **Find models** reads its models without sending a prompt, and its models appear in every agent's list. Calls run in an empty temporary folder with tools refused, and the answer is checked against the agent's schema in code.
- Tried on a real 11.7-minute interview with Gemini 4 Neon through agy: four candidates in 3.5 minutes, one Short to the preview gate in 1.4 minutes.

After updating, rebuild and restart the Studio: `pnpm studio:build && pnpm studio:start`.

## v0.6.2 (2026-11-22)

- **Shorts from your own footage:** a new episode kind cuts a vertical 1080×1920 Short (15–180 s) from your own videos and images. An AI editor looks at sampled frames and the transcript, picks the best moments, frames each one for 9:16 (cropped around the subject or shown whole over a blurred copy), decides whether its own sound plays, and writes a voice-over and on-screen texts (a hook, labels, a call to action, plus any texts you give verbatim). Captions follow the narration and the kept speech; music and sound effects follow the beats; the cover is the Short's own frame with the hook.
- Studio: **New episode → Short from your footage** uploads the files as you pick them (up to 1 GB each, `YS_FOOTAGE_MAX_MB`). The Script tab shows the edit with a frame for every part; before approving you can reorder, add or remove beats, parts and texts and change each part's source, range, crop focus, framing and sound. After cutting, a cheap vision check fixes crops that cut the subject.
- CLI: `pnpm ys episode new --footage a.mp4 --footage b.jpg --sec 30 [--overlay "text"] [--no-narration] [--no-transcribe]`.
- Speech in your videos is transcribed with a local whisper.cpp when `YS_WHISPER` and `YS_WHISPER_MODEL` are set (free), otherwise with ElevenLabs Scribe (about $0.40 per hour of audio). Both are unverified until their first real call.
- Studio uploads larger than 10 MB are no longer cut short by Next.js.
- Add immutable benchmark review packets, label history and a frozen TR and EN benchmark supplement.

After updating, rebuild and restart the Studio: `pnpm studio:build && pnpm studio:start`.

## v0.6.1 (2026-11-17)

- Finalize 0.6.1 release notes
- Unify Studio review and prepare the 0.6.1 security baseline
- Improve Studio discovery and revision-aware reads
- Add a style-aware anatomy check to the frame checklist
- Override hono to 4.13.18 for five new advisories
- docs: streamline READMEs and organize production guides
- Override @hono/node-server to 2.1.6 for two moderate advisories

## v0.6.0 (2026-11-13)

- The draft review checks every frame against a checklist: for each of 13 checks (shows what is narrated, the frame has content, nobody cut off or floating, no backdrop box, texts clear of each other and of the subtitles, readable text, scale, clutter, repetition, the narrated action, anything else broken) the critic first writes what it saw in that frame, then gives a verdict. Answers without real evidence are rejected and the frame is asked again. The code scores the frame: 10, minus 3 per major and 1 per minor failure.
- A scene passes only when every frame was checked and scored 8 or more. Every scene below is re-planned, worst first, in up to three rounds; a re-plan that makes a scene worse is undone.
- **Behaviour change:** while a scene stays below 8, or its frames could not be reviewed, the render waits for your explicit approval, even in an episode approved automatically from the CLI. The Shots tab lists those scenes with their worst score and offers *Approve anyway*; each frame's details show the checklist with its evidence. `pnpm ys episode show <id>` prints them and `pnpm ys episode approve <id> preview` renders anyway. Episodes reviewed before this version never block.
- Measured on 30 stored frames: the old single-score critic averaged 5.4 and passed none at 8; the checklist averaged 8.2 and passed 21–22 of 30, with no invalid answers. Cost estimates now count the larger share of re-planned scenes.
- Reproducible CI, offline diagnostics (`pnpm ys doctor`) and a release helper that never resets the tree on failure.

After updating, rebuild and restart the Studio: `pnpm studio:build && pnpm studio:start`.

## v0.5.1 (2026-11-12)

- Play an episode in the Studio without rendering: once the timeline is ready, the Shots tab plays it in the browser with the render's own scene code, voice-over, music, effects, transitions and captions; any shot can be played from its first frame. Smooth playback needs the production build.
- The Studio listens on this machine only (`127.0.0.1`) and answers only requests addressed to `localhost`, `127.0.0.1` or `[::1]`. To open it on a trusted network, list the address in `YS_STUDIO_HOSTS` and start Next.js with `-H 0.0.0.0` yourself (see the README).
- Malformed request bodies get a 400 instead of a server error, and an empty body no longer wipes the saved model choices.
- Errors show in the selected language in the English UI, and a missing episode or its video is a 404.
- A job that fails to start no longer crashes the Studio server.

After updating, rebuild and restart the Studio: `pnpm studio:build && pnpm studio:start`.

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
