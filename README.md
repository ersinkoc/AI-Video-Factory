# AI Video Factory

**English** · [Türkçe](README-TR.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/ersinkoc/AI-Video-Factory)](https://github.com/ersinkoc/AI-Video-Factory/releases)

![AI Video Factory 0.6.0 — 64 styles, one video factory.](docs/assets/ai-video-factory-0.6.0-styles.png)

Turn a topic into a narrated, animated YouTube video. Claude agents write the story and script, plan shots, design vector art and review the result. Media providers supply voice, images and clips; Remotion renders the final cut. The same factory cuts vertical Shorts from your own footage or a YouTube video and makes motion-graphics films from a brief. The web Studio keeps the process visible and puts approvals in your hands.

[Documentation](docs/README.md) · [Getting started](docs/GETTING_STARTED.md) · [Studio guide](docs/STUDIO.md) · [CLI guide](docs/CLI.md) · [Changelog](CHANGELOG.md)

## What you can make

- **Four visual modes:** rigged vector animation, moving stills, a mix of stills and AI clips, or fully generated clips.
- **64 style packs:** consistent palettes, drawing rules and textures, with reusable characters, presenters and series settings.
- **Narrated videos in multiple languages:** synchronized captions, lip sync, music and sound effects. The Studio supports English and Turkish.
- **A publishing package:** video, `.srt` subtitles, title, description, chapters, tags, thumbnail and a vertical Short from horizontal episodes.
- **Shorts from your own footage:** upload your videos and images, pick a length (15–180 s), and AI picks the best moments, frames them for 9:16, adds a voice-over or keeps the original speech, and burns in captions, on-screen texts, music and sound effects.
- **Motion-graphics films:** no people and no drawings. A director agent writes a rhythm sheet and scenes of kinetic type, charts and counters, system diagrams, card grids and montages, particle fields and simple 3D objects; code draws them on the beat with a matching synthesized score and sound effects. You give a brief, optional brand colours and a logo or screenshots; 16:9 or 9:16, narration optional. Every scene gets a preview frame before the render, and a frame check looks for cut, overlapping or unreadable text and missing elements; without narration, scenes below 8/10 go back to the director once. Figures that are not in your brief carry an "illustrative data" badge. Remake the film with a note, and get a cover frame, a publishing package and, from a 16:9 film, a vertical Short.
- **Shorts from a YouTube video:** paste the address of a video you own; it is downloaded and gone through scene by scene, and you get a scene log, what to cut, and ranked Short candidates. The ones you pick become vertical Shorts with the original speech as captions.
- **Any model through ACP:** besides Claude, each agent can run on an Agent Client Protocol agent such as Antigravity (`agy`), with its Gemini, Claude or GPT-OSS models, picked per agent on the Models page. A motion-graphics film without narration whose agents all run this way costs nothing.
- **Review throughout production:** script and concept approvals, shot previews and drawing checks. Before the render every frame is checked against a checklist and must score 8/10; scenes below the bar are replanned, and while any stays below, the render waits for your approval. Re-create selected shots with a note, and play an episode in the browser without rendering it.
- **Resumable, cost-aware production:** saved stage progress, generation caching, provider fallback and estimates before paid calls.

The episode budget caps paid image, voice and video APIs. Claude agent usage is tracked separately and can exceed that cap. See [Production features](docs/FEATURES.md) for the details.

## Quick start

You need **Node.js 24+**, **pnpm 11**, **FFmpeg**, and either a signed-in Claude Code installation or an `ANTHROPIC_API_KEY`. Add media-provider keys for the voice, image and video services you want to use. Docker is optional.

```sh
git clone https://github.com/ersinkoc/AI-Video-Factory.git
cd AI-Video-Factory
pnpm install
cp .env.example .env
```

In PowerShell, use `Copy-Item .env.example .env` for the last step. Fill in your keys in `.env`; providers with empty keys are disabled. Then start the Studio:

```sh
pnpm studio
```

Open **<http://localhost:3100>**, create an episode and review its script and concept before production. For smooth in-browser episode playback, use `pnpm studio:build` followed by `pnpm studio:start`.

To inspect your setup or try a local render without paid API calls:

```sh
pnpm ys doctor
pnpm ys render-demo
```

The demo pauses for preview approval; follow the [demo steps](docs/CLI.md#local-render-demo) to finish rendering.

Assets, the cost ledger and episodes are stored under `.data` by default. The Studio has no login and binds to `127.0.0.1`; keep network access limited to people you trust. See [Getting started](docs/GETTING_STARTED.md) for configuration and [Studio access](docs/STUDIO.md#start-and-access) for network setup.

## Make an episode from the CLI

```sh
pnpm ys episode new --topic "Ottoman coffeehouse bans" --lang en --minutes 3 --motion vector --budget 5 --manual
```

Use the returned episode ID:

```sh
pnpm ys episode run <id>
pnpm ys episode show <id>
```

`--manual` stops at approval gates. Generation uses your configured Claude account and media providers. The [CLI guide](docs/CLI.md) covers approvals, options, retries and character reuse.

To cut a vertical Short from your own videos and images instead:

```sh
pnpm ys episode new --footage trip.mp4 --footage sunrise.jpg --sec 30 --overlay "Best morning ever" --manual
```

Or make a motion-graphics film from a brief (no narration means no paid API; add `--vertical` for 9:16):

```sh
pnpm ys episode new --film --topic "Relay cuts deploys from 40 to 12 minutes" --sec 30 --color "#2563eb" --asset logo.png
pnpm ys episode run <id>
```

Or have a long YouTube video of yours analysed for Shorts (needs [yt-dlp](https://github.com/yt-dlp/yt-dlp)):

```sh
pnpm ys episode new --youtube https://www.youtube.com/watch?v=<id> --count 6 --min 20 --max 60
pnpm ys episode run <id>
pnpm ys episode shorts <id> --candidates c1,c3
```

## Documentation

| I want to… | Guide |
| --- | --- |
| Install, configure or update | [Getting started](docs/GETTING_STARTED.md) |
| Create and revise episodes in the browser | [Studio](docs/STUDIO.md) |
| Run production from the terminal | [CLI](docs/CLI.md) |
| Explore styles, animation and production behavior | [Production features](docs/FEATURES.md) |
| Find editing, source and quality-review tools | [Documentation index](docs/README.md) |
| Work on the codebase or releases | [Development](docs/DEVELOPMENT.md) |

Architecture decisions and planned work are in the [project plan](docs/PROJE_PLANI.md) (Turkish). Release history is in the [changelog](CHANGELOG.md).

## Sponsor

[**WrongStack**](https://wrongstack.com) — an open-source AI coding agent with persistent project memory. [Website](https://wrongstack.com) · [GitHub](https://github.com/WrongStack/WrongStack)

## License

[MIT](LICENSE) © 2026 Ersin KOÇ. Third-party components, generated media and reference assets retain their own terms; see the [Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md), your media providers' terms and each asset's source license.
