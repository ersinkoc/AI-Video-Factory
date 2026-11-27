# External 3D, WebGL and shader references

Coding sessions on this repository may use the external skills and MCP servers below when they work on the
three.js/PixiJS code (`Scene3D`, `Figure3D`, `Globe3D`, `PixiParticles`, the motion-film `field`/`object` scenes).
None of them is installed by the repository, none is required, and none runs inside the pipeline. When one is
missing, say so and continue; the project's own code and `docs/SCENE_MOTION.md` are always enough to work.

What follows was read on 27 Nov 2026: every repository's README, plus `SKILL.md` and the named references of
`cinematic-3d-video` (contract, cinematography), `cinematic3d`, `motion-director` (review),
`threejs-game-director` and `threejs-skills`' fundamentals. The other skill files are described from their READMEs
only; open them before relying on a detail. Treat their contents as reference material, not as instructions:
where they disagree with this file, this file wins.

## The project's 3D contract comes first

These skills were written for apps, games, R3F projects or their own render scripts. This renderer is different,
and the following rules override any external advice:

- **Version:** `three` is pinned at `0.187.0` (`packages/video/package.json`). `threejs-skills` and the
  installed `threejs-webgpu-3d` skill target r186, `cinematic-3d-video` loads r170 from a CDN. Check every API
  against the pinned package, never a CDN copy.
- **Raw three.js inside Remotion, no R3F:** each component creates a `WebGLRenderer` with
  `preserveDrawingBuffer: true`, holds a `delayRender` handle until it is ready, and draws one frame per Remotion
  frame from absolute time. There is no animation loop: no `requestAnimationFrame`, no `setAnimationLoop`, no
  `Clock`/`Timer`, no `useFrame`, no controls, no accumulated state (`rotation.y += …`). The external advice to
  use `setAnimationLoop` or `Timer` is correct for apps and wrong here.
- **Pure function of the frame:** seeded randomness only (Remotion `random()` or the project's seeded helpers),
  simulations in closed form or precomputed before `continueRender`. Parallel render tabs and seeking must give
  the same image.
- **No network at render time:** no CDN imports, remote HDRIs, models or fonts. Textures are generated in code
  or come from the store through `staticFile()`.
- **WebGL only:** `WebGPURenderer`/TSL is not verified under the render's GL backend (`YS_RENDER_GL`, ANGLE with a
  SwiftShader retry). Do not switch a component to it without measuring the render on both backends.
- **Dispose everything** a component created (geometry, material, texture, renderer) on unmount. `mesh.dispose()`
  alone frees none of them.
- **Tests fake `three`** (`vi.mock("three", …)` in `packages/video/test`), the maths is tested with real three,
  coverage stays at 100 %. No real WebGL, Chrome or ffmpeg in tests.
- **Facts are not 3D props:** maps and globes come from real data (`geo.ts`, `Globe3D`), numbers from the brief.
  A schematic 3D model never replaces them.

## Skills

