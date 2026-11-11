import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { compareImageProfiles, rgbToOklab, type Timeline } from "@ys/core";
import { getJson } from "@ys/storage";
import { measureImage, measureStyleReference } from "../src/image-profile.ts";
import { compareRenderedStyle, styleSamples } from "../src/style-comparison.ts";
import { MemStore, harness, makeState } from "./pipeline-harness.ts";
import { saveCustomStyle } from "../src/custom-styles.ts";
import { RECIPE } from "../../core/test/style-recipe-fixture.ts";

const solid = (color: string) => sharp({ create: { width: 100, height: 50, channels: 3, background: color } }).png().toBuffer();
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("local reference measurements", () => {
  it("measures known areas deterministically and does not invent colors for a solid image", async () => {
    const data = Buffer.alloc(100 * 50 * 3);
    for (let i = 0; i < 100 * 50; i++) { data[i * 3] = i % 100 < 75 ? 255 : 0; data[i * 3 + 2] = i % 100 < 75 ? 0 : 255; }
    const bytes = await sharp(data, { raw: { width: 100, height: 50, channels: 3 } }).png().toBuffer();
    const profile = await measureImage(bytes);
    expect(profile.palette).toEqual([{ color: "#ff0000", share: .75 }, { color: "#0000ff", share: .25 }]);
    expect(await measureImage(bytes)).toEqual(profile);
    const white = await measureImage(await solid("#ffffff"));
    expect(white.palette).toEqual([{ color: "#ffffff", share: 1 }]);
    expect(white.tone.lightShare).toBe(1); expect(white.contrastSpan).toBe(0); expect(white.edgeDensity).toBe(0);
    expect(rgbToOklab(0, 0, 0)).toEqual([0, 0, 0]); expect(rgbToOklab(255, 255, 255)[0]).toBeCloseTo(1);
  });
  it("bounds sampling, flattens transparency and rejects undecodable bytes", async () => {
    const bytes = await sharp({ create: { width: 1000, height: 500, channels: 4, background: "#00000000" } }).png().toBuffer();
    const profile = await measureImage(bytes);
    expect(profile).toMatchObject({ width: 1000, height: 500, sampledPixels: 192 * 96, palette: [{ color: "#ffffff", share: 1 }] });
    await expect(measureImage(new Uint8Array([1]))).rejects.toThrow();
  });
  it("bounds diverse palettes, merges near colors and supports a single pixel without invented edges", async () => {
    const colors = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255], [15, 15, 15]];
    const data = Buffer.from(colors.flatMap((rgb) => Array.from({ length: 10 }, () => rgb).flat()));
    const profile = await measureImage(await sharp(data, { raw: { width: 90, height: 1, channels: 3 } }).png().toBuffer());
    expect(profile.palette).toHaveLength(6); expect(profile.palette.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1);
    const nearby = await sharp(Buffer.from([170, 170, 170, 176, 176, 176]), { raw: { width: 2, height: 1, channels: 3 } }).png().toBuffer();
    expect((await measureImage(nearby)).palette).toHaveLength(1);
    const pixel = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    const metadata = await sharp(pixel).metadata(); Reflect.deleteProperty(metadata, "autoOrient");
    vi.spyOn(sharp.prototype, "metadata").mockResolvedValueOnce(metadata);
    expect(await measureImage(pixel)).toMatchObject({ width: 1, height: 1, edgeDensity: 0, sampledPixels: 1 });
  });
  it("distinguishes near-color matching, detail and contrast changes", async () => {
    const p = await measureImage(await solid("#aaaaaa"));
    const actual = { ...p, palette: [{ color: "#a9a9a9", share: .5 }, { color: "#ababab", share: .5 }], contrastSpan: .5, edgeDensity: .8 };
    expect(compareImageProfiles(p, actual)).toMatchObject({ flags: ["palette", "contrast", "detail"], paletteShareDelta: .5 });
  });
  it("uses content-addressed measurements and repairs a missing reference without a model or ledger", async () => {
    const store = new MemStore(), bytes = await solid("#abcdef");
    const first = await measureStyleReference(store, bytes);
    expect(first.cached).toBe(false); expect((await measureStyleReference(store, bytes)).cached).toBe(true);
    await store.delete(first.referenceKey);
    expect((await measureStyleReference(store, bytes)).cached).toBe(false);
    expect(await store.get(first.referenceKey)).toEqual(bytes);
  });
  it("detects both changed colors and changed proportions without calling a quality score", async () => {
    const p = await measureImage(await solid("#ffffff"));
    expect(compareImageProfiles(p, p).flags).toEqual([]);
    const black = await measureImage(await solid("#000000"));
    expect(compareImageProfiles(p, black).flags).toContain("palette");
    const a = { ...p, palette: [{ color: "#ff0000", share: .9 }, { color: "#0000ff", share: .1 }] };
    const b = { ...a, palette: [{ color: "#ff0000", share: .1 }, { color: "#0000ff", share: .9 }] };
    expect(compareImageProfiles(a, b)).toMatchObject({ paletteDistance: 0, paletteShareDelta: .8, flags: ["palette"] });
  });
  it("stores authoritative pixels on save and freezes the style stage binding", async () => {
    const h = harness(), measured = await measureStyleReference(h.store, await solid("#ff0000"));
    const saved = await saveCustomStyle(h.store, RECIPE, measured.referenceKey);
    expect(saved.referenceProfile).toEqual(measured.profile);
    const id = await h.seed(makeState({ customStyleId: saved.id }));
    const state = await h.pipeline.run(id, { only: "style" });
    expect(state.styleReference).toEqual({ key: measured.referenceKey, profile: measured.profile });
  });
});

