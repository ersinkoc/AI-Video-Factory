import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VectorShot, type Timeline } from "@ys/core";
import { describe, expect, it } from "vitest";
import { audioKey, CHUNK, chunkKeys, chunkRanges, renderCode } from "../src/chunks.ts";
import { CROSSFADE } from "../src/cut.ts";

const PUB = mkdtempSync(join(tmpdir(), "ys-chunks-"));
mkdirSync(join(PUB, "img"), { recursive: true });
writeFileSync(join(PUB, "img", "a.png"), "resim-a");
writeFileSync(join(PUB, "voice.wav"), "ses");

const vec = (asset: string, background?: string) => VectorShot.parse({ layers: [{ asset, x: 960 }], ...(background ? { background } : {}) });
const shot = (shotId: string, fromFrame: number, durationInFrames: number, extra: object = {}) => ({ shotId, fromFrame, durationInFrames, assetUrl: "", kind: "motion_graphic", ...extra }) as Timeline["visuals"][number];
const svg = (id: string, fill = "#000") => ({ id, kind: "prop", svg: `<svg><rect fill="${fill}"/></svg>`, width: 10, height: 10, meta: {} });

/** 30 fps; s1 (0–90, iki çekim), s2 (90–180), s3 (180–240, resim). */
const base = (): Timeline =>
  ({
    episodeId: "e1",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 240,
    palette: ["#111111"],
    visuals: [
      shot("s1-sh1", 0, 45, { vector: vec("hero", "room") }),
      shot("s1-sh2", 45, 45, { vector: vec("hero") }),
      shot("s2-sh1", 90, 90, { vector: vec("cup"), overlay: "math/b.webm" }),
      shot("s3-sh1", 180, 60, { kind: "still_motion", assetUrl: "img/a.png" }),
    ],
    vectorAssets: { hero: svg("hero"), "hero~side": svg("hero~side"), room: svg("room"), cup: svg("cup") },
    // Sayfalar: "bir iki üç" (0,1–6,5 sn; sayfa 1,4 sn dolana kadar kelime alır, sonraki sayfaya kadar sürer), "dört beş".
    captions: [
      { text: "bir", startMs: 100, endMs: 400 },
      { text: "iki", startMs: 1000, endMs: 1300 },
      { text: "üç", startMs: 2000, endMs: 2300 },
      { text: "dört", startMs: 6500, endMs: 6800 },
      { text: "beş", startMs: 7000, endMs: 7300 },
    ],
    speech: [
      { text: "bir", startMs: 100, endMs: 400 },
      { text: "üç", startMs: 7900, endMs: 7990 },
    ],
    audio: [{ role: "voice", assetUrl: "voice.wav", fromFrame: 0, durationInFrames: 240, volume: 1 }],
  }) as unknown as Timeline;

const keysOf = (t: Timeline, code = "c1") => chunkKeys(t, chunkRanges(t), PUB, code);

describe("render parçaları: aralıklar", () => {
  it("sahne sınırlarında bölünür; aralıklar art arda ve bölüm boyunca boşluksuz", () => {
    expect(chunkRanges(base())).toEqual([
      { from: 0, to: 90 },
      { from: 90, to: 180 },
      { from: 180, to: 240 },
    ]);
  });

  it("uzun sahne en yakın çekim sınırından bölünür; sahne öneki olmayan her çekim ayrı; sınır dışı ve geriye düşen başlangıç yok sayılır", () => {
    const long = { ...base(), durationInFrames: 5000 } as Timeline;
    const max = CHUNK.maxSec * 30;
    long.visuals = [shot("s1-sh1", 0, max - 10), shot("s1-sh2", max - 10, 100), shot("s1-sh3", max + 90, 100), shot("intro", max + 190, 10), shot("outro", max + 200, 10), shot("late", 6000, 10), shot("dup", max + 200, 5)];
    expect(chunkRanges(long).map((r) => r.from)).toEqual([0, max + 90, max + 190, max + 200]);
    expect(chunkRanges({ ...base(), visuals: [] } as unknown as Timeline)).toEqual([{ from: 0, to: 240 }]);
  });
});

