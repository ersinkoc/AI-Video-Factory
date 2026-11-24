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
- **Shorts from your own footage:** upload videos and photos, pick a length (15–180 s), and AI edits a 9:16 Short with narration or the original speech, captions, on-screen texts, music and sound effects.
- **Motion-graphics films:** from a brief, brand colours and a logo, a film of kinetic type, charts, diagrams, card montages, particle fields and 3D objects cut on the beat to a synthesized score; no people, no drawings, narration optional, 16:9 or 9:16.
- **Shorts from a YouTube video:** a long video of yours is analysed scene by scene into a scene log, cuts and ranked Short candidates; the ones you pick become vertical Shorts.
- **Any model through ACP:** besides Claude, each agent can run on an Agent Client Protocol agent such as Antigravity (`agy`), with its Gemini, Claude or GPT-OSS models, picked per agent on the Models page. A motion-graphics film without narration whose agents all run this way costs nothing.
- **Review throughout production:** script and concept approvals, shot previews and drawing checks. Before the render every frame is checked against a checklist and must score 8/10; scenes below the bar are replanned, and while any stays below, the render waits for your approval. Re-create selected shots with a note, and play an episode in the browser without rendering it.
- **Resumable, cost-aware production:** saved stage progress, generation caching, provider fallback and estimates before paid calls.

