# AI Video Factory

**English** · [Türkçe](README-TR.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/ersinkoc/AI-Video-Factory)](https://github.com/ersinkoc/AI-Video-Factory/releases)

An AI video factory that produces multilingual, animation-heavy YouTube videos from a single topic. Claude agents write the story and script, plan the shots, design the vector art and review their own output. Paid media APIs generate voice, images and video clips, and Remotion renders the final cut. A web Studio shows what is happening at every step and lets a human make the final call.

Architecture, provider choices and the roadmap are in [docs/PROJE_PLANI.md](docs/PROJE_PLANI.md) (Turkish). Release history: [CHANGELOG.md](CHANGELOG.md).

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
  3. A gate agent scores how recognisable it is and how faithful it is to the references.
  4. Drawings that fail are redrawn with the list of defects. If they still fail, they are not used.
- **Grounded in reality.** Real subjects are drawn from reference images found on Wikipedia and Wikimedia Commons. For objects, a ready-made public-domain/CC0 vector drawing from Commons is tried first; it is used only if it passes the same quality gate. Claude does not draw maps or flags: they are generated from real data (world-atlas, flag-icons).
- **The human has the final say.** In the Studio you can accept a drawing the gate rejected, or reject one it passed and add a note for the designer. You can also turn the reality check off for one episode.
- **28 ready-made style packs.** Examples include flat explainer, Ottoman miniature, film noir, blueprint, ukiyo-e, synthwave, chalkboard, watercolour and 8-bit pixel, plus four 3D-look packs (soft 3D, claymation, vinyl toy, low-poly): in vector mode their characters are real 3D figures built in code with three.js (matte, clay, glossy or faceted surface; a cheap agent reads the approved drawing and picks skin, hair, beard, glasses, clothes and build), they keep every puppet pose, gesture and talking mouth, and they turn to profile while walking; rendering stays free. The concept step, the character bank and the style gallery show the figure itself (a preview rendered locally), marked 3D. Rooms and objects in those packs get their volume from SVG gradients, highlights and contact shadows. In image/video modes the packs ask for real 3D renders. In *Automatic* mode a cheap agent picks the pack that fits the topic; you can also choose one yourself, or choose *Custom* to let the art director design freely. A pack fixes the colours, drawing rules and line style, so all episodes in a pack look as if the same hand made them. Run `pnpm ys styles` to list them. The new-episode form shows a gallery with the same character and room drawn in each pack; click one to choose it. The samples come from episodes already drawn in that pack, and `pnpm ys styles samples [pack...]` draws the missing ones with the real designer and quality gate (Claude, about $0.2–0.3 per pack). Each sample character also joins the character bank as a presenter in that style. Packs also carry a texture that the renderer lays over every vector scene in code (paper, watercolour, chalk, halftone, engraving hatching, film grain, scanlines), so they differ by more than colour.
- **Vector animation that obeys physics.** Characters are puppets on a rig, moved entirely in code: things on the floor never float, walk steps follow the distance travelled, held objects stay in the hand, and a character appears only once per shot. Gestures have anticipation and overshoot; pointing aims at its target, eyes follow the listener, and explaining uses one dominant hand. Characters also act out what the narration says: typing at a keyboard, writing, reading a page, holding an object up to show it, clapping, hands on hips, arms crossed; clapping, key taps and pen strokes are heard in sync with the hands. Optional side views let walking characters turn to profile. Close-ups reframe themselves when the subject would stay tiny. A small key object in a wide shot (a page, a screen, a chip) is shown magnified in a round inset with a pointer, placed where it covers no face or text. Name tags sit right on the drawn head, the info card moves to the other upper corner when a person is under it, people on one bench sit side by side, and a person in front steps aside instead of hiding a face behind them. Confetti, sparks and dust fall behind the characters; nothing covers the on-screen text.
- **A vertical Short from every episode.** The publishing agent picks the strongest 20–60 seconds of consecutive scenes; code re-renders them as 9:16 at no API cost, with music and effects regenerated for the clip. In vertical frames the stage shrinks per shot when needed so characters at the edges are not cut.
- **Music and sound without API costs.** Background music is synthesized in code: its sections follow the mood the director gives each shot (bright, warm, cool, night, dramatic), all in one key with crossfades, and it ducks under the narration word by word. In vector mode, animations also get frame-locked sound effects. Both are per-episode switches.
- **Clean on-screen text and optional subtitles.** Place, date and event lines sit in one info card at the top-left; name tags stay next to their person. Subtitles are always written as an `.srt` next to the video, and burning them in is a per-episode switch.
- **Character bank.** Keep topic-independent characters (a presenter, a scientist, a child…) and use them as the on-screen presenter, add them to a cast, or make them a series mascot. They are never redrawn.
- **Character reuse.** Approved characters are kept in a library together with their identity. When the same person appears again in the same style (for example a real historical figure or the channel's host), the casting agent reuses the drawing instead of redrawing it. In the Studio you can also pick one with *Use from library*. Run `pnpm ys library` to list them.
- **Series.** Episodes can belong to a series. The home page filters by series. A new episode in an existing series inherits that series' settings and style pack, and the series' own characters are offered first for reuse. Use `--series "Name"` in the CLI.
- **Learning loop.** After each render the frames are reviewed, and lessons are written to a rule book that later episodes follow.
- **Many media models, one router.** Paid calls go through one gateway that ranks providers by quality and price for the episode's budget tier, caches by content hash and falls back when a provider fails. Available today: fal (FLUX, Kontext, Seedream 4.5, Kling 3 / 2.6, MiniMax H3 Max Turbo, PixVerse V6, Vidu Q3 Turbo, Seedance 2), Gemini (Nano Banana image models, TTS, Omni Flash video as an opt-in), ElevenLabs (voice, sound effects, music) and a local ComfyUI. Run `pnpm ys plan` to see the ranking without spending money.
- **Cost first.** Estimates are shown before any money is spent. Requests are cached by content hash, so the same request is never paid twice. A per-episode budget cap applies to paid image, voice and video APIs. Claude agent calls are shown separately and do not count toward the cap.
- **Choose a model per agent.** The Studio **Models** page sets which Claude model each agent uses (for example Sonnet instead of Haiku for the quality gate).
- **Bilingual Studio.** The Studio is in Turkish and English. Videos can be in any language the voice provider supports.

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
4. **Production.** The pipeline rail, live panel and activity log show every agent call with its model, cost and duration. The Shots tab shows a preview frame of every shot before the render; in vector mode a shot's frame appears as soon as all of its props are drawn.
5. **Watch and download** the video and its `.srt` subtitle file, and read its review. Subtitles are always written as an `.srt` next to the video; burning them in is a per-episode switch (changing it re-renders only, at no cost).
 The publishing package gives a YouTube title, a description with chapters, tags (each with a copy button) and a downloadable 1280×720 thumbnail. A horizontal episode also gets a vertical Short: the package picks its best 20–60 seconds and they are re-rendered locally as 9:16.

On-screen text follows one layout: place, date and event lines sit in a fixed info card at the top-left, and name tags stay next to their person, all in one typeface and one plate style.

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
