import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannedShotState } from "../src/index.ts";
import { onAgent, render, resetFakes } from "./pipeline-fakes.ts";
import { harness, makeState, SCRIPT, STYLE, voiceOf, vshot } from "./pipeline-harness.ts";

vi.mock("@ys/agents", async (orig) => (await import("./pipeline-fakes.ts")).mockAgents(await orig()));
vi.mock("@ys/video/render", async () => {
  const f = await import("./pipeline-fakes.ts");
  return f.renderModule();
});

/**
 * Dikey Short (short aşaması): paketin seçtiği sahne aralığı 9:16 olarak yerelde yeniden render edilir; müzik ve efekt
 * kısa için yeniden üretilir. Short ek çıktıdır: kapalıysa, bölüm zaten dikeyse ya da render düşerse bölüm durmaz.
 */

const shot = (id: string, startMs: number, endMs: number, vector: object): PlannedShotState =>
  ({ id, sceneId: "s1", kind: "motion_graphic", startMs, endMs, description: "", imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot(vector) }) as unknown as PlannedShotState;

const SHOTS = [
  shot("s1-sh1", 0, 4000, { texts: [{ text: "Altair", x: 960, y: 200, anims: [{ type: "kinetic", start: 0.7, end: 0.9 }] }] }),
  shot("s1-sh2", 4000, 7000, {}),
  shot("s1-sh3", 7000, 9000, {}),
];

const ready = (input: object = {}, extra: object = {}) =>
  makeState(
    { motionMode: "vector", qa: false, ...input },
    { style: STYLE, script: SCRIPT, voice: { s1: voiceOf("s1"), s2: voiceOf("s2") }, shots: SHOTS, keyframes: {}, vectorProps: {}, ...extra },
  );

const PKG = {
  title: "Paket başlığı",
  thumbnailText: "Kısa",
  description: "Açıklama.",
  chapters: [],
  tags: [],
  hashtags: [],
  short: { from: "s2", to: "s2", title: "Short başlığı" },
};

/** Timeline, render ve paket hazır bölüm (paket ajanı verilen veriyi döndürür). */
async function prepared(h: ReturnType<typeof harness>, input: object = {}, pkg: object | null = PKG) {
  for (const v of [voiceOf("s1"), voiceOf("s2")]) h.store.map.set(v.key, new Uint8Array([9]));
  const id = await h.seed(ready(input));
  await h.pipeline.run(id, { only: "timeline" });
  await h.pipeline.run(id, { only: "render" });
  if (pkg) {
    onAgent("packager", () => pkg);
    await h.pipeline.run(id, { only: "package" });
  }
  return id;
}

beforeEach(() => resetFakes());

describe("dikey Short", () => {
  it("paketin seçtiği sahneler 9:16 render edilir; müzik ve efekt kısa için yeniden üretilip render klasörüne yazılır", async () => {
    const h = harness();
    const id = await prepared(h);
    render.episode.mockClear();
    render.episode.mockImplementationOnce(async (opts: any) => {
      opts.onWait(7);
      opts.onRetry("ENOENT");
      return opts.outputPath;
    });
    const state = await h.pipeline.run(id, { only: "short" });
    const opts = render.episode.mock.calls[0]![0];
    const short = opts.timeline;
    expect([short.width, short.height]).toEqual([1080, 1920]);
    // s2 2,4 sn'de başlar (s1 2 sn + 0,4 sn ara), bölüm 9 sn'de biter.
    expect(short.durationInFrames).toBe(198);
    expect(short.visuals.map((v: any) => [v.shotId, v.fromFrame, v.durationInFrames])).toEqual([
      ["s1-sh1", 0, 48],
      ["s1-sh2", 48, 90],
      ["s1-sh3", 138, 60],
    ]);
    expect(short.audio.map((a: any) => a.role).sort()).toEqual(["music", "sfx", "voice"]);
    expect(short.captions[0]).toMatchObject({ text: "bir", startMs: 0 });
    for (const a of short.audio) expect(existsSync(join(h.workDir, id, "public", ...a.assetUrl.split("/")))).toBe(true);
    expect(opts.outputPath).toBe(join(h.workDir, id, `${id}.short.mp4`));
    expect(state.short).toMatchObject({ path: opts.outputPath, title: "Short başlığı", scenes: ["s2"], sec: 7 });
    expect(h.logs).toContain(`  dikey Short (7 sn; sahneler: s2): ${opts.outputPath}`);
    expect(h.logs).toContain("  başka bir render sürüyor (süreç 7); sıra bekleniyor");
    // Bölümün kendi timeline'ı değişmez.
    expect(state.timeline!.width).toBe(1920);

    // İkinci çalıştırmada ses izleri zaten render klasöründe: yeniden indirilmez, Short yine çıkar.
    expect((await h.pipeline.run(id, { only: "short" })).short).toBeDefined();
  });

  it("efekt ve müzik kapalıysa kısa yalnız anlatımla; altyazı kapalıysa gömülmez; başlık paketten, o da yoksa konudan", async () => {
    const h = harness();
    // Short seçimi olmayan eski paket: aralık baştan, başlık paketin başlığı.
    const id = await prepared(h, { sfx: false, music: false, captions: false });
    const old = await h.pipeline.load(id);
    delete old.package!.short;
    await h.pipeline.save(old);
    const state = await h.pipeline.run(id, { only: "short" });
    const short = render.episode.mock.calls.at(-1)![0].timeline;
    expect(short.audio.map((a: any) => a.role)).toEqual(["voice", "voice"]);
    expect(short.captions).toEqual([]);
    expect(state.short).toMatchObject({ title: "Paket başlığı", scenes: ["s1", "s2"] });

    const h2 = harness();
    const bare = await prepared(h2, {}, null);
    expect((await h2.pipeline.run(bare, { only: "short" })).short!.title).toBe((await h2.pipeline.load(bare)).input.topic);
  });

  it("kapalıysa ya da bölüm zaten dikeyse Short yok; render düşerse bölüm yine hazır; eksik veri hata verir", async () => {
    const h = harness();
    const none = await h.seed(makeState());
    await expect(h.pipeline.run(none, { only: "short" })).rejects.toThrow("timeline/render/script/voice yok");

    const off = await prepared(h, { short: false });
    render.episode.mockClear();
    expect((await h.pipeline.run(off, { only: "short" })).short).toBeUndefined();
    expect(render.episode).not.toHaveBeenCalled();

    const vertical = await prepared(h, { width: 1080, height: 1920 });
    render.episode.mockClear();
    expect((await h.pipeline.run(vertical, { only: "short" })).short).toBeUndefined();
    expect(render.episode).not.toHaveBeenCalled();

    const id = await prepared(h);
    await h.pipeline.run(id, { only: "short" });
    render.episode.mockRejectedValueOnce(new Error("chrome yok"));
    // Yeniden denenip düşen Short eski kaydı bırakmaz.
    const failed = await h.pipeline.run(id, { only: "short" });
    expect(failed.short).toBeUndefined();
    expect(h.logs).toContain("⚠ Short üretilemedi (video hazır): chrome yok");
  });
});
