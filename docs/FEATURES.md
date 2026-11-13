# Production features

[Documentation](README.md) · [Project home](../README.md)

<p align="center">
  <img src="assets/ai-video-factory-0.6.0-review.png" width="640" alt="AI Video Factory 0.6.0 artwork illustrating video production and frame-by-frame review.">
</p>

Detailed behavior of the episode pipeline. Start with [Getting started](GETTING_STARTED.md) to install the
project or the [Studio guide](STUDIO.md) to make an episode.

## Topic to finished video

The pipeline runs these stages: style → story → script → *approval* → cast → concept → *approval* → voice →
shots → keyframes → clips → timeline → render → package → short → review. Every stage is idempotent and saves
after each sub-step, so a failed run resumes where it stopped.

## Four motion modes

- `vector`: Claude-drawn SVG characters on a rig, animated in code. This is the cheapest mode.
- `still`: images with Ken Burns motion.
- `mixed`: some shots become AI video clips.
- `animated`: every shot becomes an AI video clip.

## Quality gate

No SVG is used without a check:

1. Before drawing, a planner agent studies reference images and turns the description into a concrete drawing plan.
2. A blind reviewer says what the drawing shows without being told its name. Places are drawn like a stage seen from the audience: a road, railway or river runs across the frame, never toward the horizon, because vehicles are drawn side-on.
3. A gate agent scores how recognisable it is and how faithful it is to the references; for a character, also whether its arms, hands and legs will look natural when they move (no tube-like forearms, mitten hands or stains on the limbs).
4. Drawings that fail are redrawn with the list of defects. If they still fail, they are not used. A key prop that appears in several shots gets one more try from a simpler, iconic brief; if that fails too, the scenes that used it are replanned without it instead of showing an empty room.

## Grounded in reality

Real subjects are drawn from reference images found on Wikipedia and Wikimedia Commons. For a real person, the
photos are first measured once: face shape, brows, eyes, nose, hair and hairline, facial hair, glasses and
build go on a likeness sheet (what differs from average, with colours as hex); the illustrator draws to it and
the quality gate checks for it. The analysis never names the person or infers anything beyond form and colour,
and a person who may be a minor is skipped.

For objects, a ready-made public-domain/CC0 vector drawing from Commons is tried first; it is used only if it
passes the same quality gate, and it is scaled to its real size like a drawn one (some files have no viewBox
and used to show at their file's pixel size: a giant book over a person, a laptop that vanished).

Claude does not draw maps or flags: they are generated from real data (world-atlas, flag-icons). A map of a
historical event shows that year's borders, from the Cliopatria dataset (Seshat Global History Databank, CC BY
4.0, downloaded once on first use), never today's countries; the credit line is added to the publishing
description automatically.

## The human has the final say

In the Studio you can accept a drawing the gate rejected, or reject one it passed and add a note for the
designer. You can also turn the reality check off for one episode.

## 64 ready-made style packs

Examples include flat explainer, Ottoman miniature, film noir, blueprint, ukiyo-e, synthwave, chalkboard,
watercolour, 8-bit pixel, risograph, stained glass, isometric diorama, Byzantine mosaic, Egyptian wall
painting, Greek black-figure, Anatolian kilim, ink wash, manga screentone, technical cutaway and whiteboard
doodle, plus four 3D-look packs (soft 3D, claymation, vinyl toy, low-poly): in vector mode their characters
are real 3D figures built in code with three.js (matte, clay, glossy or faceted surface; a cheap agent reads
the approved drawing and picks skin, hair, beard, glasses, clothes and build), they keep every puppet pose,
gesture and talking mouth, and they turn to profile while walking; rendering stays free. The concept step, the
character bank and the style gallery show the figure itself (a preview rendered locally), marked 3D. Rooms and
objects in those packs get their volume from SVG gradients, highlights and contact shadows. In image/video
modes the packs ask for real 3D renders.

In *Automatic* mode a cheap agent picks the pack that fits the topic; you can also choose one yourself, or
choose *Custom* to let the art director design freely. A pack fixes the colours, drawing rules and line style,
so all episodes in a pack look as if the same hand made them. Run `pnpm ys styles` to list them.

The new-episode form shows a gallery with the same character and room drawn in each pack; click one to choose
it. The samples come from episodes already drawn in that pack, and `pnpm ys styles samples [pack...]` draws
the missing ones with the real designer and quality gate (Claude, about $0.2–0.3 per pack). Each sample
character also joins the character bank as a presenter in that style.

Packs also carry a texture that the renderer lays over every vector scene in code (paper, watercolour, chalk,
halftone, engraving hatching, film grain, scanlines), so they differ by more than colour. In the watercolour
packs characters and objects are painted on an opaque paper base, as on a real sheet: the washes stay
translucent over each other, but the room never shows through a person or a desk.

## Vector animation

Rigged characters, narration-driven gestures, lip sync, staging, camera framing and pre-render checks are
described in [Vector animation](VECTOR_ANIMATION.md).

## A vertical Short from every episode

The publishing agent picks the strongest 20–60 seconds of consecutive scenes; code re-renders them as 9:16 at
no API cost, with music and effects regenerated for the clip. In vertical frames the stage shrinks per shot
when needed so characters at the edges are not cut.

## Music and sound without API costs