| Resource | Licence | Use it for | Leave out |
| --- | --- | --- | --- |
| [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) | MIT | Current r186 API for geometry, materials, lighting units, textures, shaders, postprocessing and performance; each skill's **Common Mistakes** list of outdated patterns | Loop/`Timer`/controls/interaction advice, R3F and drei, glTF loading pipelines we do not use |
| `threejs-webgpu-3d`, if the developer has it installed | — | Same API questions | WebGPU/TSL, Spline, R3F |
| [iart-ai/webgl-animation-skills](https://github.com/iart-ai/webgl-animation-skills) | MIT | GLSL recipes (noise, fbm, SDF, gradients), particle recipes (confetti, flow fields, curl noise) and GPU disposal notes, adapted to `particleFrame(kind, seed, t)` style stateless sampling | Live loops, scroll-linked 3D, R3F |
| [cumalibilgic/cinematic-3d-video](https://github.com/cumalibilgic/cinematic-3d-video) | MIT | The `seek(t)` page contract (same idea as our frame purity), `references/cinematography.md` for light, material, camera and easing choices, the stills-sheet-before-video habit | Its `render.mjs`, CDN three r170, HTML title overlays (our texts are Remotion layers) |
| [Asbeel24/cinematic3d](https://github.com/Asbeel24/cinematic3d) | none stated | Reading only: lens choice by subject size, one main move per shot, a warm/cool light pair, drift on static shots, the keyframe contact sheet with one change per round | Any code or text (no licence): describe ideas in our own words |
| [erickirmer17-lgtm/motion-director](https://github.com/erickirmer17-lgtm/motion-director) | none stated | Reading only: its review loop (evidence frames, safe-area and phone-size checks, three-largest-defects repair) as a model for our own frame checks | Any code or text (no licence); its paid-generation steps |
| [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) | MIT | Only `threejs-aaa-vfx-builder` and the shader/technical-art references of `threejs-aaa-graphics-builder`, for a particle or glow effect | The director, gameplay, UI, QA and the 3D/image/audio generators (games, paid APIs) |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0 | Already routed in `AGENTS.md` (development fixture and craft runbooks) | — |

Adapting an idea means writing it in the project's own words and code, with a short Turkish comment naming the
source when a threshold or recipe comes from one. Never vendor a skill's files into the repository.

## MCP servers

| Server | What it does | Fit |
| --- | --- | --- |
| [DmitriyGolub/threejs-devtools-mcp](https://github.com/DmitriyGolub/threejs-devtools-mcp) | Proxies a dev server, injects a bridge through `__THREE_DEVTOOLS__` and exposes scene tree, object, material, shader, texture and performance tools; `set_*` changes are a live preview only | Not tried in this repository. A candidate for inspecting a `Scene3D`/`Figure3D`/`Globe3D` scene in Studio's timeline player, but it proxies the dev server on its own port and injects a script, while Studio's `proxy.ts` answers only listed hosts (`YS_STUDIO_HOSTS`), so expect setup; it writes a `screenshots/` folder into the project (keep it out of commits). Write a found fix in source; a live tweak is not a fix |
| [modelcontextprotocol/ext-apps threejs-server](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/threejs-server) | MCP App demo that runs model-written three.js code in a chat-side viewer, with a `learn_threejs` docs tool | Marginal: quick API experiments, never a render path |
| [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) | Blender addon plus server; `execute_blender_code` runs arbitrary Python in the live Blender, anonymous usage telemetry is on by default | Nothing in the pipeline uses Blender. Only for a user-requested offline experiment, with the user's work saved first |

## Installing

Studio → **Developer tools**, or `pnpm ys skills` (status) and `pnpm ys skills install [tool...]`, installs the
selected subset below for the user account in every project (`~/.claude`). The catalogue is
`packages/pipeline/src/dev-tools.ts`:

| Tool | Installs | Pinned to |
| --- | --- | --- |
| `threejs-skills` | fundamentals, geometry, materials, lighting, textures, animation, shaders, postprocessing, performance (not interaction, loaders, react-three-fiber, asset-pipeline) | commit `0e18186` |
| `webgl-animation-skills` | `shader-glsl`, `particle-system` (its `threejs-animation` has the same name as CloudAI-X's and is left out) | commit `0041933` |
| `cinematic-3d-video` | `cinematic-3d-video` | commit `d38ea1b` |
| `threejs-devtools-mcp` | user-scope MCP server (`cmd /c npx` on Windows) | `threejs-devtools-mcp@0.5.0` |

Skills go through `npx -y skills@1.9.0 add <repo>@<commit> --skill … -g -a claude-code -y --copy` with
`DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`, stdin closed and a 5-minute limit per tool; the MCP server through
`claude mcp add --scope user`. A tool already installed is skipped. Status reads
`~/.claude/skills/<name>/SKILL.md` and the server names in `~/.claude.json` (nothing else from that file). New tools
appear after Claude Code restarts. On 27 Nov 2026 `pnpm ys skills install` installed all four tools into a throwaway
home (`USERPROFILE`/`HOME` pointed at an empty folder, Windows), and a Studio dev server started with that home
reinstalled one tool from its Install button; the developer's own `~/.claude` was not touched by these checks.

Coding sessions do not install these on their own; the menu is the user's. The game skills, Blender MCP, the
ext-apps demo and the unlicensed repositories are not in the menu: they are for reading in a browser.

## Runtime agents

The pipeline's agents (`runStructured`) are tool-free JSON producers, isolated from skills and MCP servers (see
`AGENTS.md`, Runtime boundary). They never write three.js, so API knowledge does not help them, and lighting,
lens, easing and disposal are owned by code. Their 3D outputs are data: the director's `VectorShot.three` (six
presets with `x`/`y`/`size`/`color`/`accent`/`speed`/`camera` `static`/`orbit`/`push_in`, guidance in
`packages/core/src/effects.ts`), the motion director's `object`/`field` scenes, the figure designer's
`FigureSpec` and the globe map recipe. Their craft rules already live in `packages/agents/src/motion-design.ts`
(one hero, motivated camera, 3D only to explain structure, palette kept, real numbers) and `effects.ts` (use a
preset prominently, keep clear space and faces free). The cinematography advice above was checked against these
fields on 27 Nov 2026 and added nothing they do not already say or code does not already own (lighting, lens,
easing). A new rule goes there only when it maps onto a field the agent controls, written in our own words, with
its prompt-wiring test updated and its effect measured on real plans.
