import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ShotIntent, VectorAsset, VectorShot } from "../packages/core/src/index.ts";
import { newEpisodeState } from "../packages/pipeline/src/actions.ts";
import { buildTimeline } from "../packages/pipeline/src/timing.ts";
import { collectIntentFindings } from "../packages/pipeline/src/intent.ts";
import { renderEpisode, renderStills } from "../packages/video/src/render.ts";

// Native Remotion fixture with original vector assets. No agents, providers or generated speech.
const output = resolve(process.argv[2] ?? "out/shot-intent");
const publicDir = join(output, "public"); await mkdir(publicDir, { recursive: true });
const state = newEpisodeState({ topic: "Structured intent verification", lang: "en", targetSec: 9, tier: "economy", budgetUsd: 0, aiClipRatio: 0, motionMode: "vector", width: 1920, height: 1080, fps: 24, captions: false, music: false, sfx: false });
state.id = "intent-verification";
state.script = { scenes: ["s1", "s2"].map((id) => ({ id, beatId: "b1", narration: "Package delivered", visualIntent: "A parcel moves, then stays established", emotion: "calm", location: "stage" })) };
state.voice = Object.fromEntries(["s1", "s2"].map((id) => [id, { key: "unused.wav", mimeType: "audio/wav", durationMs: 4000, estimatedTiming: true, words: [{ text: "Package", startMs: 0, endMs: 500 }, { text: "delivered", startMs: 1000, endMs: 1500 }] }]));
state.keyframes = {};
const moving = ShotIntent.parse({ subject: "parcel", action: "move", payoff: "The parcel reaches its delivery position", narration: { startWord: 0, endWord: 1 }, reveal: .5, holdSec: 2 });
state.shots = [0, 1].map((i) => ({ id: `s${i + 1}-sh1`, sceneId: `s${i + 1}`, kind: "still_motion", startMs: i * 4400, endMs: (i + 1) * 4400, description: i ? "The delivered parcel stays established" : "The parcel moves to the delivery position", imagePrompt: "", motionPrompt: "", camera: "static", intent: i ? { ...moving, action: "hold", reveal: 0, holdSec: 4 } : moving,
  vector: VectorShot.parse({ background: "stage", layers: [{ asset: "parcel", x: i ? 1250 : 450, depth: .45, anims: i ? [] : [{ type: "move", toX: 1250, start: 0, end: .5 }] }], texts: [{ text: "Delivery", style: "title", color: "#F3F0E6", x: 960, y: 130 }], camera: { zoomFrom: 1, zoomTo: 1, panX: 0 } }) }));
const assets = {
  stage: VectorAsset.parse({ id: "stage", kind: "background", width: 1920, height: 1080, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#F3F0E6"/><path d="M0 810H1920" stroke="#68725F" stroke-width="4"/></svg>', meta: { floorY: 810 } }),
  parcel: VectorAsset.parse({ id: "parcel", kind: "prop", width: 200, height: 160, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><rect x="6" y="6" width="188" height="148" rx="6" fill="#CF8B42" stroke="#111410" stroke-width="8"/><path d="M80 8H120V65L100 54L80 65Z" fill="#F3F0E6"/><path d="M35 113H72M35 130H95" stroke="#111410" stroke-width="6"/></svg>', meta: { grounded: true, realHeight: .6 } }),
};
const findings = collectIntentFindings(state);
if (findings.length) throw new Error(JSON.stringify(findings));
const invalid = structuredClone(state); invalid.shots![0]!.intent!.holdSec = 8;
if (!collectIntentFindings(invalid).some((f) => f.code === "intent_hold_overrun")) throw new Error("Invalid hold was not detected");
const timeline = buildTimeline(state, (key) => key, assets);
timeline.audio = []; // Timings above are synthetic test inputs; this fixture makes no narration-alignment claim.
timeline.captions = [];
for (const visual of timeline.visuals) visual.stylePack = "paper-poster";
if (timeline.visuals.some((v) => !v.intent)) throw new Error("Intent was lost during timeline construction");
await writeFile(join(output, "timeline.json"), JSON.stringify(timeline, null, 2));
await writeFile(join(output, "state.json"), JSON.stringify(state, null, 2));
const frames = { opening: 1, moving: 40, landed: 95, quiet: 190 };
const stills = await renderStills({ timeline, publicDir, frames, outDir: output });
const repeat = join(output, "repeat"); await mkdir(repeat, { recursive: true });
const repeated = await renderStills({ timeline, publicDir, frames: { landed: 95 }, outDir: repeat });
if (!(await readFile(stills.landed!)).equals(await readFile(repeated.landed!))) throw new Error("Repeated seeking changed the held frame");
await renderEpisode({ timeline, publicDir, outputPath: join(output, "intent.mp4") });
await writeFile(join(output, "verification.json"), JSON.stringify({ intentPreserved: true, planFindings: findings, invalidHoldDetected: true, repeatedFrameEqual: true, generationCalls: 0, silentFixture: true, stills }, null, 2));
console.log(`Verified native intent fixture: ${output}`);
