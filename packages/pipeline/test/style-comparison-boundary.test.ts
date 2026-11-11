import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { Timeline } from "@ys/core";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
const tool = vi.hoisted(() => vi.fn());
vi.mock("@ys/video/tools", () => ({ runMediaTool: tool }));
vi.mock("@ys/video/render", () => ({ renderEpisode: async ({ outputPath }: { outputPath: string }) => { await writeFile(outputPath, "rendered fixture"); return outputPath; } }));
import { compareRenderedStyle } from "../src/style-comparison.ts";
import { measureImage } from "../src/image-profile.ts";
import { MemStore, harness, makeState } from "./pipeline-harness.ts";
import { mutateResearch } from "../src/research.ts";
const dirs: string[] = [];
afterEach(async () => { tool.mockReset(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ys-style-boundary-")); dirs.push(dir);
  const path = join(dir, "main.mp4"); await writeFile(path, "immutable source");
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const render = { path, at: "t", styleReference: { key: "reference.png", profile: await measureImage(bytes) }, styleSampling: { eligible: 1, excludedArchive: 0, samples: [{ shotId: "s", seconds: 1 }] } };
  return { render, bytes, store: new MemStore(), episodeId: "e" };
}
describe("style comparison media boundary", () => {
  it("uses bounded frame extraction and persists a complete same-style result", async () => {
    const f = await fixture(); tool.mockResolvedValue({ stdout: f.bytes.toString("latin1"), stderr: "" });
    expect(await compareRenderedStyle(f)).toMatchObject({ status: "complete", compared: 1, findings: [], reportKey: expect.any(String) });
    expect(tool).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-ss", "1", "-i", f.render.path]), true, expect.objectContaining({ timeout: 20000, maxBuffer: 2097152 }));
    const h = harness(), id = await h.seed(makeState({}, { render: f.render }));
    const next = await h.pipeline.compareStyle(id); expect(next.render!.styleComparison!.status).toBe("complete"); expect(h.gateway.requests).toEqual([]);
    const empty = await h.seed(makeState()); await expect(h.pipeline.compareStyle(empty)).rejects.toThrow("render/style reference");
    const partial = await h.seed(makeState({}, { render: { path: "x", at: "t", styleReference: f.render.styleReference } }));
    await expect(h.pipeline.compareStyle(partial)).rejects.toThrow("render/style reference");
  });
  it("keeps empty/failed frame samples incomplete and discards evidence if the source changes", async () => {
    const f = await fixture();
    const failed = await compareRenderedStyle({ ...f, extract: async () => { throw "decoder offline"; } });
    expect(failed).toMatchObject({ status: "incomplete", compared: 0 });
    expect(f.store.json(failed.reportKey!).frames[0].error).toBe("decoder offline");
    const changed = await compareRenderedStyle({ ...f, extract: async () => { await writeFile(f.render.path, "changed bytes"); return f.bytes; } });
    expect(changed).toMatchObject({ status: "failed", error: "Render file changed during comparison" }); expect(changed.reportKey).toBeUndefined();
    f.store.put = async () => { throw "storage offline"; };
    expect(await compareRenderedStyle({ ...f, extract: async () => f.bytes })).toMatchObject({ status: "failed", error: "storage offline" });
  });
  it("freezes research, typography, archive provenance and the reference into the successful export", async () => {
    const f = await fixture(); tool.mockResolvedValue({ stdout: f.bytes.toString("latin1"), stderr: "" });
    const h = harness(), source = { id: `nasa-${"a".repeat(24)}`, provider: "nasa" as const, sourceId: "fixture", title: "Fixture archive", creator: "NASA", date: "", sourceUrl: "https://images.nasa.gov/details/fixture", imageUrl: "https://images-assets.nasa.gov/image/fixture.jpg" };
    await h.store.put("photo.jpg", f.bytes); await h.store.put("reference.png", f.bytes);
    const timeline = Timeline.parse({ episodeId: "e", lang: "tr", fps: 30, durationInFrames: 120, typography: { pair: "clear" }, audio: [], visuals: [0, 1, 2].map((i) => ({ shotId: `s${i}`, assetUrl: "photo.jpg", kind: "still_motion", fromFrame: i * 40, durationInFrames: 40, ...(i < 2 ? { archiveSource: source } : {}) })) });
    const state = makeState({}, { timeline, styleReference: f.render.styleReference, archives: { s0: { key: "photo.jpg", mimeType: "image/jpeg", source, width: 2, height: 2, originalSha256: "original", downloadedAt: "then" } } });
    const id = await h.seed(state);
    await mutateResearch({ id, store: h.store, load: () => h.load(id), expectedRevision: 0, mutation: { type: "put-source", source: { title: "Lab note", url: "https://example.org/lab", excerpt: "Fixture evidence" } } });
    const rendered = await h.pipeline.run(id, { only: "render" });
    expect(rendered.render!.archiveSources).toEqual([{ shotId: "s0", key: "photo.jpg", source, originalSha256: "original", downloadedAt: "then" }, { shotId: "s1", key: "photo.jpg", source }]);
    expect(rendered.render!.styleComparison!.status).toBe("complete"); expect(rendered.render!.typography).toEqual({ pair: "clear" });
    expect(JSON.parse(await readFile(join(h.workDir, id, `${id}.research.json`), "utf8"))).toEqual(h.store.json(rendered.render!.research!.reportKey));
    rendered.styleReference!.profile.palette[0]!.color = "#000000"; expect(rendered.render!.styleReference!.profile.palette[0]!.color).toBe("#ffffff");
    const get = h.store.get.bind(h.store); h.store.get = async (key) => key.includes("/research/exports/") ? null : get(key);
    await expect(h.pipeline.run(id, { only: "render" })).rejects.toThrow("bulunamadı");
    expect(h.gateway.requests).toEqual([]);
  });
  it("keeps a persisted comparison when releasing producer ownership fails", async () => {
    const f = await fixture(); tool.mockResolvedValue({ stdout: f.bytes.toString("latin1"), stderr: "" });
    const h = harness(), id = await h.seed(makeState({}, { render: f.render }));
    const compare = h.store.compareAndSwap.bind(h.store);
    h.store.compareAndSwap = async (key, expected, bytes) => { if (new TextDecoder().decode(bytes) === "null") throw new Error("Release unavailable"); return compare(key, expected, bytes); };
    expect((await h.pipeline.compareStyle(id)).render!.styleComparison!.status).toBe("complete");
  });
});
