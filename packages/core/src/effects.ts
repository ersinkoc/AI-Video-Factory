import { z } from "zod";

export const PARTICLE_EFFECTS = ["sparks", "fireflies", "bubbles", "starfield", "speed_lines", "energy_rings"] as const;
export const THREE_PRESETS = ["atom", "solar_system", "network", "crystal", "orbital_rings", "wave_grid"] as const;
export const COMPOSITE_EFFECTS = ["light_sweep", "scanlines", "letterbox", "vignette"] as const;

const timing = {
  start: z.number().min(0).max(1).default(0),
  end: z.number().min(0).max(1).default(1),
};
const validWindow = (v: { start: number; end: number }) => v.end > v.start;
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Screen-space accents, below titles/captions. Time is a fraction of the shot. */
export const SceneEffect = z.object({
  kind: z.enum([...PARTICLE_EFFECTS, ...COMPOSITE_EFFECTS]),
  ...timing,
  intensity: z.number().min(0).max(1).default(0.5),
  color: color.default("#70d6ff"),
  speed: z.number().min(0.1).max(4).default(1),
}).refine(validWindow, { message: "Effect end must be after start", path: ["end"] });
export type SceneEffect = z.infer<typeof SceneEffect>;

/** Procedural illustrative models, never a substitute for factual maps or measured data. */
export const SceneThree = z.object({
  preset: z.enum(THREE_PRESETS),
  ...timing,
  x: z.number().min(0).max(1920).default(960),
  y: z.number().min(0).max(1080).default(510),
  size: z.number().min(100).max(900).default(520),
  color: color.default("#70d6ff"),
  accent: color.default("#ffd84d"),
  speed: z.number().min(0.1).max(4).default(1),
  camera: z.enum(["static", "orbit", "push_in"]).default("orbit"),
  wireframe: z.boolean().default(false),
}).refine(validWindow, { message: "3D end must be after start", path: ["end"] });
export type SceneThree = z.infer<typeof SceneThree>;

export const SCENE_MOTION_RULES = `Motion design is part of the storytelling, not an optional afterthought:
- Plan a meaningful animated visual in most shots (aim for at least two thirds): combine character/object choreography, kinetic typography, camera movement, procedural 3D and timed effects. Quiet emotional beats can stay restrained. Do not repeat the same treatment in consecutive shots.
- spec.three: up to 2 procedural Three.js illustrations. preset: atom (schematic nucleus/electron orbits), solar_system (stylised sun and planets, NOT to scale), network (linked nodes/data), crystal (faceted rotating object), orbital_rings (gyroscope/abstract systems), wave_grid (oscillating surface). Use these prominently when the narration explains the matching idea, not as unrelated decoration. These are illustrative, not measured scientific simulations; real geography still uses map/globe and numerical claims use the math board.
- Each three item has x/y centre and size in the 1920x1080 stage, color/accent (#RRGGBB), camera (static/orbit/push_in), speed (0.1-4), wireframe, start/end (0-1 shot fractions). Reserve clear space; place characters beside the illustration, keep it away from faces and the math board. In vertical video keep its full bounds inside the centre-safe area.
- spec.effects: up to 3 accents with kind, start/end (0-1), intensity (0-1), color (#RRGGBB), speed (0.1-4). PixiJS kinds: sparks (impact/invention), fireflies (organic/magical atmosphere), bubbles (underwater/chemistry), starfield (space), speed_lines (acceleration/revelation), energy_rings (signal/pulse). Composite kinds: light_sweep (reveal), scanlines (screen/technology), letterbox (cinematic emphasis), vignette (focus). Time accents to narrated beats; use moderate intensity, preserve legibility, and avoid duplicate weather/particles with ambience. Use empty arrays when an effect would weaken the story.
- Describe the chosen motion and its narrative purpose in the shot description so reviewers can assess it.`;
