# Measured reference direction

Reference images can now be measured locally before choosing whether to ask the style analyst for a recipe. This is an independent implementation built around this application's existing immutable custom styles and Remotion pipeline. It does not import another project's source, templates or prompts.

In the custom style editor, upload PNG, JPEG or WebP and choose **Measure colors · free**. Measurements make no model or media-provider call. They show dominant colors and their approximate pixel shares, light/dark area and a tone span. **Apply measured palette to draft** is explicit: measurement does not silently replace edited colors or other direction. A free measurement without a draft opens the existing Paper Poster starter; those craft rules are a starting point, not inferred findings. Fewer than three detected colors cannot replace a recipe's required three-color palette; add intentional colors manually.

The existing **Extract style with Claude** path remains optional and billed as before. Its response includes the separately measured pixel profile; model-written descriptions remain distinct from measurements. Saving recomputes authoritative metadata from the stored reference, ignoring client-supplied measurements. Existing saved records remain immutable and readable without the optional profile.

## Method and limits

Uploads retain the existing strict MIME/base64 validation, 4 MiB upload bound, 16 million decoded-pixel limit, metadata removal and normalized JPEG. Samples fit inside 192 × 192 pixels, flattened against white and converted to sRGB. A deterministic 5-bit histogram selects up to six peaks separated by 0.08 OKLab distance, then assigns bins to their nearest peak. There is no random clustering or generated replacement color. JPEG compression, transparency flattening and downsampling affect the estimates; percentages describe the normalized reference.

Color distance uses the standard [OKLab conversion equations](https://bottosson.github.io/posts/oklab/). Tone measurements use OKLab lightness: dark pixels are below 0.3, light pixels above 0.8, and tone span is the 90th minus 10th percentile. Edge density counts adjacent sampled pixels differing by more than 0.12 lightness. These are descriptive image statistics, not WCAG contrast ratios, typography assessment or aesthetic scores.

Successful measurements are versioned and cached by SHA-256. Saved recipes remain content-addressed by recipe and reference key. Runtime agents remain tool-free and receive no new tool schemas, skill loading or external renderer access.

## Actual render comparison

A successful main render freezes its active reference profile and shot sample times. The pipeline then decodes the actual MP4 with FFmpeg, at the midpoint of up to 12 evenly selected non-archive shots. Later style/timeline edits do not replace that frozen reference or sampling plan. Archive photos are excluded because their intentional photographic colors need not match an illustration palette. Old renders without a frozen reference require a new render before this comparison is available.

Each frame is compared for symmetric weighted nearest-palette distance, approximate palette-share change, median lightness, tone span and edge density. Advisory flags use initial heuristic thresholds: palette distance > 0.12 or share change > 0.25; median lightness delta > 0.18; tone-span delta > 0.22; edge-density delta > 0.20. Palette shares match nearest distinct colors within 0.08 OKLab distance. Spatial layout, identities, narration, motion, text readability and factual correctness are not assessed. Different subject composition can legitimately trigger a flag.

Per-frame decode failures produce an incomplete result and retain their errors. Zero comparable frames never produce a completed comparison. Missing/changing MP4 files produce failure. Each decode has a 20-second timeout and 2 MiB output bound. Full immutable reports contain reference identity, actual source file size/time, frame profiles, deltas and failures; the polling payload contains only bounded summaries. No automatic rejection, regeneration or paid calls follow a flag.

Studio displays the frozen reference palette, counts, exclusions and review suggestions with video seek buttons and a JSON report download. **Compare again** remeasures the existing export. CLI equivalent:

```sh
pnpm ys episode compare-style EPISODE_ID
```

The original deterministic end-to-end fixture creates a real four-second MP4, measures its decoded frame and asserts zero generation/model ledger entries:

```sh
pnpm exec tsx scripts/preview-reference-style.ts
```

Artifacts live under `out/reference-style-workflow/` and are development verification evidence, not an episode delivery or a general visual-quality certification.
