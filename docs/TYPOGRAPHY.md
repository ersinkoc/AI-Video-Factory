# Episode typography

New Turkish and English timelines select a deterministic heading/body pair from the episode's existing style identity. The system uses project-owned selection, readiness and glyph-inspection code. Font files are pinned Fontsource dependencies, staged into the render's local public directory; rendering does not query a font service or rely on an installed desktop font.

| Pair | Heading (700) | Body and captions (600) | Typical styles |
| --- | --- | --- | --- |
| Clear | IBM Plex Sans | IBM Plex Sans | General explainers and unknown styles |
| Editorial | Source Serif 4 | IBM Plex Sans | Documentary, engraving, manuscript, archive |
| Warm | Bitter | Nunito Sans | Paper cutout, storybook, children, watercolor |
| Poster | Oswald | IBM Plex Sans | Paper poster, risograph, comics, constructivist |
| Technical | IBM Plex Mono | IBM Plex Sans | Blueprint, isometric, chalkboard, sci-fi |

The existing style catalog is preserved. A custom style's explicit craft preset takes precedence over its pack name. The mapping lives in `packages/core/src/typography.ts` and is not an instruction for a tool-free agent to search for or download fonts.

## Assets and readiness

Each role uses two local WOFF1 faces, with unique aliases for Latin Extended and Latin. They come from the same family and weight, so missing glyphs in one subset resolve in its matching companion rather than a different operating-system face.

Before episode, still or thumbnail rendering, `stageTypography` reads the actual files and inspects their Unicode `cmap` tables (formats 4 and 12, with bounded WOFF decompression). Both roles must cover the Latin alphabet, digits and `ÇĞİÖŞÜçğıöşü`. A malformed file or missing required glyph stops rendering. This establishes Turkish/Latin coverage; it does not establish coverage for every writing system or emoji.

The browser then loads all selected `FontFace` objects through Remotion's readiness protocol. A selected font that cannot load cancels rendering. `document.fonts.check()` alone is not used as glyph-coverage evidence because it can succeed through fallback.

Heading/number layers, other vector text layers, episode captions and thumbnail headings use the selected roles. Font binaries and pair identity enter the picture-cache key. Embedded text inside generated SVG art, maps, speech bubbles, screen graphics and other specialized labels retain their existing typography; they are not covered by this rollout.

## Compatibility and Studio

`Timeline.typography` is optional. Timelines without it retain their original font-family stacks and style-craft weights. Languages outside Turkish and English keep the existing behavior. A rebuilt timeline gets the new selection; rendering a saved old timeline does not silently migrate it. Shorts derived from a selected timeline inherit its pair.

The successful main render records its selected pair in `state.render.typography`. Studio's episode facts display the effective heading/body families only when the rendered export used the new system.

## Native, editable specimens

```powershell
pnpm.cmd typography:preview
pnpm.cmd typography:preview out/typography-portrait --portrait --pair=poster
```

The fixture writes editable native Remotion timeline JSON, scene JPEGs, thumbnail JPEGs and a specimen index. It uses Turkish text, including dotted/dotless I, cedillas, umlauts and breve marks. No model or paid media call is needed. Review both the scene and thumbnail at the intended display size; glyph coverage and successful loading do not prove readability for every future title or layout.

The installed HyperFrames and media-use runbooks informed local font packaging and readable title holds. This implementation uses the existing Remotion renderer and does not create or verify a HyperFrames project.

Font packaging reference: [Fontsource installation](https://fontsource.org/docs/getting-started/install). Binary container reference: [W3C WOFF 1.0](https://www.w3.org/TR/WOFF/).
