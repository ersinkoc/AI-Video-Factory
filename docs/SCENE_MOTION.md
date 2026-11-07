# Scene motion and rendering engines

## Implemented in the episode renderer

The vector director now plans motion across most shots, targeting at least two thirds of shots with meaningful animation. This is a creative instruction, not a guaranteed quota. The plan should use character action, camera movement, kinetic text, procedural 3D and effects according to the narration. Quiet beats can remain restrained. Existing style packs and old timelines remain supported.

`VectorShot.three` accepts at most two procedural Three.js illustrations:

| Preset | Visual |
| --- | --- |
| `atom` | Schematic nucleus and orbiting electrons |
| `solar_system` | Stylised sun, planets and orbital paths; not to scale |
| `network` | Connected nodes with pulsing activity |
| `crystal` | Lit faceted object with an orbital accent |
| `orbital_rings` | Independently rotating gyroscope rings |
| `wave_grid` | Oscillating surface of 225 instanced spheres |

Each item has stage-space `x`, `y`, `size`, `color`, `accent`, `speed`, `wireframe` and a `camera` (`static`, `orbit`, `push_in`). Stage coordinates are always 1920 × 1080. Illustrations share the scene camera and appear behind character/prop layers. They are schematic visuals; geography still uses the existing factual map/globe pipeline, numerical data the math board.

`VectorShot.effects` accepts at most three screen-space accents:

| Engine | Kinds |
| --- | --- |
| PixiJS | `sparks`, `fireflies`, `bubbles`, `starfield`, `speed_lines`, `energy_rings` |
| CSS compositing | `light_sweep`, `scanlines`, `letterbox`, `vignette` |

Effects expose `intensity`, `color` and `speed`. Both arrays use `start`/`end` as fractions of the shot, with soft fades and local time. Effects appear below callouts, text and captions. Existing rain, snow, fog, dust, embers, flicker, rays and confetti remain available through ambience.

```json
{
  "three": [{ "preset": "network", "x": 960, "y": 510, "size": 650, "camera": "push_in" }],
  "effects": [{ "kind": "energy_rings", "start": 0.25, "end": 0.8, "intensity": 0.35, "color": "#70d6ff" }]
}
```

All rendering uses absolute frame time. Neither engine advances a wall-clock ticker. Models reuse geometry/materials, the wave grid uses instancing, and GPU resources are disposed on unmount. A failed required 3D illustration stops the render with an explicit error rather than silently removing the narrated subject.

## Local visual fixtures

```powershell
pnpm.cmd motion:preview
pnpm.cmd motion:preview out/scene-motion-portrait --portrait
```

These commands write a timeline and opening/midpoint/ending JPEGs for all six presets to the requested output directory. No AI generation or paid media calls are involved. Output is ignored by Git. Unit tests cover invalid plans, layer budgets, deterministic particles, backwards seeking, camera paths and disposal.

## HyperFrames: verified editable preview

### Skill use in this repository

`AGENTS.md` routes coding/authoring tasks to the installed HyperFrames skills. `CLAUDE.md` links to the same workflow, so Codex and Claude work from one project policy. Skills are selected by task: registry discovery before building a named visual; CLI for inspection and rendering; migration for native/hosted/media reuse; media-use for assets and treatments. Read the relevant references progressively rather than injecting every skill into every request.

The production directors and visual reviewers receive a separate compact policy from `packages/agents/src/motion-design.ts`. It adapts the installed `hyperframes/references/motion.md`, `hyperframes/references/types/3d.md` and review guidance to the application's existing schemas:

- A clear hero, narrated action and motivated reveal/camera move.
- Landed titles, readable holds, safe-area composition and effects subordinate to the subject.
- Varied treatments without forced motion in quiet emotional beats.
- Chosen styles/palettes preserved, real data distinguished from illustrative 3D.
- Still-image reviews limited to visible evidence, without invented animation/timing failures.
- Only executable fields and values; no fabricated external jobs, assets or registry searches.

