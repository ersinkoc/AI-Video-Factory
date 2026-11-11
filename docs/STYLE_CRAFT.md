# Style craft pilots

The existing Remotion renderer supports material-aware direction for three existing packs: paper-cutout, risograph, and isometric, plus the paper-poster preset for custom recipes. All 64 packs remain available. Old timelines without visual.stylePack keep their old rendering behavior.

## Runtime contract

- packages/core/src/style-craft.ts owns material, entrance, timing, typography, continuity and visible acceptance rules. The three canonical style entries link to these contracts.
- The vector director receives only the selected pilot's compact rules. The pipeline supplies the preceding script scene's last available shot as context, including on replanning.
- Timeline assembly persists the pack on vector visuals. Render, lint, review-frame selection and SFX share visualVector preparation. Authored entrances and set dressing are preserved. People retain their fade-in; held objects follow their holder.
- Paper objects slide horizontally into their final positions and receive fixed layer shadows. This is native layer assembly, not folding or arbitrary shape morphing.
- Risograph solid-colour props are separated into SVG colour plates with multiply compositing, overlapping opacity and fixed registration offsets. Complex paints, masks, filters, exact-reference assets and screens keep their original drawing. Characters keep their rig renderer. This is a spot-colour approximation, not a physical ink simulation.
- Isometric objects use existing arc-length-based contour draw-on followed by fills. Projection and occlusion must be correct in the drawing; no SVG-to-3D reconstruction is performed.
- Pilot headings use a pack-specific system font stack, weight and tracking. Text remains a separate crisp layer. Resolved fonts may differ across operating systems.

## Continuity boundary

The planner is instructed to carry a recognizable object between ideas. Automatic carry requires the same background, mood, static camera and layer geometry, no held items or moving handoffs, and no new authored entrance. Only props are carried. Overlay boundaries and non-pilot packs are excluded. Qualifying seams use a short dissolve without repeating the props' build-in. Arbitrary morphs and character-pose handoffs are not implemented. Pilot stages omit decorative camera drift. Code-generated material entrances are marked internally so automatic framing uses the same final composition before and after a carry; authored walks and slides still reserve their movement paths.

## Review evidence

The critic receives pack-specific visible checks using its existing issue schema. One still cannot prove timing, continuity or print-pass correctness. Automated multi-frame critic jobs have not been added. The Paper Poster development sample has been rendered as a silent 8-second, 240-frame 1920x1080 H.264 MP4 and inspected at 10 decoded frames, including both cuts. Its authored static diagram remains established across cuts; this does not expand automatic continuity to moving handoffs. Excluding the changing header, adjacent decoded frames at the two cuts measured 58.34 dB and 56.87 dB PSNR. Repeated backwards seeking to frame 117 produced byte-identical JPEGs. Evidence and the editable timeline are under out/paper-poster/.

## Offline comparison

Run from the repository root:

~~~powershell
pnpm.cmd motion:styles:preview out/style-craft
pnpm.cmd motion:styles:preview out/style-craft --render
pnpm.cmd motion:styles:preview out/style-craft-portrait --portrait
pnpm.cmd motion:styles:preview out/paper-poster --poster-only --render
~~~

The same message-to-server sequence is rendered in the three original materials from editable JSON timelines and procedural SVG assets, without AI or paid media calls. Default output includes sampled JPEGs, scene boundaries and a repeated timestamp after backwards seeking. --render also writes three silent 8-second MP4s using a generated silence track. These are development comparisons, not narrated production episodes. Output is ignored under out/. The existing render lock serializes Chrome work.

The Studio gallery includes the three local 8-second, silent MP4 previews and their posters. Only the selected video is mounted, with playback controls and no autoplay. Other packs retain their still-image samples. Rebuild and install the procedural previews with:

~~~powershell
pnpm.cmd motion:styles:preview out/style-craft --render
pnpm.cmd motion:styles:install out/style-craft
~~~

## Reference-image custom styles

The Custom style workshop also offers a free Paper Poster starter based on the supplied cream/dark/olive/lime brief. It opens an editable local draft without uploading an image or calling a model. Its palette is #F3F0E6, #111410, #68725F and #D5FA73. Save it through the same immutable-profile flow before creating an episode. It selects the native paper-poster preset, with visible checks for flat ink, restrained lime and one hero per idea. This preset omits vignette, mood grading, background colour treatment, lighting gradients and depth-of-field blur; it uses subtle stationary paper texture, direct cuts and condensed shadow-free headings. It is separate from the dimensional paper-cutout preset. Earlier saved recipes remain immutable and may select the new preset explicitly in the editor. Free-form typography and motion guidance remain subject to the selected renderer, and opening a free draft does not make episode generation free.

Select Custom in the new-episode form, upload PNG/JPEG/WebP (up to 4 MiB), and request analysis. This is a separately billed Claude vision call using the configurable fast-role style-analyst model. The editor exposes the resulting palette, illustration, material, motion, typography and review rules before saving. Saving creates an immutable content-addressed profile; editing creates a new version. Episodes and series defaults keep its ID. Existing custom free art direction remains available. Bank cast and saved custom styles cannot be combined.

The server verifies actual image format and decoded pixel limits, removes metadata, limits the reference to 1536 pixels, and stores a normalized JPEG. Analysis is cached by image hash, model and policy version; simultaneous identical requests share one call. Successful and failed billed calls are recorded in the cost ledger. Cached results display zero new charge. Uploaded imagery is treated as visual reference, with embedded instructions excluded by policy.

Production loads the saved recipe instead of calling the art director. Palette and drawing guidance reach asset generation. Both vector and image/clip directors receive custom motion and typography guidance, restricted to the selected output schema. Still-image direction can use camera/ambience and composition; it cannot create independent SVG motion or title layers. Keyframe inspection receives the chosen style, palette and visible custom acceptance rules; the final critic receives the visible review rules. Optional native paper-cutout, risograph and isometric presets select the existing implemented material behavior. Free-form rules do not install fonts, shaders, new animation primitives or an external render engine. A still reference cannot prove motion quality; rendered episode review remains necessary. Runtime agents remain tool-free JSON producers; no external skill or registry execution is implied.

## Research and registry provenance

Design principles were informed by [Smokich's style collection](https://smokich.gosem.dev/stil/), including its [risograph](https://smokich.gosem.dev/stil/stiller-uzun/risograf.txt) and [isometric](https://smokich.gosem.dev/stil/stiller-uzun/izometrik.txt) descriptions. No third-party prompt or executable source was installed in runtime agents.

Before implementation, HyperFrames catalog was searched in English for "paper layers print reveal line drawing". Candidates included paper-collage-reveal, ink-bleed-reveal and stop-motion-cadence. None was imported: page collage, liquid bleeding and stepped-time jitter do not match the native material contracts. Existing native slide/fade/draw-on primitives were reused. No HyperFrames block was added to SceneEffect.kind. For the Paper Poster fixture, a new English word-tier catalog search for "poster" returned no matches; existing native SVG, move/fade and direct-cut primitives were retained.

This fixture is native Remotion with editable SVG/JSON. No hosted HyperFrames project or media-only conversion is introduced. HyperFrames check/snapshot audits do not apply and were not run. Native snapshots, boundary checks and repository checks are reported separately.