describe("rendered reference comparison", () => {
  it("samples at most twelve shot midpoints and excludes archive photos", () => {
    const visuals = Array.from({ length: 20 }, (_, i) => ({ shotId: String(i), fromFrame: i * 24, durationInFrames: 24, ...(i % 2 === 0 ? { archiveSource: {} } : {}) }));
    const sampling = styleSamples({ fps: 24, visuals } as Timeline);
    expect(sampling.eligible).toBe(10); expect(sampling.excludedArchive).toBe(10);
    expect(sampling.samples[0]).toEqual({ shotId: "1", seconds: 35 / 24 });
    expect(styleSamples({ fps: 24, visuals: visuals.map((v) => ({ ...v, archiveSource: undefined })) } as Timeline).samples).toHaveLength(12);
    expect(styleSamples({ fps: 24, visuals: [] } as unknown as Timeline).samples).toEqual([]);
  });
  it("reports measured frames and failed extractions separately, preserving frozen reference identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "ys-style-")); roots.push(root);
    const path = join(root, "actual.mp4"); await writeFile(path, "source fixture");
    const store = new MemStore(), white = await solid("#ffffff"), reference = await measureStyleReference(store, white);
    const result = await compareRenderedStyle({ episodeId: "fixture", store,
      render: { path, at: "original", styleReference: { key: reference.referenceKey, profile: reference.profile },
        styleSampling: { eligible: 3, excludedArchive: 1, samples: [{ shotId: "same", seconds: 1 }, { shotId: "different", seconds: 2 }, { shotId: "bad", seconds: 3 }] } },
      extract: async (_, sec) => { if (sec === 3) throw new Error("decode failed"); return sec === 1 ? white : solid("#000000"); } });
    expect(result).toMatchObject({ status: "incomplete", compared: 2, eligible: 3, excludedArchive: 1, findings: [{ shotId: "different", flags: ["palette", "tone"] }] });
    const report = await getJson<any>(store, result.reportKey!);
    expect(report.reference.profile.sha256).toBe(reference.profile.sha256); expect(report.renderedAt).toBe("original");
    expect(report.frames[2].error).toBe("decode failed"); expect(report.frames[0].comparison.flags).toEqual([]);
  });
  it("marks a missing source as failed and never claims an empty comparison completed", async () => {
    const reference = await measureStyleReference(new MemStore(), await solid("#ffffff"));
    const result = await compareRenderedStyle({ episodeId: "fixture", store: new MemStore(), render: { path: "missing-style-fixture.mp4", at: "original", styleReference: { key: reference.referenceKey, profile: reference.profile }, styleSampling: { eligible: 0, excludedArchive: 1, samples: [] } } });
    expect(result.status).toBe("failed"); expect(result.reportKey).toBeUndefined();
  });
});