These are project-owned prompt instructions, not dynamically loaded user skills. `runStructured` continues to isolate plugins, settings and skills and supplies no tools. That is deliberate: installing a skill for the coding agent does not make the background production agents capable of running its CLI. Prompt-wiring tests verify both directors and both reviewers receive the relevant policy while tools/skills stay disabled. No additional model call, local skill-file dependency or external command is introduced into an episode run.

The policy transfers motion-design craft into existing production now. Registry-backed automatic authoring remains a separate pipeline capability; the developer fixture below demonstrates the actual runtime bridge.

### Reproduce the editable preview

The installed `hyperframes`, `hyperframes-cli`, `hyperframes-registry` and `remotion-to-hyperframes` skills are available. CLI 0.9.15 was exercised locally. Its catalog reported 448 items on 2026-11-05. The integration fixture uses the same `createScene3D` implementation as Remotion through HyperFrames' `hf-seek` protocol, then plays the catalog's GPU `code-particle-assemble` block. No episode engine migration is required.

Create a dedicated disposable project from the repository root:

```powershell
npx.cmd --yes hyperframes@0.9.15 init out/hyperframes-motion --skip-skills --non-interactive --skill=hyperframes
Push-Location out/hyperframes-motion
npx.cmd --yes hyperframes@0.9.15 add code-particle-assemble --json
Pop-Location
pnpm.cmd motion:hyperframes:export
Push-Location out/hyperframes-motion
npx.cmd --yes hyperframes@0.9.15 check --snapshots --json
npx.cmd --yes hyperframes@0.9.15 preview --background
Pop-Location
```

The exporter replaces this dedicated demo's compositions. Keep hand-edited production projects elsewhere. It copies the installed Three.js/GSAP browser builds into local assets and adapts the catalog block to share that Three.js engine, avoiding duplicate engine instances. Node's type-stripping API exports the shared model without introducing a bundler dependency. Preserve asset licence headers when distributing an exported project.

The 3D model is **hosted**: timing, position and exposed code can be revised, but it is not a collection of native HTML meshes. The titles are native HTML/GSAP. The catalog block remains editable source. This is a verified integration fixture, not an automatic HyperFrames job in the episode pipeline or a frame-equivalent conversion of a finished video. A delivery MP4 and full Remotion/HyperFrames comparison are separate validation steps.

For actual production scenes, search the registry by narrative intent before hand-building effects. Review keyframes, transitions, phone-size legibility and complete motion; a successful DOM audit alone cannot establish shader quality. Use the existing episode timeline's video clips for rendered external shots once their files are staged in its render public directory. Such imported pixels retain cut/layer timing editability, not internal geometry editability.

## Tesseract: assessed, not installed

[Tesseract 3D](https://mirage.app/tesseract/3d) offers editable geometry, materials, lighting, cameras and model animation through its native runtime. Its [official repository](https://github.com/mirage-hq/Tesseract) distributes CLI builds and skills; the 3D installation reference pinned CLI 0.5.0 at inspection. No local `tsrct` command was found during this change, and no Tesseract binary or skill was installed.

Use it for authored product shots, imported models and native lighting/rendering work. Before adding an automated producer, verify the required build/checksum, inspect `project schema` for `createFxScene3DLayer`, and render a short fixture on the actual host. Keep `.tsrct` and all source dependencies with its rendered assets. [Transparent exports](https://dev.mirage.app/tesseract/features/transparent-3d-exports) use SDR ProRes 4444 MOV or PNG; ordinary MP4 does not preserve alpha. No Tesseract-native render or transparent-media import is claimed by this implementation.

## Validation boundary

- Repository typecheck and full Vitest suite validate the shared code and existing consumers.
- Remotion stills establish real browser/GPU rendering of the new model/particle combinations.
- HyperFrames `check --snapshots` establishes lint, runtime, layout, contrast and sampled motion for the generated project; inspect its saved report for enabled/skipped audits.
- AI director compliance, a complete episode, delivery encoding, Tesseract rendering and automatic external-engine scheduling require their own evidence.
