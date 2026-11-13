# Getting started

[Documentation](README.md) · [Project home](../README.md)

## Requirements

- Node.js 24 or newer, and pnpm 11
- FFmpeg (for the local render test and video clips; if `ffmpeg`/`ffprobe` is not on PATH, voice-over durations and loudness use the copy bundled with Remotion)
- Claude: either a signed-in Claude Code installation (subscription) or `ANTHROPIC_API_KEY`
- Optional API keys: fal, Gemini, ElevenLabs. Providers without a key are disabled.
- Optional: Manim 0.22 and LaTeX for formula and graph boards (see [Manim boards](#manim-boards-optional)); without them shots simply have no board.

## Install and check

```bash
git clone https://github.com/ersinkoc/AI-Video-Factory.git
cd AI-Video-Factory
pnpm install
cp .env.example .env          # fill in the keys you have; empty providers are disabled
pnpm ys providers             # which providers are active?
pnpm ys render-demo           # no API calls: local Remotion render test
```

In PowerShell, use `Copy-Item .env.example .env` for the copy step. Edit the new `.env` with your credentials
before checking providers. `pnpm ys doctor` checks local tools without generation or paid calls.

The demo pauses for preview approval before encoding. Follow the [local render demo](CLI.md#local-render-demo)
steps to complete it, or the isolated [CI recipe](CI.md#run-the-same-gates-locally) to keep its files separate.

### Optional Docker services

It runs without Docker. Assets go to `.data/assets`, the cost ledger to `.data/ledger.jsonl` and videos to
`.data/episodes`. To use Postgres 18, Redis 8 and RustFS (S3) instead (Docker required):

```bash
pnpm infra:up                 # ports: 5433 (pg), 6380 (redis), 9000/9001 (rustfs)
pnpm db:migrate
pnpm test:integration
# .env: STORE=s3, LEDGER=db
```

## Manim boards (optional)

In vector episodes the director can put a formula or a real data graph on a board in the middle of a shot. The
code turns that recipe into a Manim scene and renders it locally into a transparent clip (no API, no
model-written code; LaTeX is limited to math commands). Setup in PowerShell on Windows:

```powershell
python -m venv .data/tools/manim-venv
.data/tools/manim-venv/Scripts/python -m pip install manim==0.22.1
winget install --id MiKTeX.MiKTeX --scope user
# Let MiKTeX fetch missing LaTeX packages on its own:
& "$env:LOCALAPPDATA/Programs/MiKTeX/miktex/bin/x64/initexmf.exe" --set-config-value='[MPM]AutoInstall=1'
```

Other locations: `YS_MANIM` (path to the `manim` executable) and `YS_LATEX_BIN` (LaTeX bin folder). Boards are
cached under `library/math`.

## Start the Studio

```sh
pnpm studio
```

Open <http://localhost:3100>. For smooth episode playback, use the production build:

```sh
pnpm studio:build
pnpm studio:start
```

Continue with the [Studio guide](STUDIO.md) or the [CLI guide](CLI.md). Run `pnpm ys doctor` to diagnose local
tools without generating media or making paid calls; see [Environment diagnostics](DOCTOR.md).

## Configuration

Keys and switches live in `.env` (see [`.env.example`](../.env.example)). Notable ones:

| Variable | Purpose |
|---|---|
| `FAL_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` | Media providers. If a key is empty, that provider is disabled. |
| `ANTHROPIC_API_KEY` | Claude agents. If empty, the Claude Code login is used. |
| `YS_MODEL_CREATIVE` / `_FAST` / `_CHEAP` | Default model for each tier. Per-agent choices on the Models page override these. |
| `STORE=s3`, `LEDGER=db` | Use S3 and Postgres instead of local files. |
| `GEMINI_OMNI_VIDEO=1` | Enable Gemini Omni Flash video (the Veo replacement; not yet verified with a real run). |
| `YS_UPDATE_CHECK=0` | Turn off the Studio's update check. |
| `YS_RENDER_GL` | Chrome drawing backend for renders. Default `angle` (graphics card; about 40% faster, and needed for 3D figures). `swangle` is software GL for machines without a GPU. A GPU render that crashes is retried once with software GL. |
| `YS_BROWSER_EXECUTABLE` | Path to a Chrome or Chrome for Testing binary that renders, stills and thumbnails use instead of the Chromium Remotion downloads. Empty uses Remotion's own. Needed where that Chromium hangs at start, as on macOS 26.5 (`browser has disconnected` / `Target closed`); the render error points to this variable then. |

## Versions and updates

The version lives in the root `package.json`. The Studio header shows it, and so does `pnpm ys version`.

The Studio checks the latest GitHub release every 6 hours. If a newer version exists, a banner with the
release notes appears. To update:

```bash
git pull && pnpm install && pnpm studio:build   # then restart pnpm studio:start
```

For maintainer releases, see [Release ownership and recovery](RELEASE.md).
