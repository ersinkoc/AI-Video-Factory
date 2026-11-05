# AI Video Factory

**English** · [Türkçe](README-TR.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/ersinkoc/AI-Video-Factory)](https://github.com/ersinkoc/AI-Video-Factory/releases)

An AI video factory that produces multilingual, animation-heavy YouTube videos from a single topic. Claude agents write the story and script, plan the shots, design the vector art and review their own output. Paid media APIs generate voice, images and video clips, and Remotion renders the final cut. A web Studio shows what is happening at every step and lets a human make the final call.

Architecture, provider choices and the roadmap are in [docs/PROJE_PLANI.md](docs/PROJE_PLANI.md) (Turkish). Release history: [CHANGELOG.md](CHANGELOG.md).

## Sponsor

<table>
  <tr>
    <td width="96" valign="top">
      <a href="https://wrongstack.com"><img src="https://raw.githubusercontent.com/WrongStack/WrongStack/main/website/public/wrongstack.svg" width="80" height="80" alt="WrongStack"></a>
    </td>
    <td>
      <strong><a href="https://wrongstack.com">WrongStack</a></strong>: a free, open-source (MIT) AI coding agent that gets better at <em>your</em> codebase over time. It reads code, runs tools and coordinates specialist agents, with durable memory across sessions, visible permission boundaries and no subscription. One self-contained binary, no Node.js needed.<br><br>
      macOS / Linux: <code>curl -fsSL https://wrongstack.com/install.sh | sh</code><br>
      Windows: <code>irm https://wrongstack.com/install.ps1 | iex</code><br><br>
      <a href="https://wrongstack.com">wrongstack.com</a> · <a href="https://github.com/WrongStack/WrongStack">GitHub</a>
    </td>
  </tr>
</table>

## Features

- **Topic to finished video.** The pipeline runs these stages: style → story → script → *approval* → cast → concept → *approval* → voice → shots → keyframes → clips → timeline → render → package → short → review. Every stage is idempotent and saves after each sub-step, so a failed run resumes where it stopped.
- **Four motion modes:**
  - `vector`: Claude-drawn SVG characters on a rig, animated in code. This is the cheapest mode.
  - `still`: images with Ken Burns motion.
  - `mixed`: some shots become AI video clips.
  - `animated`: every shot becomes an AI video clip.
- **Quality gate.** No SVG is used without a check:
  1. Before drawing, a planner agent studies reference images and turns the description into a concrete drawing plan.
  2. A blind reviewer says what the drawing shows without being told its name.
  3. A gate agent scores how recognisable it is and how faithful it is to the references; for a character, also whether its arms, hands and legs will look natural when they move (no tube-like forearms, mitten hands or stains on the limbs).
  4. Drawings that fail are redrawn with the list of defects. If they still fail, they are not used. A key prop that appears in several shots gets one more try from a simpler, iconic brief; if that fails too, the scenes that used it are replanned without it instead of showing an empty room.
- **Grounded in reality.** Real subjects are drawn from reference images found on Wikipedia and Wikimedia Commons. For a real person, the photos are first measured once: face shape, brows, eyes, nose, hair and hairline, facial hair, glasses and build go on a likeness sheet (what differs from average, with colours as hex); the illustrator draws to it and the quality gate checks for it. The analysis never names the person or infers anything beyond form and colour, and a person who may be a minor is skipped. For objects, a ready-made public-domain/CC0 vector drawing from Commons is tried first; it is used only if it passes the same quality gate, and it is scaled to its real size like a drawn one (some files have no viewBox and used to show at their file's pixel size: a giant book over a person, a laptop that vanished). Claude does not draw maps or flags: they are generated from real data (world-atlas, flag-icons). A map of a historical event shows that year's borders, from the Cliopatria dataset (Seshat Global History Databank, CC BY 4.0, downloaded once on first use), never today's countries; the credit line is added to the publishing description automatically.
- **The human has the final say.** In the Studio you can accept a drawing the gate rejected, or reject one it passed and add a note for the designer. You can also turn the reality check off for one episode.
- **64 ready-made style packs.** Examples include flat explainer, Ottoman miniature, film noir, blueprint, ukiyo-e, synthwave, chalkboard, watercolour, 8-bit pixel, risograph, stained glass, isometric diorama, Byzantine mosaic, Egyptian wall painting, Greek black-figure, Anatolian kilim, ink wash, manga screentone, technical cutaway and whiteboard doodle, plus four 3D-look packs (soft 3D, claymation, vinyl toy, low-poly): in vector mode their characters are real 3D figures built in code with three.js (matte, clay, glossy or faceted surface; a cheap agent reads the approved drawing and picks skin, hair, beard, glasses, clothes and build), they keep every puppet pose, gesture and talking mouth, and they turn to profile while walking; rendering stays free. The concept step, the character bank and the style gallery show the figure itself (a preview rendered locally), marked 3D. Rooms and objects in those packs get their volume from SVG gradients, highlights and contact shadows. In image/video modes the packs ask for real 3D renders. In *Automatic* mode a cheap agent picks the pack that fits the topic; you can also choose one yourself, or choose *Custom* to let the art director design freely. A pack fixes the colours, drawing rules and line style, so all episodes in a pack look as if the same hand made them. Run `pnpm ys styles` to list them. The new-episode form shows a gallery with the same character and room drawn in each pack; click one to choose it. The samples come from episodes already drawn in that pack, and `pnpm ys styles samples [pack...]` draws the missing ones with the real designer and quality gate (Claude, about $0.2–0.3 per pack). Each sample character also joins the character bank as a presenter in that style. Packs also carry a texture that the renderer lays over every vector scene in code (paper, watercolour, chalk, halftone, engraving hatching, film grain, scanlines), so they differ by more than colour. In the watercolour packs characters and objects are painted on an opaque paper base, as on a real sheet: the washes stay translucent over each other, but the room never shows through a person or a desk.
- **Vector animation that obeys physics.** Characters are puppets on a rig, moved entirely in code: things on the floor never float, walk steps follow the distance travelled, held objects stay in the hand, and a character appears only once per shot. Gestures have anticipation and overshoot; pointing aims at its target, and when the object is within reach the elbow bends so the fingertip stops at its edge instead of covering it, eyes follow the listener, and explaining uses one dominant hand. Mouths speak the narration: every sound gets its own mouth shape (lips closed on m, b and p, wide on a, round on o, pursed on u, teeth on the lip for f and v), drawn in code where each drawing's mouth was measured. Eyebrows carry the emotion: each drawing's own brows are split into left and right and tilted in code, inner ends raised when worried or sad, lowered and drawn together when angry, one brow arched while thinking. The head nods, the brows lift and the hands stroke on the stressed words of each sentence. Word timings are aligned to the pauses in the recorded voice, so captions, lips and gestures stop where the narrator pauses. Hands turn at the wrist when an arm reaches out sideways, so the thumb stays on top instead of pointing at the floor. Faces turn like a real head: when the eyes look to one side the nose moves with them, so the eyes never run into the nose and glasses stay on it, and the neck sits behind the collar instead of on top of the clothes. A thinking character takes one of three poses per shot: the chin resting on the hand in front of the face (the elbow propped on the other hand, the fingers kept below the mouth), scratching the side of the head, or arms crossed with the head tilted and the eyes up. Characters also act out what the narration says: typing at a keyboard, writing, reading a page, holding an object up to show it, clapping, hands on hips, arms crossed, handing an object to someone, nodding yes and shaking the head no (when the director planned only a generic gesture, the action the shot's description narrates is given to that person in code, unless the render cannot stage it); clapping, key taps and pen strokes are heard in sync with the hands. A hand that points at or gestures toward the person beside it stops halfway between them, so two hands never meet in mid-air. Characters turn to the person they are with instead of staring at the camera: a listener turns toward the speaker, the speaker half way; 3D figures really turn. Standing characters rest their weight on one leg and shift it now and then, and listeners take a relaxed pose of their own (a hand on the hip, hands together in front) instead of standing in an identical row with arms hanging. Optional side views let walking characters turn to profile. A room used in many shots gets its reverse angle drawn once (the opposite wall of the same place, checked against the first view), and consecutive shots in that room cut between the two angles instead of showing the same wall again. Every place also gets up to two large pieces of furniture that really stood there at that time (a bookcase, a cabinet, a tall plant), chosen by a cheap agent and drawn once from references like every object; in wide and medium shots code stands them at the back of the room, behind the action, so a room no longer shows a bare wall behind one person. A piece keeps its spot from shot to shot, the reverse angle shows the other wall, it never covers a board or a window, and the camera frames the shot as if it were not there. Screens and boards show what the shot is about: the director writes what a monitor, laptop, TV, phone, giant screen or blackboard shows (code with syntax colours, a command line, a web page, a search, a chat, a headline or a person's face), and code draws it on the drawing's own screen, so the same computer shows something new in every shot. Screen text wraps and stays at a readable size in the frame; on a small screen a chat keeps its newest messages. Characters speak and think in comic bubbles: the director writes the words, code draws the bubble beside the head with its tail to the mouth, clear of faces and titles. Close-ups reframe themselves when the subject would stay tiny, and a camera moving in on an object keeps everyone the director had in frame (a close-up of the laptop no longer drops the person working at it). A small key object in a wide shot (a page, a screen, a chip) is shown magnified in a round inset with a pointer, placed where it covers no face, body or text and kept there for the whole shot; the inset opens only once its object has appeared, and not at all if every spot would cover a person. When the director's close-up is aimed at a small object that still cannot reach a readable size (a chip, a cheque, a stamp, a gavel), the shot becomes a macro insert: once the object is in place, the scene behind it softens and darkens (people stay recognisable) and the object grows to the middle of the frame, screen content included, standing on a magnified strip of the desk or table it rests on. A close-up aimed at the person gets the inset instead when the object stays small because the head has to stay in frame. The camera behaves like a lens: as it moves in, focus stays on the subject while the wall, the extras and people far in front of or behind it go soft (depth of field; wide shots stay sharp everywhere, anyone talking stays sharp, and so does any text the shot is about), screens glow slightly, and the frame drifts by a pixel or two like a camera on a tripod instead of standing perfectly frozen. It adds no measurable render time. Light falls into the room from one side: the side of its window or lamp, found in the room's own drawing (the brightest mid-sized shapes), or a fixed side per room when none stands out; the reverse angle of a room is lit from the other side. Each shot knows the object it is about (named by the director, or taken from the shot description): objects keep their real size, so when that object is too small to read the camera moves in on it, with everyone's head still in frame and near the top, before an inset is needed. An object shown in the air beside a person is never drawn smaller than a hand-held one. Name tags sit right on the drawn head, and a real person is named where they first appear in the episode (scenes are planned separately, so code puts the tag there, in the spelling the director used elsewhere), the info card moves to the other upper corner when a person is under it, people on one bench sit side by side, two people standing in a wide shot come to talking distance (about 1.1 m) instead of staying at opposite ends of the room, stopping at the edges of a desk or board between them, and a person in front steps aside instead of hiding a face behind them; someone short behind a counter rises so their head and shoulders show above it, clear of the sign's pole; a monitor on a desk slides along it so it does not hide the face of the person behind. The camera never cuts a standing person at the ankles, shins or knees, in close-ups too: either the feet are in frame or the cut is at mid-thigh or higher; if moving the frame is not enough, it zooms a little in or out. A wide shot with a lot of bare wall and floor moves in to a medium shot; a tall machine or cabinet beside the people may lose a little of its base for it, small objects stay whole. A close-up of a person frames them from the waist up with a little headroom (a director's zoom of 1.5–2 used to show a small full figure under an empty wall), and 3D figures are drawn at screen resolution so close-ups stay sharp. When two shots in a row show the same people in the same room at the same size, the second one changes size (wide, medium, close) so the cut does not look like a jump. Confetti, sparks and dust fall behind the characters; fog thickens with distance, hazing the room behind the people while only a thin ground mist drifts in front of them; nothing covers the on-screen text. Cheering fists pump at head height with bent elbows, each person in their own rhythm, clapping palms meet at the middle of the chest, typing hands rest on the two halves of the keyboard and tap, and the writing hand moves along the line while the other holds the paper. Scenes with more people than the cast (an army, an audience, protesters, a market) get extras drawn by code in rows behind the cast: anonymous people in casual clothes, suits, uniforms or robes who stand, listen, cheer, applaud, protest or march forward, without covering anything behind them. They are heard too: applause, cheers, a murmur, chants as the fists go up and footsteps in step with the march. A person typing or writing stands behind their desk (a chair beside the desk slides behind it with its sitter), and their hands go to its real height: up onto a high counter, onto the desktop when sitting, down to a low table. Someone writing on a whiteboard, blackboard or flip chart stands at its edge rather than in front of the writing, and the pen moves along a line inside the board while the head turns to it. No pose goes beyond what a human body can do: joint limits come from clinical range-of-motion tables (the elbow bends at most 150°, measured in 3D with foreshortened limbs reconstructed; the knee never bends sideways; the shoulder crosses the body only as far as it can), render clamps anything beyond them, and a test sweeps every gesture, every pair of gestures, and sitting, holding, mirrored and walking poses. 3D figures turn a foreshortened forearm or thigh toward the camera instead of squashing it. Before render every shot is checked in code: a half face at the frame edge, a face hidden behind furniture, text over a face, people walking through each other, a hand pointing at nothing, typing away from the desk, a prop that could not be drawn, an empty frame, a joint that jumps between frames, a joint bent past its human limit. What can be fixed without losing meaning is fixed at render: a person steps up to the desk or out from behind the counter, picks up the nearby book to read it, a walker passes in front of someone instead of through them, a cheer lasts a few seconds instead of the whole shot, and the camera keeps every still face fully in or fully out of frame. Scenes that would still show a defect are replanned by the director.
- **A vertical Short from every episode.** The publishing agent picks the strongest 20–60 seconds of consecutive scenes; code re-renders them as 9:16 at no API cost, with music and effects regenerated for the clip. In vertical frames the stage shrinks per shot when needed so characters at the edges are not cut.
- **Music and sound without API costs.** Background music is synthesized in code: its sections follow the mood the director gives each shot (bright, warm, cool, night, dramatic), all in one key with crossfades, and it ducks under the narration word by word. In vector mode, animations also get frame-locked sound effects. Both are per-episode switches.
- **Scene transitions and build-in.** Within a scene shots dissolve quickly; at a scene change the next scene comes in with a wipe, a slide, an iris or a zoom (never the same twice in a row) with motion blur while it moves fast, as a camera shutter would draw it (the sliding frame smears sideways, the edge of a wipe or iris goes soft, a zoom blurs slightly; about a second of render time per scene change; objects that slide, pop or shake into place smear the same way, people do not), and its first shot builds up piece by piece: the room first, then the furniture and objects, then the people.
- **Clean on-screen text and optional subtitles.** Place, date and event lines sit in one info card at the top-left; name tags stay next to their person. Subtitles are always written as an `.srt` next to the video, and burning them in is a per-episode switch.
- **Character bank.** Keep topic-independent characters (a presenter, a scientist, a child…) and use them as the on-screen presenter, add them to a cast, or make them a series mascot. They are never redrawn.
- **Character reuse.** Approved characters are kept in a library together with their identity. When the same person appears again in the same style (for example a real historical figure or the channel's host), the casting agent reuses the drawing instead of redrawing it. In the Studio you can also pick one with *Use from library*. Run `pnpm ys library` to list them.
- **Series.** Episodes can belong to a series. The home page filters by series. A new episode in an existing series inherits that series' settings and style pack, and the series' own characters are offered first for reuse. Use `--series "Name"` in the CLI.
- **Learning loop.** After each render the frames are reviewed against the episode's own art style and palette (a sepia or monochrome style is not a defect), each taken at a moment when the shot's planned gestures are visible and its texts have opened, and lessons are written to a rule book that later episodes follow; a lesson never overrides a style's palette.
- **Many media models, one router.** Paid calls go through one gateway that ranks providers by quality and price for the episode's budget tier, caches by content hash and falls back when a provider fails. Available today: fal (FLUX, Kontext, Seedream 4.5, Kling 3 / 2.6, MiniMax H3 Max Turbo, PixVerse V6, Vidu Q3 Turbo, Seedance 2), Gemini (Nano Banana image models, TTS, Omni Flash video as an opt-in), ElevenLabs (voice, sound effects, music) and a local ComfyUI. Run `pnpm ys plan` to see the ranking without spending money.
- **Cost first.** Estimates are shown before any money is spent. Requests are cached by content hash, so the same request is never paid twice. A per-episode budget cap applies to paid image, voice and video APIs. Claude agent calls are shown separately and do not count toward the cap.
- **Choose a model per agent.** The Studio **Models** page sets which Claude model each agent uses (for example Sonnet instead of Haiku for the quality gate).
- **Bilingual Studio.** The Studio is in Turkish and English. Videos can be in any language the voice provider supports. Foreign names and terms are read the way speakers of the narration language say them: before the voice-over, a built-in list and a cheap agent turn them into respellings for the voice (a Turkish narration says "C++" as "si pılas pılas", not "ce artı artı"), while the captions keep the original spelling and the lips follow the spoken form. In Turkish, numbers are written with digits and read by rule: "II. Mehmed" → "ikinci Mehmed", "1,5 milyon" → "bir buçuk milyon", "%75" → "yüzde yetmiş beş", "3/4" → "dörtte üç", "$1 milyarlık" → "bir milyar dolarlık", "1452–1481" → "… ile …", "vb." → "ve benzeri". Abbreviations a narrator reads out in full are expanded with the suffix rebuilt by Turkish grammar: "TBMM'nin" → "Türkiye Büyük Millet Meclisi'nin", "ABD'ye" → "Amerika Birleşik Devletleri'ne", "BM'ye" → "Birleşmiş Milletler'e". Acronyms said as a word stay a word and are never expanded or spelled out: "COBOL" → "kobol", "NATO" → "nato".

## Requirements

- Node.js 24 or newer, and pnpm 11
- FFmpeg (for the local render test and video clips; if `ffmpeg`/`ffprobe` is not on PATH, voice-over durations and loudness use the copy bundled with Remotion)
- Claude: either a signed-in Claude Code installation (subscription) or `ANTHROPIC_API_KEY`
- Optional API keys: fal, Gemini, ElevenLabs. Providers without a key are disabled.
- Optional: Manim 0.22 and LaTeX for formula and graph boards (see below); without them shots simply have no board.

## Setup

```bash
git clone https://github.com/ersinkoc/AI-Video-Factory.git
cd AI-Video-Factory
pnpm install
cp .env.example .env          # fill in the keys you have; empty providers are disabled
pnpm ys providers             # which providers are active?
pnpm ys render-demo           # no API calls: local Remotion render test
```

It runs without Docker. Assets go to `.data/assets`, the cost ledger to `.data/ledger.jsonl` and videos to `.data/episodes`. To use Postgres 18, Redis 8 and RustFS (S3) instead:

```bash
pnpm infra:up                 # ports: 5433 (pg), 6380 (redis), 9000/9001 (rustfs)
pnpm db:migrate
pnpm test:integration
# .env: STORE=s3, LEDGER=db
```

### Manim boards (optional)

In vector episodes the director can put a formula or a real data graph on a board in the middle of a shot. The code
turns that recipe into a Manim scene and renders it locally into a transparent clip (no API, no model-written code;
LaTeX is limited to math commands). Setup on Windows:

```bash
python -m venv .data/tools/manim-venv
.data/tools/manim-venv/Scripts/python -m pip install manim==0.22.1
winget install --id MiKTeX.MiKTeX --scope user
# let MiKTeX fetch missing LaTeX packages on its own:
"%LOCALAPPDATA%/Programs/MiKTeX/miktex/bin/x64/initexmf" --set-config-value=[MPM]AutoInstall=1
```

Other locations: `YS_MANIM` (path to the `manim` executable) and `YS_LATEX_BIN` (LaTeX bin folder). Boards are cached
under `library/math`.

## Studio (recommended)

```bash
pnpm studio                   # development: http://localhost:3100
pnpm studio:build && pnpm studio:start   # production build, same port
```

1. **New episode.** Click **New episode** at the start of the top menu; the form has its own full-width page. Enter a topic, then choose the language, length, motion mode, line style, voice, budget, whether the reality check is on and whether subtitles are burned into the video. Each motion-mode card shows its estimated cost; the panel on the right breaks the chosen mode down by stage.
2. **Script.** Edit the scenes and approve them.
3. **Concept.** Characters and places are cast and drawn. The quality-gate panel shows each drawing with its references, scores, defects and drawing plan. Accept, reject or redraw with a note.
4. **Production.** The pipeline rail, live panel and activity log show every agent call with its model, cost and duration. Production stops before the render and waits for your approval: the Shots tab shows a preview frame of every shot, and *Approve and render* starts the render once you are happy (re-creating shots asks for the approval again; changing only subtitles, sound effects or music re-renders without asking). CLI episodes are approved automatically unless created with `--manual` (`pnpm ys episode approve <id> preview`); in vector mode a shot's frame appears as soon as all of its props are drawn. To change part of a vector episode, before or after the render, select shots there (Shift-click for a range), write what should change ("the map should show 1453, with the Ottoman and Byzantine states highlighted") and press *Re-create*: the review's findings for the selected shots go along automatically, so *Select weak shots* (score 4 or lower) plus *Re-create* fixes them in bulk without a note. The director re-plans only those scenes, new props are drawn and the video is rendered again (one director call per scene; the automatic revision passes are skipped so they cannot undo your note). Only the scenes that changed are rendered again: the render is kept scene by scene, and a render that stops halfway resumes from the scenes already finished.
5. **Watch and download** the video and its `.srt` subtitle file, and read its review. Subtitles are always written as an `.srt` next to the video; burning them in is a per-episode switch (changing it re-renders only, at no cost).
 The publishing package gives a YouTube title, a description with chapters, tags (each with a copy button) and a downloadable 1280×720 thumbnail. A horizontal episode also gets a vertical Short: the package picks its best 20–60 seconds and they are re-rendered locally as 9:16.
6. **Delete.** Every card on the Episodes page has a trash button, for unfinished and finished episodes alike. It asks first, then deletes the episode's state, its video, Short, thumbnail, subtitles, render cache, review frames, sound effects and music. Drawings approved into the library, the shared generation cache and the cost ledger stay. An episode with a running job cannot be deleted until the job stops.

On-screen text follows one layout: place, date and event lines sit in a fixed info card at the top-left, and name tags stay next to their person, all in one typeface and one plate style. The card never covers a face or a name tag: when people stand in the top corners it moves to the other corner or into the gap between them, and it keeps that place for the whole shot.

Other pages:

- **Costs:** the spend ledger.
- **Pricing:** provider prices.
- **Lessons:** the learned rule book.
- **Rules:** the Studio rules, read from the same constants the code uses.
- **Models:** the model for each agent.

Heavy work runs in a separate CLI process, not in the Studio server, so CLI runs also appear live in the Studio.

## CLI

```bash
pnpm ys episode new --topic "Ottoman coffeehouse bans" --lang en --minutes 3 --motion vector --budget 5
pnpm ys episode run <id>                    # all stages; run again to resume after an error
pnpm ys episode run <id> --until script     # story + script only (no image or voice spend)
pnpm ys episode run <id> --from keyframes   # regenerate from a stage
pnpm ys episode show <id>
pnpm ys cost --episode <id>
pnpm ys plan --cap i2v --duration 5         # provider ranking without spending money
pnpm ys version
```

Useful options for `episode new`:

- `--motion animated|mixed|still|vector`
- `--style-pack auto|custom|<pack>` (list: `pnpm ys styles`)
- `--line outline|flat|sketch|ink` (default: the pack's line style)
- `--manual`: stop at the approval gates.
- `--no-qa`: turn off the frame checks.
- `--no-realism`: turn off the reality check.
- `--side-views`: vector mode only. Characters that walk get a second, profile drawing and turn to it while walking. Each one costs a designer call and a gate check (about $0.15–0.35) and is kept in the library.
- `--no-reverse-views`: vector mode only. By default a room used in six or more shots (at most three rooms) gets its reverse angle drawn once (about $0.11 each, kept in the library); this turns it off.
- `--no-set-dressing`: vector mode only. By default every place gets up to two large period pieces of furniture, drawn once (about $0.05 each, kept in the library) and placed at the back of the room in its wide and medium shots (never with an edge running through or just beside someone's head); this turns it off.
- `--vertical`: render in 9:16.
- `--no-captions`: do not burn subtitles into the video (the `.srt` is still written).

Character bank (vector mode): every approved character is kept in a library and shown on the Studio's **Characters** page. You can have Claude draw a topic-independent character there (a presenter, a scientist, a child…; about $0.15–0.35 each, gate-checked) and make any character a series mascot. When you start an episode you can pick a bank character as the on-screen presenter (it speaks the narration and appears in most shots) or add bank characters to the cast. They are not redrawn: the episode switches to their style pack. CLI: `pnpm ys bank [list|add|mascot]`, `episode new --presenter <id> --with <id,id>`.

Run `pnpm ys --help` for everything.

## Configuration

Keys and switches live in `.env` (see `.env.example`). Notable ones:

| Variable | Purpose |
|---|---|
| `FAL_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` | Media providers. If a key is empty, that provider is disabled. |
| `ANTHROPIC_API_KEY` | Claude agents. If empty, the Claude Code login is used. |
| `YS_MODEL_CREATIVE` / `_FAST` / `_CHEAP` | Default model for each tier. Per-agent choices on the Models page override these. |
| `STORE=s3`, `LEDGER=db` | Use S3 and Postgres instead of local files. |
| `GEMINI_OMNI_VIDEO=1` | Enable Gemini Omni Flash video (the Veo replacement; not yet verified with a real run). |
| `YS_UPDATE_CHECK=0` | Turn off the Studio's update check. |
| `YS_RENDER_GL` | Chrome drawing backend for renders. Default `angle` (graphics card; about 40% faster, and needed for 3D figures). `swangle` is software GL for machines without a GPU. A GPU render that crashes is retried once with software GL. |

## Versions and updates

The version lives in the root `package.json`. The Studio header shows it, and so does `pnpm ys version`.

The Studio checks the latest GitHub release every 6 hours. If a newer version exists, a banner with the release notes appears. To update:

```bash
git pull && pnpm install && pnpm studio:build   # then restart pnpm studio:start
```

To cut a release (maintainers):

```bash
pnpm release patch|minor|major              # bump, CHANGELOG, commit and tag (local only)
pnpm release minor --publish                # also push and create the GitHub release
pnpm release minor --dry-run                # preview the notes
```

The release script only runs on `main` with a clean working tree, after typecheck and tests pass.

## Commands

| Command | What it does |
|---|---|
| `pnpm studio` / `studio:build` / `studio:start` | Studio in development or production mode |
| `pnpm ys …` | CLI |
| `pnpm typecheck` | TypeScript 7 check |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:coverage` | Unit tests with coverage; fails below 100% lines/branches/functions/statements |
| `pnpm test:integration` | Postgres and RustFS tests (needs Docker) |
| `pnpm release` | Version bump, changelog and tag |
| `pnpm db:generate` / `db:migrate` | Drizzle migrations |
| `pnpm infra:up` / `infra:down` | Docker infrastructure |

## License

[MIT](LICENSE) © 2026 Ersin KOÇ.

Third-party parts keep their own terms. In particular, [Remotion](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) (the renderer) is free for individuals, non-profits and for-profit companies with up to 3 employees; larger companies need a Remotion company license. Generated media is subject to each provider's terms (fal, Google, ElevenLabs), and reference images keep their Wikimedia licenses.

## Repository layout

| Path | Contents |
|---|---|
| `packages/core` | Shared Zod schemas, money in micro-dollars, quality-gate rules, model roles, versions |
| `packages/media-gateway` | Every paid generation call: cost and quality router, cache, budget cap, fallback |
| `packages/agents` | Claude Agent SDK agents with JSON-schema output |
| `packages/pipeline` | Episode state machine and stages, references, map and flag generation, estimates |
| `packages/video` | Remotion compositions, including the vector scene renderer, PixiJS (WebGL) particle atmospheres, a three.js 3D globe for planet-scale maps, paper.js-measured draw-on reveals, GSAP kinetic text, Manim formula/graph boards, synthesized background music and frame-locked sound effects |
| `packages/storage`, `packages/db` | Local or S3 asset store; Postgres cost ledger |
| `apps/studio` | Next.js Studio |
| `apps/cli` | `pnpm ys` |
| `apps/worker` | Trigger.dev task (optional) |
