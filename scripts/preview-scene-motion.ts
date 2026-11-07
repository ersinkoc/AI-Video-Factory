import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SceneEffect, THREE_PRESETS, Timeline, VectorShot } from "../packages/core/src/index.ts";
import { renderStills } from "../packages/video/src/render.ts";

// Offline fixture: no AI calls, credentials or external assets. Reusable visual smoke test.
const output = resolve(process.argv[2] ?? "out/scene-motion");
const portrait = process.argv.includes("--portrait");
await mkdir(output, { recursive: true });
await mkdir(resolve(output, "public"), { recursive: true });
const accents = ["sparks", "starfield", "energy_rings", "fireflies", "speed_lines", "bubbles"] as const;
const timeline = Timeline.parse({
  episodeId: "scene-motion-preview", lang: "en", fps: 30, durationInFrames: THREE_PRESETS.length * 120,
  width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080,
  palette: ["#091426", "#152d48", "#ffd84d"],
  visuals: THREE_PRESETS.map((preset, i) => ({
    shotId: `s${i + 1}-sh1`, kind: "motion_graphic", assetUrl: "", fromFrame: i * 120, durationInFrames: 120,
    vector: VectorShot.parse({
      three: [{ preset, size: 850, y: 510 }],
      effects: [SceneEffect.parse({ kind: accents[i], intensity: 0.45 })],
      texts: [{ text: preset.replaceAll("_", " ").toUpperCase(), x: 960, y: 140, style: "title" }],
      camera: { zoomFrom: 1, zoomTo: 1, panX: 0 },
    }),
  })), audio: [], captions: [],
});
await writeFile(resolve(output, "timeline.json"), JSON.stringify(timeline, null, 2));
const frames = Object.fromEntries(THREE_PRESETS.flatMap((preset, i) => [
  [`${preset}-start`, i * 120 + 1], [`${preset}-mid`, i * 120 + 60], [`${preset}-end`, i * 120 + 115],
]));
console.log(await renderStills({ timeline, publicDir: resolve(output, "public"), frames, outDir: output, onWait: (pid) => console.log(`Waiting for render ${pid}`) }));