What each kind asks for, the steps it goes through and what it delivers are under [Episode types](#episode-types). The episode budget caps paid image, voice and video APIs. Claude agent usage is tracked separately and can exceed that cap. See [Production features](docs/FEATURES.md) for the details.

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

## Episode types

In the Studio, **New episode** has four tabs: **Episode from a topic**, **Short from your footage**, **From YouTube** and **Motion-graphics film**. Each one takes different input and produces something different. The CLI equivalent of each tab follows its description. After `episode new` prints the episode ID, run it with `pnpm ys episode run <id>` and check it with `pnpm ys episode show <id>`.

### Episode from a topic

A narrated, illustrated video on any subject, 16:9 or 9:16.

**You give**
- **Topic:** the only required field.
- **Series:** optional. Picking an existing series copies the settings of its last episode, and its characters come first.
- **Visual mode:**
  - *Vector drawing:* Claude draws the characters, places and objects as SVG, and code animates them. No image or video API.
  - *Living stills + effects:* generated images with camera moves.
  - *Mixed:* stills plus a share of AI video clips.
  - *Fully animated:* an AI clip for every shot.
- **Style:**
  - **Style pack:** *Automatic*, one of the 64 packs, or *Custom*.
  - **Style hint:** optional free text.
  - **Line style:** bold outline, flat with no outline, hand-drawn or ink. Vector mode only.
  - **Characters from the character bank:** a presenter and up to five cast members. Vector mode only.
- **Language and voice:**
  - **Language:** Turkish, English, Spanish, Brazilian Portuguese, German, French, Arabic, Hindi, Japanese or Indonesian.
  - **Narrator voice.**
- **Length:** 1–20 minutes in the form, 3 by default.
- **Cost:**
  - **Quality tier:** economy, standard or premium.
  - **Budget cap:** in dollars, for paid image, voice and video APIs.
- **Switches:**
  - Vertical 9:16.
  - Burned-in subtitles.
  - Frame check.
  - Reality check, which draws real things from online references.
  - Background music and sound effects.
  - A vertical Short from a horizontal episode.
  - Vector mode only:
    - side views while walking;
    - reverse angles of rooms used often;
    - set dressing, which adds pieces of furniture to empty rooms.

**Steps** (✋ marks where production waits for you)
1. A style is picked. Agents research the story and write the script.
2. ✋ **Approve the script.** You can edit the narration before approving.
3. The cast is chosen and the concept is drawn: characters, places and objects. Each drawing passes a quality gate.
4. ✋ **Approve the concept.** You can reject drawings or swap characters.
5. Production runs in order:
   1. narration and word timing;
   2. shot plans;
   3. drawings or keyframes;
   4. clips;
   5. timeline, music and sound effects.
6. A draft frame check scores every shot against a checklist. Scenes below 8/10 are replanned, up to three rounds.
7. ✋ **Approve the preview.** Watch it in the browser without rendering, or re-create chosen shots with a note.
8. Render, publishing package, Short and final review.

**You get**
- the MP4;
- the `.srt` subtitles;
- a 1280×720 thumbnail;
- a `<id>.youtube.txt` package with the title, description, chapters, tags and hashtags;
- from a horizontal episode, a 9:16 `<id>.short.mp4`;
- a review report for every shot.

**Cost**
- Claude agents.
- Narration (TTS).
- An image API in the still, mixed and animated modes.
- A video API in the mixed and animated modes.

Vector mode uses no image or video API. The Studio shows an estimate before you start.

**From the CLI**

```sh
pnpm ys episode new --topic "Ottoman coffeehouse bans" --lang en --minutes 3 --motion vector --budget 5 --manual
```

| Option | Values |
| --- | --- |
| `--motion` | `vector`, `still`, `mixed` or `animated`. Without it the mode is `still`, or `mixed` when `--clips` is above 0. |
| `--clips` | The share of AI clips, 0–1. |
| `--tier` | Default `economy`. |
| `--budget` | Default 10. |
| `--lang` | Default `tr`. |
| `--minutes` | Default 3. |
| `--voice` | The narrator voice. |
| `--style` | The style hint. |
| `--style-pack` | `auto`, `custom` or a pack ID. |
| `--line` | The line style. |
| `--presenter` | A character-bank ID. |
| `--with` | Character-bank IDs, comma-separated. |
| `--series` | The series name. |
| `--vertical` | Make a 9:16 episode. |
| `--no-captions`, `--no-qa`, `--no-realism`, `--no-reverse-views`, `--no-set-dressing` | Turn off the matching switch. |
| `--side-views` | Turn on side views while walking. |
| `--manual` | Stop at every approval. |

Without `--manual` the CLI approves the script and concept by itself. The render still waits while any scene is below the frame-check bar.

### Short from your footage

A vertical Short (1080×1920) edited from your own videos and photos.

**You give**
- **Files:** up to 20 videos and images (mp4, mov, webm, mkv, m4v, jpg, jpeg, png, webp). They upload as you pick them.
- **Brief:** optional.
- **On-screen texts:** up to 8 lines of 60 characters.
- **Length:** 15–180 seconds, 30 by default.
- **Language, voice and budget.**
- **Switches:**
  - *AI narration:* off keeps only the original sound.
  - *Transcribe speech:* the original speech becomes captions and helps the edit.
  - Burned-in subtitles.
  - Background music and sound effects.

**Steps**
1. Each file is scanned: frames from every video, and a word-timed transcript when transcription is on.
2. The editor agent looks at the frames and the transcript, and writes the edit:
   - beats of one to four parts, each with its source range, crop focus, framing and sound;
   - optional narration;
   - your on-screen texts.
3. ✋ **Approve the edit.** On the Script tab you can change:
   - the beat and part order, removing any;
   - in and out points;
   - crop focus and framing;
   - sound, mood and texts.
4. Then:
   1. narration;
   2. timing to the target length;
   3. 9:16 cuts with a framing check that recentres cut-off subjects;
   4. music and sound effects.
5. ✋ **Approve the preview.**
6. Render and publishing package.

**You get**
- the vertical MP4;
- `.srt` subtitles;
- a cover frame from the Short itself;
- the `<id>.youtube.txt` package.

**Cost**
- Claude agents.
- Narration (TTS), only when it is on.
- Speech-to-text, only when transcription is on: ElevenLabs Scribe at about $0.40 per hour, or free with a local whisper.cpp (`YS_WHISPER`, `YS_WHISPER_MODEL`).

**From the CLI**

```sh
pnpm ys episode new --footage trip.mp4 --footage sunrise.jpg --sec 30 --overlay "Best morning ever" --manual
```

- Repeat `--footage` for every file and `--overlay` for every text.
- `--topic` is the brief.
- `--no-narration`, `--no-transcribe`, `--no-captions` and `--no-qa` turn the matching switch off.
- `--budget` defaults to 5.

### From YouTube

An analysis of a long video you own, which you then turn into vertical Shorts. It needs [yt-dlp](https://github.com/yt-dlp/yt-dlp).

**You give**
- **YouTube address:** you confirm that you have the rights to the video.
- **Note:** optional.
- **Candidates:** 1–12, 6 by default.
- **Shortest and longest Short:** 15–180 seconds, 20 and 60 by default.
- **Language and budget:** the language is for the report and the texts.
- **Switches:**
  - *Speech recognition:* used only when the video has no captions.
  - Burned-in captions, background music and sound effects for the Shorts.

Videos up to 90 minutes are accepted (`YS_YOUTUBE_MAX_MIN`).

**Steps**
1. The video is downloaded at up to 1080p and kept in the library, so a second analysis or the Shorts reuse it.
2. The transcript is taken from the video's captions: hand-written ones in the spoken language first. Speech recognition runs only when there are none.
3. Scene cuts and silences are found, and frames are taken from every scene.
4. An analyst agent goes through the video in windows of about six minutes, on contact sheets and the transcript. A curator agent then ranks the Short candidates.
5. Candidate edges are snapped to word boundaries and kept within your length limits.

There are no approvals and no render: the result is a report.

**You get**

The episode's **Analysis** tab shows:
- ranked Short candidates with their hook, a score and links to those moments on YouTube;
- a scene log with energy and quality;
- the parts worth cutting and why.

Pick candidates and press **Make Shorts from the picked**. Each one becomes a "Short from your footage" episode:
- the original speech burned in as captions;
- the hook as an on-screen text;
- its own approval before the render.

**Cost**
- Claude agents for the analyst and the curator.
- Speech-to-text, only when the video has no captions.

**From the CLI**

```sh
pnpm ys episode new --youtube https://www.youtube.com/watch?v=<id> --count 6 --min 20 --max 60
pnpm ys episode run <id>
pnpm ys episode shorts <id> --candidates c1,c3
```

- `episode new --youtube` also takes `--no-transcribe` and `--no-captions`.
- `episode shorts` takes `--review`, to edit each Short in the Studio before it is produced, and `--no-music`.

### Motion-graphics film

A short brand or explainer film with no people and no drawings, made of type, data and shapes moving on the beat.

**You give**
- **Brief:** the film's only source for figures. A chart or card number that is not in the brief carries an "illustrative data" badge.
- **Length:** 10–180 seconds, 30 by default.
- **Aspect:** 16:9 or 9:16.
- **Language and budget.**
- **Brand colours:** up to six hex codes.
- **Logo and screenshots:** up to 12 images.
- **Narration:** off by default. When it is on, pick a voice; captions follow it.
- **Switches:** background music and sound effects.

**What a film is made of**
- **Kinetic type:** slam, rise, word by word, or chapter cards with highlight pills.
- **Data:**
  - bars and lines drawn from zero;
  - counters that count up;
  - notes that point at a value.
- **System diagrams:** connectors draw on and packets travel along them.
- **Cards:** card grids and full-screen montages cut on the beat.
- **Particle fields.**
- **Simple 3D objects**, which can carry your logo.
- **Rhythm:**
  - one tempo, 88–140 BPM, with a rhythm sheet of hook, build, stop, peak and resolve sections;
  - transitions on the beat;
  - a synthesized score and sound effects locked to the picture.

**Steps**
1. A director agent writes the whole film as data in one call. Its code never runs.
2. Code checks the rhythm (a hook in 3 seconds, no long gaps, enough cuts) and the reading time of every text, and sends findings back to the director once.
3. ✋ **Approve the script.** The Script tab shows the rhythm sheet, the scenes and any findings. *Remake with a note* asks the director for a new version.
4. The timing is fitted to the narration when there is one. Then the timeline, score and sound effects are made.
5. Every scene gets a preview frame, and a frame check scores it out of 10. Without narration, scenes below 8/10 go back to the director once. The revision is kept only if the frames improve and the rhythm does not get worse.
6. ✋ **Approve the preview.**
7. Render, publishing package and, from a 16:9 film, a vertical Short.

**You get**
- the MP4, 1920×1080 or 1080×1920;
- a cover frame from the film;
- the `<id>.youtube.txt` package;
- `.srt` subtitles with narration;
- from a 16:9 film, a 9:16 Short.

**Cost**
- One director call and the frame check: Claude, or free through ACP.
- Narration (TTS), only when it is on.

A film without narration whose agents run on an ACP agent such as `agy` costs nothing.

**From the CLI**

```sh
pnpm ys episode new --film --topic "Relay cuts deploys from 40 to 12 minutes" --sec 30 --color "#2563eb" --asset logo.png
pnpm ys episode run <id>
```

- `--vertical` makes a 9:16 film.
- Repeat `--color` and `--asset` as needed.
- `--narration` turns on narration; `--voice` picks the voice.
- `--no-captions` and `--no-qa` turn the matching switch off.
- `--budget` defaults to 5.

### Models

Every agent above can run on Claude or on an ACP agent, chosen per agent on the Studio's **Models** page. The [CLI guide](docs/CLI.md) covers approvals, retries, `--until`/`--from`/`--only` stage runs and character reuse.

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
