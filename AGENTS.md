# AI Video Factory agent workflow

Read `CLAUDE.md` for repository conventions and `docs/PROJE_PLANI.md` before changing architecture. Preserve unrelated working-tree changes. Project documentation and agent instructions are English; narration follows the episode language.

## Scene planning, animation and effects

Use the installed HyperFrames skills as production runbooks whenever authoring or improving video scenes. Read only the relevant references rather than loading the entire skill catalog:

| Task | Skills |
| --- | --- |
| Plan or author a HyperFrames scene | `hyperframes`, then its motion/type references |
| Select a transition, title, effect, chart, camera move or 3D block | `hyperframes-registry` before hand-building |
| Scaffold, inspect, preview, check or render | `hyperframes-cli` |
| Reuse Remotion, Three.js, PixiJS, Lottie or other animation code | `remotion-to-hyperframes`; state native / hosted / media editability |
| Footage, images, fonts, voice, sound or colour treatment | `media-use` |
| A new episode in a supported reference style | `style-sampling` when requested |
| Figma input or a supplied video to reconstruct | `figma` or `reverse-any-video` when requested |

Resolve skills through the session catalog. For standalone installations, the usual roots are the user's `.agents/skills` and `.codex/skills`; plugin installations use the plugin's own rules. Do not hardcode a developer's home directory into application code. Follow the installed skill version. Keep this repository's checked-in instructions usable when a developer does not have an optional skill installed: report the missing skill and continue independent work.

Search the HyperFrames registry by the visual's narrative purpose, in English, before writing a named effect. Record the selected item and why it fits. Keep its editable source and dependencies with the scene. Do not select an item just because it looks impressive. Maintain the episode's style pack, palette, identity, narration timing and factual accuracy. Use only the selected runtime's supported schema; a HyperFrames block name is not a Remotion `SceneEffect.kind`.

For motion, define a subject, a narrated action, its reveal/payoff and a readable hold. Prefer a motivated camera move and a clear hero over repeated orbit, pulse and float decoration. Titles should land and remain readable. Use seeded randomness and absolute frame time; preserve seekability. Follow `docs/SCENE_MOTION.md` for the implemented Three.js/PixiJS contract and the HyperFrames fixture.

For HyperFrames output, follow its scene/template, stable-id, asset and paused-timeline contracts. Register asynchronous setup through its readiness protocol. Run `check --json`, inspect the relevant snapshots and review transition boundaries before claiming visual success. Report enabled/skipped audits separately. Render delivery files when the user's task authorizes delivery; a development check or preview is not delivery proof.

## 3D, WebGL and shader work

For the three.js/PixiJS code (`Scene3D`, `Figure3D`, `Globe3D`, `PixiParticles`, motion-film `field`/`object` scenes), read `docs/3D_REFERENCES.md` first: it lists the optional external skills and MCP servers, what to take from each, and the project contract that overrides them (three 0.187.0, raw three inside Remotion, a frame-pure draw with no animation loop, no network at render time, WebGL only, disposal, faked `three` in tests).

| Task | Resource |
| --- | --- |
| three.js API, materials, lighting units, postprocessing, performance | `threejs-skills` (CloudAI-X), or `threejs-webgpu-3d` if installed; check against the pinned `three` |
| GLSL shaders, particle and flow-field recipes | `webgl-animation-skills` (iart-ai); the VFX parts of `threejs-game-skills` |
| Light, lens, camera move and easing choices for a 3D shot | `cinematic-3d-video` `references/cinematography.md`; read-only ideas from `cinematic3d` |
| Inspecting a live three.js scene in the Studio player | `threejs-devtools-mcp` (untested here, see the doc), then write the fix in source |
| Frame review loop for motion work | read-only ideas from `motion-director` `references/review.md` |

These are optional. The user installs them from Studio → Developer tools or `pnpm ys skills install`; do not install them on your own. If one is missing, report it (and the menu) and continue. Copy no code or text from a repository without a licence (`cinematic3d`, `motion-director`); adapt MIT material in the project's own words. Blender MCP runs arbitrary Python and is not part of the pipeline.

## Runtime boundary

The application's `runStructured` agents are tool-free JSON producers with settings, plugins and skills isolated. Installing a skill in this coding environment does not load it into those agents. Keep that isolation. Runtime directing/reviewing uses the compact, project-owned policies in `packages/agents/src/motion-design.ts`, adapted from the runbooks above. Update their prompt-wiring tests when changing those policies.

Do not claim that a runtime agent searched the registry, executed HyperFrames, read a skill or rendered an external project unless that operation actually ran. Automatic external-engine production requires explicit pipeline jobs, staged media, caching, cost/error handling and integration evidence. The existing HyperFrames exporter is a development fixture.
