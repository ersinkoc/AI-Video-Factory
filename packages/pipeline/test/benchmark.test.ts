import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "@ys/core";
import { benchmarkClip, benchmarkCode, comparableBenchmarks, freezeBenchmark, verifyBenchmark, inside } from "../src/benchmark.ts";
import { makeState } from "./pipeline-harness.ts";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const timeline = () => Timeline.parse({ episodeId: "e", lang: "en", fps: 10, width: 640, height: 360, durationInFrames: 120, visuals: [{ shotId: "s1", assetUrl: "assets/image.png", kind: "still_motion", fromFrame: 20, durationInFrames: 60 }], audio: [] });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ys-bench-")); dirs.push(root);
  const state = makeState({}, { timeline: timeline(), shots: [{ id: "s1", sceneId: "s", kind: "still_motion", startMs: 2000, endMs: 8000, description: "A subject", imagePrompt: "", motionPrompt: "", camera: "static" }] });
  return { root, state, opts: { directory: join(root, "fixture"), shots: [{ episode: "e", shot: "s1", category: "wide" as const }], load: async () => state, asset: async () => Buffer.from("original media") } };
}
describe("frozen benchmark inputs", () => {
  it("never compares missing, skipped, partial or different-input reviews as a quality gain", () => {
    const full = { inputHash: "same", reviewerHash: "reviewer", reviewStatus: "complete" };
    expect(comparableBenchmarks(full, full)).toBe(true);
    for (const other of [{}, { ...full, inputHash: "different" }, { ...full, reviewerHash: "different" }, { ...full, reviewStatus: "skipped" }, { ...full, reviewStatus: "incomplete" }]) expect(comparableBenchmarks(full, other)).toBe(false);
  });
  it("freezes actual media and planning inputs; later episode edits do not alter the corpus", async () => {
    const { state, opts } = await fixture();
    const manifest = await freezeBenchmark(opts);
    state.timeline!.visuals[0]!.assetUrl = "changed.png";
    const frozen = JSON.parse(await readFile(join(opts.directory, "states/e.json"), "utf8"));
    expect(frozen.timeline.visuals[0].assetUrl).toBe("assets/image.png");
    expect((await verifyBenchmark(opts.directory)).inputHash).toBe(manifest.inputHash);
    await expect(freezeBenchmark(opts)).rejects.toThrow();
    expect((await verifyBenchmark(opts.directory)).inputHash).toBe(manifest.inputHash);
  });
  it("rejects changed media, missing inputs, path escapes and incomplete publication", async () => {
    const { opts, root } = await fixture();
    await freezeBenchmark(opts);
    await writeFile(join(opts.directory, "public/e/assets/image.png"), "changed");
    await expect(verifyBenchmark(opts.directory)).rejects.toThrow("Benchmark input changed");
    const failed = join(root, "failed");
    await expect(freezeBenchmark({ ...opts, directory: failed, asset: async () => { throw new Error("missing source"); } })).rejects.toThrow("missing source");
    await expect(readFile(join(failed, "manifest.json"))).rejects.toThrow();
    expect(() => inside(root, "../outside")).toThrow();
    expect(() => inside(root, "C:/outside")).toThrow();
    expect(() => inside(root, "bad\\path")).toThrow();
  });
  it("keeps clip frames inside the original composition and includes cut context", () => {
    expect(benchmarkClip(timeline(), "s1")).toEqual([25, 84]);
    const t = timeline(); t.visuals[0]!.fromFrame = 0; t.visuals[0]!.durationInFrames = 4;
    expect(benchmarkClip(t, "s1")).toEqual([0, 8]);
    expect(() => benchmarkClip(t, "unknown")).toThrow("Shot missing");
  });
  it("refuses an empty corpus, incomplete plans, remote assets and malformed manifests", async () => {
    const { opts, state, root } = await fixture();
    await expect(freezeBenchmark({ ...opts, shots: [] })).rejects.toThrow("empty");
    delete state.timeline;
    await expect(freezeBenchmark(opts)).rejects.toThrow("Timeline missing");
    state.timeline = timeline(); delete state.shots;
    await expect(freezeBenchmark(opts)).rejects.toThrow("Shot missing");
    state.shots = [];
    await expect(freezeBenchmark(opts)).rejects.toThrow("Shot missing");
    state.timeline.visuals = [];
    await expect(freezeBenchmark(opts)).rejects.toThrow("Shot missing");
    state.timeline = timeline(); state.shots = (await fixture()).state.shots;
    state.timeline.visuals[0]!.assetUrl = "https://example.com/media.png";
    await expect(freezeBenchmark(opts)).rejects.toThrow("Stage remote media locally");
    for (const manifest of [{ version: 2, shots: [] }, { version: 1, shots: [] }, { version: 1, shots: opts.shots, files: [], inputHash: "bad" }]) {
      await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
      await expect(verifyBenchmark(root)).rejects.toThrow("Invalid benchmark manifest");
    }
    for (const path of ["", "a//b", "./a", "a/../b", "..sibling"]) expect(() => inside(root, path)).toThrow();
  });
  it("freezes overlays, depth and audio while honoring disabled captions", async () => {
    const { opts, state } = await fixture();
    state.input.captions = false;
    state.timeline!.captions = [{ text: "Hidden", startMs: 0, endMs: 100 }];
    state.timeline!.visuals[0]!.overlay = "assets/overlay.png";
    state.timeline!.visuals[0]!.motion = { type: "parallax", depthAssetUrl: "assets/depth.png" } as never;
    state.timeline!.audio = [{ role: "voice", assetUrl: "voice.wav", fromFrame: 0, durationInFrames: 120, volume: 1 }];
    const manifest = await freezeBenchmark(opts);
    expect(manifest.files.map((f) => f.path)).toEqual(expect.arrayContaining(["public/e/assets/overlay.png", "public/e/assets/depth.png", "public/e/voice.wav"]));
    expect(JSON.parse(await readFile(join(opts.directory, "states/e.json"), "utf8")).timeline.captions).toEqual([]);
  });
  it("fingerprints dirty code and lockfile bytes without including generated or media files", async () => {
    const { root } = await fixture();
    for (const dir of ["packages/nested", "apps", "scripts", "packages/node_modules", "packages/.next", "packages/public"]) await mkdir(join(root, dir), { recursive: true });
    for (const path of ["package.json", "pnpm-lock.yaml", "packages/nested/source.ts", "packages/nested/component.tsx", "apps/config.json", "scripts/note.txt", "packages/tsbuildinfo.ts", "packages/public/media.ts", "packages/.next/build.ts", "packages/node_modules/vendor.ts"]) await writeFile(join(root, path), "original");
    const original = await benchmarkCode(root);
    await writeFile(join(root, "packages/public/media.ts"), "ignored media");
    await writeFile(join(root, "scripts/note.txt"), "ignored prose");
    expect(await benchmarkCode(root)).toBe(original);
    await writeFile(join(root, "packages/nested/source.ts"), "changed source");
    const changed = await benchmarkCode(root); expect(changed).not.toBe(original);
    await writeFile(join(root, "pnpm-lock.yaml"), "changed dependency lock");
    expect(await benchmarkCode(root)).not.toBe(changed);
  });
});