describe("render parçaları: anahtarlar", () => {
  it("aynı girdi aynı anahtar; render kodu değişince hepsi değişir", async () => {
    const a = await keysOf(base());
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(await keysOf(base())).toEqual(a);
    expect((await keysOf(base(), "c2")).every((k, i) => k !== a[i])).toBe(true);
  });

  it("çekim değişince kendi parçası ve geçişle üstüne bindiği sonraki parça değişir; ötekiler önbellekten", async () => {
    const a = await keysOf(base());
    const t = base();
    t.visuals[1] = { ...t.visuals[1]!, vector: vec("cup") };
    const b = await keysOf(t);
    // s1-sh2, s2'nin ilk CROSSFADE karesinde de görünür.
    expect([b[0] !== a[0], b[1] !== a[1], b[2] === a[2]]).toEqual([true, true, true]);
    // s2'nin ortasındaki değişiklik yalnız kendi parçası (s3'ün ilk karelerine s2-sh1 binerek girer: o da değişir).
    const u = base();
    u.visuals[2] = { ...u.visuals[2]!, overlay: "math/c.webm" };
    const c = await keysOf(u);
    expect([c[0] === a[0], c[1] !== a[1], c[2] !== a[2]]).toEqual([true, true, true]);
    expect(CROSSFADE).toBeGreaterThan(0);
  });

  it("çizim, yan görünüşü ve arka planı yalnız onu kullanan parçayı değiştirir; resim dosyasının içeriği de", async () => {
    const a = await keysOf(base());
    const redraw = async (id: string) => {
      const t = base();
      t.vectorAssets = { ...t.vectorAssets, [id]: svg(id, "#fff") } as Timeline["vectorAssets"];
      const k = await keysOf(t);
      return k.map((x, i) => x !== a[i]);
    };
    // Arka plan yalnız s1-sh1'de; kahramanın yan görünüşü s1-sh2'de de (s2'nin ilk karelerine biner).
    expect(await redraw("room")).toEqual([true, false, false]);
    expect(await redraw("hero~side")).toEqual([true, true, false]);
    writeFileSync(join(PUB, "img", "a.png"), "resim-b");
    const k = await keysOf(base());
    writeFileSync(join(PUB, "img", "a.png"), "resim-a");
    expect([k[0] === a[0], k[1] === a[1], k[2] !== a[2]]).toEqual([true, true, true]);
  });

  it("konuşma ve altyazı yalnız yakın parçayı değiştirir; altyazısız bölüm, adresle gelen ve kayıp dosya, çekimsiz aralık", async () => {
    const a = await keysOf(base());
    const changed = async (t: Timeline) => (await keysOf(t)).map((x, i) => x !== a[i]);
    // s1'deki kelime (100 ms): s1 ve s1-sh2'nin bindiği s2 parçası 2 sn payla görür, s3 görmez.
    const said = base();
    said.speech = [{ text: "BİR", startMs: 100, endMs: 400 }, said.speech![1]!];
    expect(await changed(said)).toEqual([true, true, false]);
    // 6,5 sn'de başlayan altyazı sayfası yalnız s3 parçasında (6–8 sn) görünür.
    const shown = base();
    shown.captions = shown.captions.map((w) => (w.text === "dört" ? { ...w, text: "DÖRT" } : w));
    expect(await changed(shown)).toEqual([false, false, true]);
    const quiet = { ...base(), captions: [], speech: undefined } as unknown as Timeline;
    expect(await keysOf(quiet)).toHaveLength(3);
    const web = base();
    web.visuals[3] = { ...web.visuals[3]!, assetUrl: "https://example.com/a.png" };
    const lost = base();
    lost.visuals[3] = { ...lost.visuals[3]!, assetUrl: "img/yok.png" };
    expect(new Set([(await keysOf(web))[2], (await keysOf(lost))[2], a[2]]).size).toBe(3);
    const empty = { ...base(), visuals: [] } as unknown as Timeline;
    expect(await keysOf(empty)).toHaveLength(1);
  });

  it("ses anahtarı ses girdileri ve dosyalarıyla değişir", async () => {
    const t = base();
    const a = await audioKey(t, PUB, "c1");
    t.audio = [...t.audio, { ...t.audio[0]!, volume: 0.5 }];
    const b = await audioKey(t, PUB, "c1");
    writeFileSync(join(PUB, "voice.wav"), "yeni ses");
    const c = await audioKey(base(), PUB, "c1");
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("render kodu özeti", () => {
  it("kaynak dosyası değişince değişir; varsayılan kod bir kez hesaplanır", async () => {
    const root = mkdtempSync(join(tmpdir(), "ys-code-"));
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "a.ts"), "1");
    writeFileSync(join(root, "sub", "b.ts"), "2");
    writeFileSync(join(root, "pkg.json"), "{}");
    const a = await renderCode([root], [join(root, "pkg.json")]);
    writeFileSync(join(root, "sub", "b.ts"), "3");
    expect(await renderCode([root], [join(root, "pkg.json")])).not.toBe(a);
    const real = await renderCode();
    expect(real).toMatch(/^[0-9a-f]{16}$/);
    expect(await renderCode()).toBe(real);
  });
});