Background music is synthesized in code: its sections follow the mood the director gives each shot (bright,
warm, cool, night, dramatic), all in one key with crossfades, and it ducks under the narration word by word.
In vector mode, animations also get frame-locked sound effects. Both are per-episode switches.

## Scene transitions and build-in

Within a scene shots dissolve quickly; at a scene change the next scene comes in with a wipe, a slide, an iris
or a zoom (never the same twice in a row) with motion blur while it moves fast, as a camera shutter would draw
it (the sliding frame smears sideways, the edge of a wipe or iris goes soft, a zoom blurs slightly; about a
second of render time per scene change; objects that slide, pop or shake into place smear the same way, people
do not), and its first shot builds up piece by piece: the room first, then the furniture and objects, then the
people. Objects and texts pop, slide or fade in briskly (under a second) at the moment the director chose, so
nothing hangs half transparent or keeps growing for seconds.

## Clean on-screen text and optional subtitles

Place, date and event lines sit in one info card at the top-left; name tags stay next to their person.
Subtitles are always written as an `.srt` next to the video, and burning them in is a per-episode switch.

## Character bank

Keep topic-independent characters (a presenter, a scientist, a child…) and use them as the on-screen
presenter, add them to a cast, or make them a series mascot. They are never redrawn.

## Character reuse

Approved characters are kept in a library together with their identity. When the same person appears again in
the same style (for example a real historical figure or the channel's host), the casting agent reuses the
drawing instead of redrawing it. In the Studio you can also pick one with *Use from library*. Run `pnpm ys
library` to list them.

## Series

Episodes can belong to a series. The home page filters by series. A new episode in an existing series inherits
that series' settings and style pack, and the series' own characters are offered first for reuse. Use
`--series "Name"` in the CLI.

## Learning loop

After each render the frames are reviewed against the episode's own art style and palette (a sepia or
monochrome style is not a defect), each taken at a moment when the shot's planned gestures are fully raised
(not still rising or already falling) and its texts have opened, and lessons are written to a rule book that
later episodes follow; a lesson never overrides a style's palette.

Before the render a draft review does the same on preview frames, against a checklist: for every frame the
critic answers each check (shows what is narrated, the frame has content, nobody cut off or floating, no
backdrop box, texts clear of each other and of the subtitles and readable, scale, clutter, repetition, the
narrated action, anatomy judged against the art style, anything else broken), first writing what it saw in that frame, and the code scores the frame
(10, minus 3 for each major and 1 for each minor failure). An answer without real evidence is rejected and the
frame asked again. A scene passes only when every frame was checked and scored 8 or more.

Every scene below that is re-planned by the director looking at its draft frames and findings, and reviewed
again; a re-plan that leaves a larger share of failing frames, or the same share with a lower average, is
undone and the director is told what failed. Scenes still below 8 get up to three rounds. If a scene still
falls short, or its frames could not be reviewed, the render waits for your explicit approval, even in an
episode approved automatically: the Shots tab lists those scenes, and each frame's details show the checklist
with its evidence.

The final review completes only when every shot has been reviewed. Frames the critic left out or whose batch
failed are reviewed once more; missing frames, omitted critic results or failed batches leave it pending with
the reviewed/total count (or the failure reason when no batch succeeds); any previous review is preserved and
the stage can be retried.

## Many media models, one router

Paid calls go through one gateway that ranks providers by quality and price for the episode's budget tier,
caches by content hash and falls back when a provider fails. Available today: fal (FLUX, Kontext, Seedream
4.5, Kling 3 / 2.6, MiniMax H3 Max Turbo, PixVerse V6, Vidu Q3 Turbo, Seedance 2), Gemini (Nano Banana image
models, TTS, Omni Flash video as an opt-in), ElevenLabs (voice, sound effects, music) and a local ComfyUI. Run
`pnpm ys plan` to see the ranking without spending money.

## Cost first

Estimates are shown before any money is spent. Requests are cached by content hash, so the same request is
never paid twice. A per-episode budget cap applies to paid image, voice and video APIs. Claude agent calls are
shown separately and do not count toward the cap.

## Choose a model per agent

The Studio **Models** page sets which Claude model each agent uses (for example Sonnet instead of Haiku for
the quality gate).

## Bilingual Studio

The Studio is in Turkish and English. Videos can be in any language the voice provider supports. Foreign names
and terms are read the way speakers of the narration language say them: before the voice-over, a built-in list
and a cheap agent turn them into respellings for the voice (a Turkish narration says "C++" as "si pılas
pılas", not "ce artı artı"), while the captions keep the original spelling and the lips follow the spoken
form.

In Turkish, numbers are written with digits and read by rule: "II. Mehmed" → "ikinci Mehmed", "1,5 milyon" →
"bir buçuk milyon", "%75" → "yüzde yetmiş beş", "3/4" → "dörtte üç", "$1 milyarlık" → "bir milyar dolarlık",
"1452–1481" → "… ile …", "vb." → "ve benzeri".

Abbreviations a narrator reads out in full are expanded with the suffix rebuilt by Turkish grammar: "TBMM'nin"
→ "Türkiye Büyük Millet Meclisi'nin", "ABD'ye" → "Amerika Birleşik Devletleri'ne", "BM'ye" → "Birleşmiş
Milletler'e". Acronyms said as a word stay a word and are never expanded or spelled out: "COBOL" → "kobol",
"NATO" → "nato".
