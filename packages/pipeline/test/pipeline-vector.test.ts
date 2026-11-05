import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetRejectedError, type EpisodeState, type PlannedShotState } from "../src/index.ts";
import { ICONIC_PROP } from "../src/pipeline.ts";
import { callsOf, geo, onAgent, refs, render, resetFakes } from "./pipeline-fakes.ts";
import { CAST, CHARACTER_SVG, harness, makeState, PROP_SVG, ROOM_SVG, SCRIPT, STYLE, voiceOf, vshot, type Harness } from "./pipeline-harness.ts";

vi.mock("@ys/agents", async (orig) => (await import("./pipeline-fakes.ts")).mockAgents(await orig()));
vi.mock("@ys/video/render", async () => {
  const f = await import("./pipeline-fakes.ts");
  return f.renderModule();
});
// Animasyon denetimi kendi testlerinde (video/test/lint.test.ts); burada bulguların pipeline'da ne yaptığı.
type LintFinding = { code: string; shotId: string; layer?: number; detail: string; replan: boolean };
const lint = vi.hoisted(() => ({ shot: vi.fn((_v: { shotId: string; vector?: unknown }): LintFinding[] => []) }));
vi.mock("@ys/video/lint", () => ({ lintShot: (v: { shotId: string; vector?: unknown }) => lint.shot(v) }));
vi.mock("../src/reference.ts", async (orig) => {
  const f = await import("./pipeline-fakes.ts");
  return {
    ...(await orig<object>()),
    findReferences: (...a: any[]) => f.refs.find(...a),
    findVectorSources: (...a: any[]) => f.refs.vectors(...a),
    rasterizeSvg: (...a: any[]) => f.refs.rasterize(...a),
  };
});
const hist = vi.hoisted(() => ({ load: vi.fn(async (): Promise<unknown[]> => [{ name: "Ottoman Empire" }]) }));
vi.mock("../src/history.ts", async (orig) => ({ ...(await orig<object>()), loadHistory: () => hist.load() }));
vi.mock("../src/geo.ts", async (orig) => {
  const f = await import("./pipeline-fakes.ts");
  return { ...(await orig<object>()), generateMap: (...a: any[]) => f.geo.map(...a), generateFlag: (...a: any[]) => f.geo.flag(...a) };
});

/**
 * Vektör modunun aşamaları: konsept (kütüphaneden tekrar kullanım, devam, yeni tur, ret), çekim planı (bilinmeyen
 * katmanların atılması, indeks yeniden eşleme), nesne çizimi (harita/bayrak gerçek veriden), taslak denetimi ve yeniden
 * planlama, önizleme kareleri ve timeline varlıkları. Ajanlar, Remotion ve coğrafya üreticisi sahtedir.
 */

const MAP = { projection: "flat" as const, focus: ["USA"], highlight: [], markers: [], routes: [] };

function agents(o: { score?: (name: string) => number } = {}) {
  onAgent("assetPlanner", (b: { name: string }) => ({ subject: b.name, moved: [], cues: [] }));
  onAgent("vectorDesigner", (b: { kind: string }) =>
    b.kind === "character"
      ? { svg: CHARACTER_SVG, realHeight: 1.7, grounded: true }
      : b.kind === "background"
        ? { svg: ROOM_SVG, realHeight: 3, grounded: true, floorY: 700 }
        : { svg: PROP_SVG, realHeight: 0.4, grounded: true },
  );
  onAgent("assetGuess", () => ({ guess: "something", confidence: 7 }));
  onAgent("assetGate", (g: { name: string }) => ({ recognizable: o.score?.(g.name) ?? 9, fidelity: null, defects: [] }));
}

const LIB_A = `library/vector/character/${"a".repeat(32)}.svg`;
const LIB_B = `library/vector/character/${"b".repeat(32)}.svg`;
function putLibraryCharacter(h: Harness, key: string, name: string, episodes: string[] = []) {
  h.store.putText(key, CHARACTER_SVG);
  h.store.putJsonSync(`${key}.json`, {
    realHeight: 1.7,
    check: { kind: "character", name, recognizable: 9, passed: true },
    identity: { name, description: `${name} desc`, artStyle: STYLE.artStyle, lineStyle: "outline", episodes },
  });
}

const CAST2 = {
  characters: [
    { id: "c1", name: "Host", kind: "person", role: "host", visualDescription: "channel host", scenes: ["s1"], reuse: "a".repeat(32) },
    { id: "c2", name: "Rider", kind: "person", role: "rider", visualDescription: "young rider", scenes: ["s1"] },
  ],
  locations: [{ id: "l1", name: "Station", visualDescription: "relay station", scenes: ["s1"] }],
} as EpisodeState["cast"];

const afterCast = (input: object = {}, extra: Partial<EpisodeState> = {}) =>
  makeState(
    { motionMode: "vector", lineStyle: "outline", ...input },
    { style: STYLE, script: SCRIPT, cast: CAST2, done: { style: "x", story: "x", script: "x", cast: "x" }, approvals: { script: "x" }, ...extra },
  );

beforeEach(() => {
  resetFakes();
  hist.load.mockClear();
  lint.shot.mockReset();
  lint.shot.mockImplementation(() => []);
  refs.find.mockResolvedValue({ images: [], sources: [], keys: [] });
  refs.vectors.mockResolvedValue([]);
  refs.rasterize.mockResolvedValue({ data: new Uint8Array([1]), mimeType: "image/png" });
  geo.map.mockResolvedValue({ svg: '<svg viewBox="0 0 1920 1080"><rect width="10" height="10"/></svg>', width: 1920, height: 1080, meta: { exact: true } });
  geo.flag.mockResolvedValue({ svg: '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#e30a17"/></svg>', width: 30, height: 20, meta: { exact: true } });
});

describe("vektör konsept", () => {
  it("kütüphane karakteri çizilmeden seçilir, diğerleri çizilir; seçilen karakter bölümle anılır", async () => {
    const h = harness();
    agents();
    putLibraryCharacter(h, LIB_A, "Host");
    const id = await h.seed(afterCast());
    const state = await h.pipeline.run(id, { until: "concept" });
    expect(state.concept!.round).toBe(0);
    expect(state.concept!.selected.c1).toEqual({ key: LIB_A, mimeType: "image/svg+xml" });
    expect(state.concept!.selected.c2!.key).toMatch(/^library\/vector\/character\//);
    expect(state.concept!.selected.l1!.key).toMatch(/^library\/vector\/background\//);
    expect(state.assetChecks![LIB_A]).toMatchObject({ passed: true, entityId: "c1" });
    expect(h.logs).toContain("  ♻ Host: kütüphaneden (0 bölümde kullanıldı), çizilmedi");
    expect(h.store.json(`${LIB_A}.json`).identity.episodes).toEqual([id]);
    expect(h.store.json(`${state.concept!.selected.c2!.key}.json`).identity.episodes).toEqual([id]);
    // Tasarımcıya yalnız c2 ve l1 gitti; ilk turda çeşitleme yok.
    expect(callsOf("vectorDesigner").map((c) => (c.args[0] as { name: string; variation?: number }).name).sort()).toEqual(["Rider", "Station"]);
    expect(callsOf("vectorDesigner").every((c) => (c.args[0] as { variation?: number }).variation === undefined)).toBe(true);
  });

  it("devam: yalnız seçimi olmayan varlıklar çizilir, önceki seçimler korunur", async () => {
    const h = harness({ concurrency: 1 });
    agents();
    putLibraryCharacter(h, LIB_A, "Host");
    const station = { key: "library/vector/background/old.svg", mimeType: "image/svg+xml" };
    const id = await h.seed(
      afterCast({}, { concept: { candidates: { c1: [{ key: LIB_A, mimeType: "image/svg+xml" }], l1: [station] }, selected: { c1: { key: LIB_A, mimeType: "image/svg+xml" }, l1: station } } }),
    );
    const state = await h.pipeline.run(id, { until: "concept" });
    expect(h.logs).toContain("  devam: 1 eksik varlık çizilecek, 2 hazır");
    expect(state.concept!.candidates.c1).toHaveLength(1);
    expect(state.concept!.selected.l1).toEqual(station);
    expect(callsOf("vectorDesigner")).toHaveLength(1);
  });

  it("devam: kütüphaneden gelen çizim adaylarda zaten varsa ikinci kez eklenmez", async () => {
    const h = harness();
    agents();
    const first = await h.pipeline.run(await h.seed(afterCast({}, { cast: { characters: [CAST2!.characters[1]!], locations: [] } })), { until: "concept" });
    const rider = first.concept!.selected.c2!;
    // İnsan seçimi kaldırdı (aday duruyor): devam aynı çizimi kütüphaneden bulur.
    const id = await h.seed(afterCast({}, { cast: { characters: [CAST2!.characters[1]!], locations: [] }, concept: { candidates: { c2: [rider] }, selected: {} } }));
    const state = await h.pipeline.run(id, { until: "concept" });
    expect(state.concept!.candidates.c2).toEqual([rider]);
    expect(state.concept!.selected.c2).toEqual(rider);
    expect(callsOf("vectorDesigner")).toHaveLength(1);
  });

  it("yeni adaylar: yeni çeşitleme çizilir (kütüphane karakteri dahil), mevcut seçim değişmez", async () => {
    const h = harness();
    agents();
    putLibraryCharacter(h, LIB_A, "Host");
    const old = { key: "library/vector/character/old.svg", mimeType: "image/svg+xml" };
    const id = await h.seed(afterCast({}, { concept: { candidates: { c2: [old] }, selected: { c2: old } } }));
    const state = await h.pipeline.run(id, { only: "concept" });
    expect(state.concept!.round).toBe(1);
    expect(callsOf("vectorDesigner")).toHaveLength(3);
    expect(callsOf("vectorDesigner").every((c) => (c.args[0] as { variation?: number }).variation === 1)).toBe(true);
    expect(state.concept!.candidates.c2).toHaveLength(2);
    expect(state.concept!.selected.c2).toEqual(old);
    // Kütüphane karakteri de yeni aday aldı; önceki turda seçimi olmadığı için en yeni çeşitleme seçilir.
    expect(state.concept!.candidates.c1!.map((r) => r.key)[0]).toBe(LIB_A);
    expect(state.concept!.candidates.c1).toHaveLength(2);
    expect(state.concept!.selected.c1).toEqual(state.concept!.candidates.c1![1]);
  });

  it("reddedilen varlık: Stüdyo bölümü bekler, otomatik onaylı bölüm durur", async () => {
    const h = harness();
    agents({ score: (name) => (name === "Rider" ? 2 : 9) });
    const id = await h.seed(afterCast());
    const state = await h.pipeline.run(id, { until: "concept" });
    expect(state.concept!.selected.c2).toBeUndefined();
    expect(state.done.concept).toBeDefined();
    expect(h.logs).toContain("  ⏸ kalite kapısı: Rider reddedildi; Stüdyo'da kabul et ya da notla yeniden çizdir");

    const auto = await h.seed(afterCast({ autoApprove: true }));
    await expect(h.pipeline.run(auto, { until: "concept" })).rejects.toThrow(AssetRejectedError);
    expect((await h.load(auto)).lastError!.message).toMatch(/^Kalite kapısı: Rider kabul edilebilir çizilemedi/);
  });

  it("ret dışı hata konsepti durdurur (devam edince yeniden denensin)", async () => {
    const h = harness();
    agents();
    onAgent("assetGuess", () => {
      throw new Error("ajan çöktü");
    });
    const id = await h.seed(afterCast());
    await expect(h.pipeline.run(id, { until: "concept" })).rejects.toThrow("ajan çöktü");
  });

  it("stilsiz ve boş kadroda kütüphaneye bakılmaz", async () => {
    const h = harness();
    const id = await h.seed(makeState({ motionMode: "vector" }, { cast: { characters: [], locations: [] } }));
    const state = await h.pipeline.run(id, { only: "concept" });
    expect(state.concept).toMatchObject({ candidates: {}, selected: {}, round: 0 });
  });

  it("kadro: aynı serinin kütüphane karakterleri önce önerilir", async () => {
    const h = harness();
    const sibling = makeState({ series: "Posta" });
    await h.seed(sibling);
    // B daha çok bölümde kullanılmış (normalde önce), A ise serinin bölümünde.
    putLibraryCharacter(h, LIB_A, "Host", [sibling.id]);
    putLibraryCharacter(h, LIB_B, "Guest", ["x", "y"]);
    let seen: string[] = [];
    onAgent("castingDirector", (_s: unknown, _st: unknown, _d: unknown, library: { id: string }[]) => {
      seen = library.map((l) => l.id);
      return CAST;
    });
    const id = await h.seed(afterCast({ series: "posta" }, { cast: undefined }));
    await h.pipeline.run(id, { only: "cast" });
    expect(seen).toEqual(["a".repeat(32), "b".repeat(32)]);
  });
});

describe("vektör çekim planı", () => {
  const voiced = (input: object = {}, extra: Partial<EpisodeState> = {}) =>
    afterCast(input, { cast: CAST, voice: { s1: voiceOf("s1"), s2: voiceOf("s2") }, ...extra });

  it("kadro yoksa hata", async () => {
    const h = harness();
    const id = await h.seed(voiced({}, { cast: undefined }));
    await expect(h.pipeline.run(id, { only: "shots" })).rejects.toThrow("script/style/cast/voice yok");
  });

  it("bir sahne düşerse planlanmış sahneler kaydedilir; devamda girdisi değişmeyen sahne yeniden planlanmaz", async () => {
    const h = harness({ concurrency: 1 });
    let failS2 = true;
    onAgent("vectorDirector", (input: { scene: { id: string } }) => {
      if (input.scene.id === "s2" && failS2) throw new Error("yönetmen düştü");
      return { shots: [{ startWord: 0, description: input.scene.id, ambience: "none", spec: vshot({ layers: [{ asset: "c1", x: 500, depth: 0.5 }] }) }], newProps: [], newBackgrounds: [] };
    });
    const id = await h.seed(voiced());
    await expect(h.pipeline.run(id, { only: "shots" })).rejects.toThrow("yönetmen düştü");
    expect(Object.keys((await h.load(id)).shotPlanDraft!)).toEqual(["s1"]);

    failS2 = false;
    const state = await h.pipeline.run(id, { only: "shots" });
    expect(callsOf("vectorDirector").map((c) => (c.args[0] as { scene: { id: string } }).scene.id)).toEqual(["s1", "s2", "s2"]);
    expect(h.logs).toContain("  s1: önceki çalıştırmanın planı kullanıldı");
    expect(state.shotPlan!.scenes.map((s) => s.shots[0]!.description)).toEqual(["s1", "s2"]);
    expect(state.shotPlanDraft).toBeUndefined();
  });

  it("sahne sınırında aynı odada aynı kişiye aynı boyda art arda kesilmez: ikinci çekimin boyu değişir", async () => {
    const h = harness({ concurrency: 1 });
    onAgent("vectorDirector", () => ({
      shots: [{ startWord: 0, description: "d", ambience: "none", spec: vshot({ background: "l1", layers: [{ asset: "c1", x: 500, depth: 0.5 }], camera: { zoomFrom: 1, zoomTo: 1.1, panX: 0 } }) }],
      newProps: [],
      newBackgrounds: [],
    }));
    const id = await h.seed(voiced());
    const state = await h.pipeline.run(id, { only: "shots" });
    expect(state.shots!.map((s) => s.vector!.camera.zoomTo)).toEqual([1.1, 1.4]);
    expect(h.logs).toContain("  1 çekimin boyu değişti (aynı odada aynı kişilere art arda aynı boyda kesme)");
  });

  it("gerçek kişi bölümde ilk göründüğü çekimde adlandırılır; anlatılan nesne açıklamadan çıkarılır", async () => {
    const h = harness({ concurrency: 1 });
    onAgent("vectorDirector", () => ({
      shots: [{ startWord: 0, description: "Cody reads the letter", ambience: "none", spec: vshot({ layers: [{ asset: "c1", x: 500, depth: 0.5 }, { asset: "p-letter", x: 600, heldBy: 0 }] }) }],
      newProps: [{ id: "p-letter", description: "a letter" }],
      newBackgrounds: [],
    }));
    const cast = { ...CAST, characters: [{ ...CAST.characters[0]!, name: "William Cody", reference: "Buffalo Bill Cody" }] };
    const id = await h.seed(voiced({}, { cast }));
    const state = await h.pipeline.run(id, { only: "shots" });
    expect(state.shots!.map((s) => s.vector!.texts.map((t) => t.text))).toEqual([["William Cody"], []]);
    expect(state.shots!.every((s) => s.vector!.key === 1)).toBe(true);
    expect(h.logs).toContain("  1 kişiye bölümdeki ilk görünüşünde ad etiketi kondu");
  });

  it("sahnesiz senaryoda plan boş kalır", async () => {
    const h = harness();
    const id = await h.seed(voiced({}, { script: { scenes: [] } as never }));
    const state = await h.pipeline.run(id, { only: "shots" });
    expect(state.shots).toEqual([]);
    expect(h.logs).toContain("  0 vektör çekim, 0 nesne/mekân");
  });

  it("bilinmeyen katmanlar atılır, indeksler yeniden eşlenir, yeni nesne ve mekânlar kaydedilir", async () => {
    const h = harness({ concurrency: 1 });
    h.store.putJsonSync("library/lessons.json", { lessons: [{ target: "director", rule: "Keep it simple", count: 1, firstSeen: "x", lastSeen: "x", episodes: [] }] });
    onAgent("vectorDirector", (input: { scene: { id: string }; vertical: boolean; props: Record<string, string>; lessons: string[]; feedback?: string }) => {
      expect(input.vertical).toBe(true);
      expect(input.lessons).toEqual(["Keep it simple"]);
      expect(input.feedback).toBeUndefined();
      if (input.scene.id === "s1") {
        expect(input.props).toEqual({ "p-old": "old chest" });
        return {
          shots: [
            {
              startWord: 0,
              description: "rider with bag",
              ambience: "dust",
              spec: vshot({
                background: "b-map",
                layers: [
                  { asset: "c1", x: 500, depth: 0.5 },
                  { asset: "zzz", x: 1 },
                  { asset: "p-bag", x: 600, on: 0, heldBy: 1 },
                  { asset: "l1", x: 3 },
                ],
              }),
            },
            { startWord: 2, description: "old chest", ambience: "none", spec: vshot({ background: "l1", layers: [{ asset: "p-old", x: 5, depth: 0.3 }] }) },
          ],
          newProps: [
            { id: "p-bag", description: "mail bag", reference: "Pony Express mochila" },
            { id: "p-old", description: "should not overwrite" },
          ],
          newBackgrounds: [{ id: "b-map", description: "route map", map: MAP }],
        };
      }
      return {
        shots: [
          { startWord: 0, description: "bag on its own", ambience: "none", spec: vshot({ background: "p-bag", layers: [] }) },
          {
            startWord: 1,
            description: "crowd of clones",
            ambience: "none",
            spec: vshot({
              layers: [
                { asset: "c1", x: 300, anims: [{ type: "point", start: 0, end: 1, target: 2 }] },
                { asset: "c1", x: 900 },
                { asset: "p-bag", x: 1200 },
              ],
            }),
          },
        ],
        newProps: [],
        newBackgrounds: [],
      };
    });
    const id = await h.seed(voiced({ width: 1080, height: 1920 }, { vectorProps: { "p-old": { description: "old chest" } } }));
    const state = await h.pipeline.run(id, { only: "shots" });

    const [a, b, c, d] = state.shots as PlannedShotState[];
    expect(a!.vector!.layers.map((l) => [l.asset, l.on, l.heldBy])).toEqual([
      ["c1", undefined, undefined],
      ["p-bag", 0, undefined],
    ]);
    expect(a!.characterIds).toEqual(["c1"]);
    expect(a!.vector!.background).toBe("b-map");
    expect(a!.locationId).toBe("b-map");
    expect(b!).toMatchObject({ locationId: "l1", kind: "still_motion", camera: "static" });
    expect(c!.vector!.background).toBeUndefined();
    expect(c!.locationId).toBeUndefined();
    expect(d!.vector!.background).toBeUndefined();
    // Aynı karakterin kopyası atılır, point hedefi kalan katmana yeniden eşlenir.
    expect(d!.vector!.layers.map((l) => [l.asset, l.anims[0]?.target])).toEqual([
      ["c1", 1],
      ["p-bag", undefined],
    ]);
    expect(d!.characterIds).toEqual(["c1"]);
    expect(state.vectorProps!["p-old"]).toEqual({ description: "old chest" });
    expect(state.vectorProps!["p-bag"]).toMatchObject({ kind: "prop", reference: "Pony Express mochila" });
    expect(state.vectorProps!["b-map"]).toMatchObject({ kind: "background", map: MAP });
    expect(state.keyframes).toEqual({});
    expect(h.logs).toContain("  s1: 2 çekim, 2 yeni nesne, 1 yeni mekân, 2 bilinmeyen katman atıldı");
    expect(h.logs).toContain("  s2: 2 çekim, 0 yeni nesne, 0 yeni mekân, 1 kopya karakter atıldı");
    expect(h.logs).toContain("  4 vektör çekim, 3 nesne/mekân");
  });
});

/** Vektör çekimi olan, kare aşamasına hazır bölüm. */
function keyframeReady(h: Harness, input: object, extra: Partial<EpisodeState> = {}) {
  h.store.putText("lib/c1.svg", CHARACTER_SVG);
  h.store.putText("lib/l1.svg", ROOM_SVG);
  h.store.putJsonSync("lib/l1.svg.json", { floorY: 700 });
  h.store.putText("lib/done.svg", PROP_SVG);
  h.store.putText(voiceOf("s1").key, "mp3");
  h.store.putText(voiceOf("s2").key, "mp3");
  const shot = (id: string, sceneId: string, startMs: number, vector?: unknown): PlannedShotState => ({
    id,
    sceneId,
    kind: "still_motion",
    startMs,
    endMs: startMs + 1000,
    description: `desc ${id}`,
    imagePrompt: "",
    motionPrompt: "",
    camera: "static",
    ...(vector ? { vector: vshot(vector) } : {}),
  });
  return h.seed(
    afterCast(input, {
      cast: CAST,
      voice: { s1: voiceOf("s1"), s2: voiceOf("s2") },
      concept: { candidates: {}, selected: { c1: { key: "lib/c1.svg", mimeType: "image/svg+xml" }, l1: { key: "lib/l1.svg", mimeType: "image/svg+xml" } } },
      shots: [
        shot("s1-sh1", "s1", 0, { background: "b-map", layers: [{ asset: "p-flag", x: 300, depth: 0.4 }, { asset: "p-cup", x: 600, depth: 0.4 }, { asset: "p-done", x: 900, depth: 0.4 }] }),
        shot("s1-sh2", "s1", 1000, { background: "b-room", layers: [{ asset: "c1", x: 900, depth: 0.5 }] }),
        shot("s2-sh1", "s2", 2400),
      ],
      vectorProps: {
        "p-flag": { description: "Turkish flag", flag: { code: "tr", pole: true } },
        "b-map": { description: "route", kind: "background", map: MAP },
        "p-cup": { description: "a tea cup" },
        "b-room": { description: "empty office", kind: "background" },
        "p-unused": { description: "never used" },
        "p-done": { description: "done", key: "lib/done.svg" },
      },
      ...extra,
    }),
  );
}

describe("vektör nesneleri ve önizleme (kare denetimi kapalı)", () => {
  it("harita ve bayrak gerçek veriden, diğerleri tasarımcıdan; kullanılmayan çizilmez; önizleme kareleri saklanır", async () => {
    const h = harness();
    agents();
    const id = await keyframeReady(h, { qa: false });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    const props = state.vectorProps!;
    expect(props["p-flag"]!.key).toMatch(/^library\/vector\/geo\/[0-9a-f]{32}\.svg$/);
    expect(props["b-map"]!.key).toMatch(/^library\/vector\/geo\//);
    expect(props["p-cup"]!.key).toMatch(/^library\/vector\/prop\//);
    expect(props["b-room"]!.key).toMatch(/^library\/vector\/background\//);
    expect(props["p-unused"]!.key).toBeUndefined();
    expect(geo.map).toHaveBeenCalledWith(MAP, "tr", STYLE.palette, undefined);
    expect(hist.load).not.toHaveBeenCalled();
    expect(geo.flag).toHaveBeenCalledWith({ code: "tr", pole: true });
    expect(h.store.json(`${props["b-map"]!.key}.json`)).toEqual({ exact: true });
    expect(h.logs.some((l) => /^  b-map: harita gerçek veriden üretildi \(\d+ KB\)$/.test(l))).toBe(true);
    expect(h.logs.some((l) => l.startsWith("  p-flag: bayrak gerçek veriden üretildi"))).toBe(true);
    // Vektör çekimlerin önizleme kareleri (görsel modelsiz çekimin karesi yok).
    expect(Object.keys(state.stills!).sort()).toEqual(["s1-sh1", "s1-sh2"]);
    expect(h.logs).toContain("  önizleme: 3 çekim karesi");
    expect(state.keyframes).toEqual({});

    // Aynı harita başka bölümde yeniden üretilmez.
    const again = await keyframeReady(h, { qa: false });
    geo.map.mockClear();
    await h.pipeline.run(again, { only: "keyframes" });
    expect(geo.map).not.toHaveBeenCalled();
    expect(h.logs).toContain("  b-map: kütüphaneden (gerçek veri)");
  });

  it("yıllı harita o yılın sınır verisiyle üretilir; veri yüklenemezse sınırsız çizilir, anahtar ayrı kalır", async () => {
    const h = harness();
    agents();
    const past = { ...MAP, year: 1452 };
    const extra = (map: typeof past) => ({ vectorProps: { "b-map": { description: "route", kind: "background" as const, map } } });
    const state = await h.pipeline.run(await keyframeReady(h, { qa: false }, extra(past)), { only: "keyframes" });
    expect(geo.map).toHaveBeenCalledWith(past, "tr", STYLE.palette, [{ name: "Ottoman Empire" }]);
    const withData = state.vectorProps!["b-map"]!.key;

    hist.load.mockRejectedValueOnce(new Error("ağ yok"));
    geo.map.mockClear();
    const offline = await h.pipeline.run(await keyframeReady(h, { qa: false }, extra({ ...past, year: 1453 })), { only: "keyframes" });
    expect(geo.map).toHaveBeenCalledWith({ ...past, year: 1453 }, "tr", STYLE.palette, undefined);
    expect(h.logs).toContain("⚠ tarihî sınır verisi yüklenemedi, harita sınırsız çiziliyor (bugünün sınırları çizilmez): ağ yok");
    expect(offline.vectorProps!["b-map"]!.key).not.toBe(withData);
  });

  it("küre haritasının 3D dokusu da temizlenerek saklanır", async () => {
    const h = harness();
    agents();
    const texture = '<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="2048"><script>alert(1)</script><rect width="4096" height="2048" fill="#dfe8ea"/></svg>';
    geo.map.mockResolvedValue({ svg: '<svg viewBox="0 0 1920 1080"><g id="globe-base"><rect width="10" height="10"/></g></svg>', width: 1920, height: 1080, meta: { exact: true, globe: { lon: 35, lat: 39, cx: 960, cy: 480, r: 370, texture } } });
    const id = await keyframeReady(h, { qa: false });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    const meta = h.store.json(`${state.vectorProps!["b-map"]!.key}.json`) as { globe: { texture: string; r: number } };
    expect(meta.globe.r).toBe(370);
    expect(meta.globe.texture).toContain('fill="#dfe8ea"');
    expect(meta.globe.texture).not.toContain("script");
  });

  it("kesin sonuçlu hatalar nesneyi düşürür, diğer hatalar aşamayı durdurur", async () => {
    const h = harness();
    agents({ score: (name) => (name === "p-cup" ? 2 : 9) });
    geo.map.mockRejectedValue(new Error("ülke verisi yok"));
    geo.flag.mockRejectedValue("bilinmeyen bayrak");
    const id = await keyframeReady(h, { qa: false });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(state.vectorProps!["p-cup"]!.key).toBeUndefined();
    const line = h.logs.find((l) => l.includes("nesne çizilemedi"))!;
    expect(line).toMatch(/^  3 nesne çizilemedi, sahnelerden çıkarılacak:/);
    expect(line).toContain("b-map: ülke verisi yok");
    expect(line).toContain("p-flag: bilinmeyen bayrak");
    expect(line).toContain("p-cup: p-cup: kalite kapısı geçilemedi");

    onAgent("assetGuess", () => {
      throw new Error("ağ hatası");
    });
    const failing = await keyframeReady(h, { qa: false }, { vectorProps: { "p-cup": { description: "another cup" } } });
    await expect(h.pipeline.run(failing, { only: "keyframes" })).rejects.toThrow("ağ hatası");
  });

  describe("ana nesne (en az iki çekimde) kapıdan geçemezse", () => {
    const KEY_PROP = { description: "a mid-century teleprinter" };
    // s1'in üç çekimi: ikisinde ana nesne var; biri arka plansız.
    const keyShots = (h: Harness, gate: (description: string) => number) => {
      agents();
      onAgent("assetGate", (g: { name: string; description: string }) => ({ recognizable: g.name === "p-key" ? gate(g.description) : 9, fidelity: null, defects: ["looks like a typewriter"] }));
      const shot = (id: string, startMs: number, vector: unknown): PlannedShotState =>
        ({ id, sceneId: "s1", kind: "still_motion", startMs, endMs: startMs + 500, description: id, imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot(vector) }) as PlannedShotState;
      return keyframeReady(
        h,
        { qa: false },
        {
          vectorProps: { "p-key": { ...KEY_PROP }, "b-room": { description: "empty office", kind: "background" } },
          shotPlan: { scenes: [{ sceneId: "s1", shots: [] }, { sceneId: "s2", shots: [] }] } as never,
          shots: [
            shot("s1-sh1", 0, { background: "b-room", layers: [{ asset: "p-key", x: 600, depth: 0.4 }, { asset: "c1", x: 1100, depth: 0.4 }] }),
            shot("s1-sh2", 500, { layers: [{ asset: "p-key", x: 600, depth: 0.4 }] }),
            shot("s1-sh3", 1000, { background: "b-room", layers: [{ asset: "c1", x: 900, depth: 0.5 }] }),
            // Vektörsüz çekim (s2): ana nesneyi kullanmaz.
            { id: "s2-sh1", sceneId: "s2", kind: "still_motion", startMs: 2400, endMs: 3000, description: "s2", imagePrompt: "", motionPrompt: "", camera: "static" } as PlannedShotState,
          ],
        },
      );
    };

    it("bir kez sade, ikon gibi bir tarifle (aynı referans aramasıyla) yeniden çizilir; geçerse çekimde kalır", async () => {
      const h = harness({ concurrency: 1 });
      const id = await keyShots(h, (d) => (d.includes(ICONIC_PROP) ? 9 : 2));
      const state = await h.pipeline.run(id, { only: "keyframes" });
      const p = state.vectorProps!["p-key"]!;
      expect(p.key).toMatch(/^library\/vector\/prop\//);
      expect(p.rejected).toBeUndefined();
      expect(p.retried).toBe(true);
      expect(h.logs).toContain("  p-key 2 çekimde geçiyor ve kalite kapısından geçemedi: daha sade, ikon gibi bir çizimle bir kez daha deneniyor");
      expect(h.logs.some((l) => l.includes("nesne çizilemedi"))).toBe(false);
      // İkinci denemenin tarifi sade; referans araması aynı.
      const keyDraws = callsOf("vectorDesigner").filter((c) => (c.args[0] as { name: string }).name === "p-key");
      expect((keyDraws.at(-1)!.args[0] as { description: string }).description).toBe(`${KEY_PROP.description} ${ICONIC_PROP}`);
      const queries = refs.find.mock.calls.map((c) => c[0]);
      expect(new Set(queries.filter((q) => /teleprinter/i.test(String(q)))).size).toBe(1);
      expect(callsOf("vectorDirector")).toHaveLength(0);
    });

    it("sade çizim de geçemezse onu kullanan sahne onsuz yeniden planlanır; bölümde ikinci kez denenmez", async () => {
      const h = harness({ concurrency: 1 });
      const id = await keyShots(h, () => 2);
      let feedback = "";
      // Yönetmen bir çekimde nesneyi yine kullanır: tek çekimde kalan nesne yeniden denenmez, çekimden düşer.
      onAgent("vectorDirector", (input: { scene: { id: string }; feedback?: string; props: Record<string, string> }) => {
        feedback = input.feedback ?? "";
        expect(input.props["p-key"]).toBeUndefined();
        return {
          shots: [
            { startWord: 0, description: "without", ambience: "none", spec: vshot({ background: "b-room", layers: [{ asset: "c1", x: 900, depth: 0.5 }] }) },
            { startWord: 1, description: "still", ambience: "none", spec: vshot({ background: "b-room", layers: [{ asset: "p-key", x: 600, depth: 0.4 }] }) },
          ],
          newProps: [],
          newBackgrounds: [],
        };
      });
      const state = await h.pipeline.run(id, { only: "keyframes" });
      expect(state.vectorProps!["p-key"]).toMatchObject({ rejected: true, retried: true });
      expect(state.vectorProps!["p-key"]!.key).toBeUndefined();
      expect(h.logs).toContain("⚠ ana nesne çizilemedi (p-key), 2 çekimde geçiyordu: s1 sahnesi onsuz yeniden planlanıyor");
      expect(callsOf("vectorDirector")).toHaveLength(1);
      // Yalnız nesneyi kullanan çekimler için not; tarifiyle.
      expect(feedback.split("\n")).toHaveLength(2);
      expect(feedback).toContain("- shot 1: p-key (a mid-century teleprinter) could not be drawn and is not available.");
      expect(feedback).toContain("- shot 2: p-key");
      expect(state.shotPlan!.scenes[0]!.shots.map((s) => s.description)).toEqual(["without", "still"]);
      expect(state.shots!.map((s) => s.description)).toEqual(["without", "still"]);
      // Sade tarifle tek deneme turu: aynı bölümde yeniden çizilmedi.
      const iconic = callsOf("vectorDesigner").filter((c) => (c.args[0] as { description: string }).description.includes(ICONIC_PROP));
      expect(iconic.length).toBeGreaterThan(0);
      expect(iconic.length).toBeLessThanOrEqual(2);
      expect(h.logs.filter((l) => l.includes("ikon gibi bir çizimle"))).toHaveLength(1);
    });

    it("sade çizimde ağ hatası aşamayı durdurur; denenmiş sayılmaz", async () => {
      const h = harness({ concurrency: 1 });
      const id = await keyShots(h, (d) => {
        if (d.includes(ICONIC_PROP)) throw new Error("ağ hatası");
        return 2;
      });
      await expect(h.pipeline.run(id, { only: "keyframes" })).rejects.toThrow("ağ hatası");
      expect((await h.load(id)).vectorProps!["p-key"]).toMatchObject({ rejected: true });
      expect((await h.load(id)).vectorProps!["p-key"]!.retried).toBeUndefined();
    });
  });

  it("çizim sürerken varlıkları hazır olan çekimin karesi hemen çıkarılır; ilk hatadan sonra denenmez", async () => {
    const h = harness({ concurrency: 1 });
    agents();
    const id = await keyframeReady(h, { qa: false });
    render.stills.mockClear();
    await h.pipeline.run(id, { only: "keyframes" });
    // Sıra: p-flag, b-map, p-cup (s1-sh1 hazır), b-room (s1-sh2 hazır), sonra hepsinin önizlemesi.
    expect(render.stills.mock.calls.map((c) => Object.keys(c[0].frames).sort())).toEqual([["s1-sh1"], ["s1-sh2"], ["s1-sh1", "s1-sh2"]]);

    const again = await keyframeReady(h, { qa: false }, { vectorProps: { "p-cup": { description: "a tea cup" }, "b-room": { description: "empty office", kind: "background" } } });
    render.stills.mockClear();
    render.stills.mockRejectedValueOnce(new Error("chrome yok"));
    const state = await h.pipeline.run(again, { only: "keyframes" });
    expect(render.stills).toHaveBeenCalledTimes(2);
    expect(h.logs).toContain("  önizleme kareleri çıkarılamadı (chrome yok)");
    expect(Object.keys(state.stills!).sort()).toEqual(["s1-sh1", "s1-sh2"]);
  });

  it("önizleme çıkarılamazsa üretim sürer (Error, düz değer, ses yok)", async () => {
    const h = harness();
    agents();
    render.stills.mockRejectedValueOnce(new Error("chrome yok"));
    const id = await keyframeReady(h, { qa: false }, { vectorProps: {} });
    await h.pipeline.run(id, { only: "keyframes" });
    expect(h.logs).toContain("  önizleme kareleri çıkarılamadı (chrome yok)");

    render.stills.mockRejectedValueOnce("düz");
    await h.pipeline.run(id, { only: "keyframes" });
    expect(h.logs).toContain("  önizleme kareleri çıkarılamadı (düz)");

    const mute = await keyframeReady(h, { qa: false }, { vectorProps: {}, voice: undefined });
    await h.pipeline.run(mute, { only: "keyframes" });
    expect(h.logs.at(-1)).toMatch(/^  önizleme kareleri çıkarılamadı \(Timeline için/);
  });
});

describe("vektör taslak denetimi (kare denetimi açık)", () => {
  it("ses yoksa taslak denetimi yapılmaz", async () => {
    const h = harness();
    agents();
    const id = await keyframeReady(h, {}, { voice: undefined, vectorProps: undefined });
    await h.pipeline.run(id, { only: "keyframes" });
    expect(render.stills).not.toHaveBeenCalled();
  });

  it("taslak kareler çıkarılamazsa denetim atlanır (Error ilk satırı, düz değer)", async () => {
    const h = harness();
    agents();
    render.stills.mockRejectedValueOnce(new Error("tarayıcı açılamadı\nayrıntı"));
    const id = await keyframeReady(h, {}, { vectorProps: {} });
    await h.pipeline.run(id, { only: "keyframes" });
    expect(h.logs).toContain("  ⚠ taslak kareler çıkarılamadı, taslak denetimi atlandı: tarayıcı açılamadı");
    render.stills.mockRejectedValueOnce("düz");
    await h.pipeline.run(id, { only: "keyframes" });
    expect(h.logs).toContain("  ⚠ taslak kareler çıkarılamadı, taslak denetimi atlandı: düz");
  });

  it("iyi taslakta yeniden planlama yok; kareler Çekimler sekmesine yazılır", async () => {
    const h = harness();
    agents();
    h.store.putJsonSync("library/lessons.json", { lessons: [{ target: "designer", rule: "Thick outlines", count: 1, firstSeen: "x", lastSeen: "x", episodes: [] }] });
    onAgent("sceneCritic", (items: { shotId: string }[], known: string[]) => {
      expect(known).toEqual(["Thick outlines"]);
      return { shots: items.map((i) => ({ shotId: i.shotId, score: 8, issues: [] })), lessons: [] };
    });
    const id = await keyframeReady(h, {}, { vectorProps: {} });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(state.draftReview).toMatchObject({ avg: 8, revisedScenes: [] });
    expect(Object.keys(state.stills!).sort()).toEqual(["s1-sh1", "s1-sh2"]);
    expect(h.logs).toContain("  taslak: 2 kare, ortalama 8.0/10; yeniden planlanacak sahne: 0");
    expect(callsOf("vectorDirector")).toHaveLength(0);
    // Tasarımcı dersleri de verildi (kütüphane defterinden).
  });

  it("sorunlu sahne eleştiri ve kod düzeltmeleriyle yeniden planlanır; yeni nesneler çizilir, eski kareler silinir", async () => {
    const h = harness({ concurrency: 2 });
    agents();
    onAgent("sceneCritic", (items: { shotId: string }[]) => ({
      shots: items
        .filter((i) => i.shotId !== "s1-sh2")
        .map((i) => (i.shotId === "s1-sh1" ? { shotId: i.shotId, score: 4, issues: [{ type: "character_floating", detail: "floats" }] } : { shotId: i.shotId, score: 9, issues: i.shotId.startsWith("s2") ? [{ type: "repetitive", detail: "same pose" }] : [] })),
      lessons: [],
    }));
    onAgent("vectorDirector", () => ({
      shots: [{ startWord: 0, description: "fixed", ambience: "none", spec: vshot({ background: "l1", layers: [{ asset: "p-lamp", x: 500, depth: 0.4 }] }) }],
      newProps: [{ id: "p-lamp", description: "an oil lamp" }],
      newBackgrounds: [],
    }));
    const id = await keyframeReady(
      h,
      {},
      {
        vectorProps: {},
        shotPlan: {
          scenes: [
            { sceneId: "s1", shots: [] },
            { sceneId: "s2", shots: [{ startWord: 0, characterIds: [], locationId: "", kind: "still_motion", description: "d", imagePrompt: "", motionPrompt: "", camera: "static", ambience: "none", vector: vshot({ layers: [] }) }] },
          ],
        } as never,
        shots: [
          // Derinliksiz katman: kod piksel konumunu derinliğe çevirir (yönetmene "code had to fix" olarak döner).
          { id: "s1-sh1", sceneId: "s1", kind: "still_motion", startMs: 0, endMs: 700, description: "a", imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot({ background: "l1", layers: [{ asset: "c1", x: 500 }] }) },
          { id: "s1-sh2", sceneId: "s1", kind: "still_motion", startMs: 700, endMs: 1400, description: "b", imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot({ layers: [{ asset: "c1", x: 900 }] }) },
          { id: "s1-sh3", sceneId: "s1", kind: "still_motion", startMs: 1400, endMs: 2000, description: "c", imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot({ layers: [{ asset: "c1", x: 900, depth: 0.5 }] }) },
          { id: "s2-sh1", sceneId: "s2", kind: "still_motion", startMs: 2400, endMs: 3000, description: "d", imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot({ layers: [] }) },
          { id: "s2-x", sceneId: "s2", kind: "still_motion", startMs: 3000, endMs: 3400, description: "e", imagePrompt: "", motionPrompt: "", camera: "static" },
        ],
        // Görsel modelden kalma klip: timeline'da vektörsüz görsel (yerleşim düzeltmesi yok).
        clips: { "s2-x": { key: "lib/clip.mp4", mimeType: "video/mp4", durationSec: 5 } },
      },
    );
    const state = await h.pipeline.run(id, { only: "keyframes" });

    const feedback = (callsOf("vectorDirector")[0]!.args[0] as { feedback: string }).feedback;
    expect(feedback.split("\n")).toEqual([
      "- shot 1 (score 4): character_floating: floats; code had to fix: layer 0: piksel konumu derinliğe çevrildi",
      "- shot 2 (score ?): code had to fix: layer 0: piksel konumu derinliğe çevrildi",
    ]);
    expect(state.draftReview).toMatchObject({ revisedScenes: ["s1"] });
    expect(state.draftReview!.avg).toBeCloseTo(7.75, 2);
    expect(h.logs).toContain("  s1 (düzeltme): 1 çekim, 1 yeni nesne, 0 yeni mekân");
    // Yeni plan: s1 tek çekim; s2 planı olduğu gibi (klip çekimi planda yok, düşer).
    expect(state.shots!.map((s) => s.id)).toEqual(["s1-sh1", "s2-sh1"]);
    expect(state.shotPlan!.scenes[0]!.shots).toHaveLength(1);
    expect(state.vectorProps!["p-lamp"]!.key).toMatch(/^library\/vector\/prop\//);
    // Yeniden planlanan çekimin karesi yeniden çıkarıldı, ölü çekimlerin kareleri silindi, değişmeyen sahne korundu.
    expect(Object.keys(state.stills!).sort()).toEqual(["s1-sh1", "s2-sh1"]);
    expect(render.stills.mock.calls.at(-1)![0].frames).toEqual({ "s1-sh1": expect.any(Number) });
    expect(h.logs).toContain("  önizleme: 1 çekim karesi");
  });

  it("yapımcının notu: yalnız notlu sahne notla yeniden planlanır, otomatik düzeltme turları yapılmaz, önizlemeler yenilenir", async () => {
    const h = harness();
    agents();
    // Normal çalıştırmada s2'yi yeniden planlatacak bir animasyon kusuru: notlu çalıştırmada denetim yapılmaz.
    lint.shot.mockImplementation((v) => (v.shotId === "s2-sh1" ? [{ code: "face_cut", shotId: "s2-sh1", detail: "x", replan: true }] : []));
    onAgent("vectorDirector", () => ({ shots: [{ startWord: 0, description: "map 1453", ambience: "none", spec: vshot({ layers: [] }) }], newProps: [], newBackgrounds: [] }));
    const shot = (id: string, sceneId: string, startMs: number, description: string) => ({ id, sceneId, kind: "still_motion", startMs, endMs: startMs + 500, description, imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot({ layers: [] }) });
    const planned = { startWord: 0, characterIds: [], locationId: "", kind: "still_motion", description: "other", imagePrompt: "", motionPrompt: "", camera: "static", ambience: "none", vector: vshot({ layers: [] }) };
    const id = await keyframeReady(h, {}, {
      vectorProps: {},
      shotPlan: { scenes: [{ sceneId: "s1", shots: [] }, { sceneId: "s2", shots: [planned] }] } as never,
      shots: [shot("s1-sh1", "s1", 0, "wide map"), shot("s1-sh2", "s1", 700, "close-up"), shot("s2-sh1", "s2", 2400, "other")] as never,
      replans: {
        s1: { note: "Harita 1453 olsun", shots: ["s1-sh2"], findings: ["- shot 2 (3/10): empty: bare wall"], at: "2026-11-04T00:00:00Z" },
        // Notsuz toplu düzeltme: yalnız bulgular (eski kayıtta bulgu alanı yok).
        s2: { note: "", shots: ["s2-sh1"], at: "2026-11-04T00:00:00Z" },
      },
      review: { at: "t", lessons: [], shots: { "s1-sh2": { score: 3, issues: [{ type: "empty", detail: "bare wall" }] }, "s0-x": { score: 9, issues: [] } } },
      draftReview: { at: "t", lessons: [], avg: 5, revisedScenes: [], shots: { "s1-sh1": { score: 5, issues: [] } } },
    });
    const state = await h.pipeline.run(id, { only: "keyframes" });

    const calls = callsOf("vectorDirector");
    expect(calls.map((c) => (c.args[0] as { scene: { id: string } }).scene.id).sort()).toEqual(["s1", "s2"]);
    const feedbackOf = (scene: string) => (calls.find((c) => (c.args[0] as { scene: { id: string } }).scene.id === scene)!.args[0] as { feedback: string }).feedback;
    expect(feedbackOf("s1")).toContain(
      '(follow them exactly):\n"Harita 1453 olsun"\nA reviewer scored the rendered frames of this scene and found these problems; fix them where they make sense:\n- shot 2 (3/10): empty: bare wall\nThe current plan:\n- shot 1: wide map\n- shot 2 (pointed at): close-up\n',
    );
    expect(feedbackOf("s1")).toContain("give it under a new id");
    expect(feedbackOf("s2")).toMatch(/^The current plan:\n- shot 1 \(pointed at\): other\n/);
    expect(h.logs).toContain("  yapımcının notuyla yeniden planlanıyor: s1, s2");
    // Yeniden planlanan sahnelerin eski kare incelemeleri silinir, diğerleri kalır.
    expect(state.review!.shots).toEqual({ "s0-x": { score: 9, issues: [] } });
    expect(state.draftReview!.shots).toEqual({});
    expect(callsOf("sceneCritic")).toHaveLength(0);
    expect(lint.shot).not.toHaveBeenCalled();
    expect(state.replans).toBeUndefined();
    expect(state.shots!.map((s) => s.id)).toEqual(["s1-sh1", "s2-sh1"]);
    expect(Object.keys(state.stills!).sort()).toEqual(["s1-sh1", "s2-sh1"]);
    expect(state.done.keyframes).toBeDefined();
    // İnceleme kaydı olmayan bölüm de yeniden planlanır.
    const bare = await keyframeReady(h, {}, { vectorProps: {}, shotPlan: { scenes: [{ sceneId: "s1", shots: [] }, { sceneId: "s2", shots: [] }] } as never, review: undefined, draftReview: undefined, replans: { s1: { note: "x", shots: [], at: "t" } } });
    await h.pipeline.run(bare, { only: "keyframes" });
    expect(h.logs.filter((l) => l.startsWith("  yapımcının notuyla"))).toHaveLength(2);
  });

  it("yalnız en kötü sahneler yeniden planlanır: en kötüden başlanır, sahnelerin en çok çeyreği", async () => {
    const h = harness();
    agents();
    onAgent("sceneCritic", (items: { shotId: string }[]) => ({
      // s1-sh2 için kare dönmez: puanı bilinmeyen kare sıralamada en iyi sayılır.
      shots: items.filter((i) => i.shotId !== "s1-sh2").map((i) => ({ shotId: i.shotId, score: i.shotId.startsWith("s1") ? 4 : 2, issues: [] })),
      lessons: [],
    }));
    onAgent("vectorDirector", () => ({ shots: [{ startWord: 0, description: "x", ambience: "none", spec: vshot({ layers: [] }) }], newProps: [], newBackgrounds: [] }));
    const shot = (id: string, sceneId: string, startMs: number) => ({ id, sceneId, kind: "still_motion", startMs, endMs: startMs + 500, description: "a", imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot({ layers: [] }) });
    const id = await keyframeReady(h, {}, {
      vectorProps: {},
      shotPlan: { scenes: [{ sceneId: "s1", shots: [] }, { sceneId: "s2", shots: [] }] } as never,
      shots: [shot("s1-sh1", "s1", 0), shot("s1-sh2", "s1", 700), shot("s2-sh1", "s2", 2400)] as never,
    });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    // İki sahne de kötü ama 2 sahnenin çeyreği 1: yalnız en kötüsü (s2) yeniden planlanır.
    expect(state.draftReview!.revisedScenes).toEqual(["s2"]);
    expect(callsOf("vectorDirector")).toHaveLength(1);
  });

  it("planda sahnesi olmayan yeniden plan yok sayılır", async () => {
    const h = harness();
    agents();
    onAgent("sceneCritic", (items: { shotId: string }[]) => ({ shots: items.map((i) => ({ shotId: i.shotId, score: 2, issues: [] })), lessons: [] }));
    onAgent("vectorDirector", () => ({ shots: [{ startWord: 0, description: "x", ambience: "none", spec: vshot({ layers: [] }) }], newProps: [], newBackgrounds: [] }));
    const id = await keyframeReady(h, {}, { vectorProps: {}, shotPlan: { scenes: [] }, voice: { s1: voiceOf("s1") } });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(callsOf("vectorDirector")).toHaveLength(1);
    expect(state.shotPlan).toEqual({ scenes: [] });
    expect(state.shots).toEqual([]);
  });

  it("hiçbir taslak kare denetlenemezse kayıt bırakılmaz, sahneler yeniden planlanmaz; kareler yine yazılır", async () => {
    const h = harness();
    agents();
    onAgent("sceneCritic", () => {
      throw new Error("API hatası 429: limit");
    });
    const old = { at: "t", lessons: [], avg: 9, revisedScenes: [], shots: { "s1-sh1": { score: 9, issues: [] } } };
    const id = await keyframeReady(h, {}, { vectorProps: {}, draftReview: old });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(h.logs).toContain("  ⚠ taslak karelerin hiçbiri denetlenemedi, taslak denetimi atlandı: API hatası 429: limit");
    expect(state.draftReview).toBeUndefined();
    expect(Object.keys(state.stills!).sort()).toEqual(["s1-sh1", "s1-sh2"]);
    expect(callsOf("vectorDirector")).toHaveLength(0);
  });

  it("eleştirmen kare döndürmezse ortalama 0", async () => {
    const h = harness();
    agents();
    onAgent("sceneCritic", () => ({ shots: [], lessons: [] }));
    const id = await keyframeReady(h, {}, { vectorProps: {} });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(state.draftReview).toMatchObject({ avg: 0, revisedScenes: [] });
  });
});

describe("animasyon denetimi", () => {
  const director = () =>
    onAgent("vectorDirector", () => ({
      shots: [{ startWord: 0, description: "fixed", ambience: "none", spec: vshot({ background: "l1", layers: [{ asset: "c1", x: 900, depth: 0.5 }] }) }],
      newProps: [],
      newBackgrounds: [],
    }));
  const summary = (h: Harness) => h.logs.find((l) => l.startsWith("  animasyon denetimi:"));
  // Yeniden planlama sahnenin planını değiştirir; öbür sahneler planlarından yeniden kurulur.
  const planned = (vector: object) => ({ startWord: 0, characterIds: [], locationId: "", kind: "still_motion", description: "d", imagePrompt: "", motionPrompt: "", camera: "static", ambience: "none", vector: vshot(vector) });
  const plan = (s1: object[], s2: object[] = []) => ({ shotPlan: { scenes: [{ sceneId: "s1", shots: s1 }, { sceneId: "s2", shots: s2 }] } as never });

  it("hatasız planda yeniden planlama yok; sonuç duruma yazılır", async () => {
    const h = harness();
    agents();
    const id = await keyframeReady(h, { qa: false });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(state.lint).toEqual({ found: 0, revisedScenes: [], issues: [] });
    expect(summary(h)).toMatch(/görünür hata 0, kodun düzelttiği 0; yeniden planlanacak sahne: 0$/);
    expect(lint.shot).toHaveBeenCalled();
    expect(callsOf("vectorDirector")).toHaveLength(0);
  });

  it("görünür hatası olan sahne bulgularla bir tur yeniden planlanır; kodun düzelttikleri ders olarak söylenir", async () => {
    const h = harness();
    agents();
    director();
    lint.shot.mockImplementation((v) => {
      const spec = JSON.stringify(v.vector ?? {});
      if (spec.includes("p-cup"))
        return [
          { code: "missing_asset", shotId: v.shotId, layer: 1, detail: "layer asset p-cup is not drawn", replan: true },
          { code: "point_at_nothing", shotId: v.shotId, layer: 0, detail: "points with nothing beside it", replan: false },
        ];
      return spec.includes("b-room") ? [{ code: "face_cut", shotId: v.shotId, detail: "only 50% of the face is in frame", replan: true }] : [];
    });
    const id = await keyframeReady(h, { qa: false }, plan([]));
    const state = await h.pipeline.run(id, { only: "keyframes" });
    const feedback = (callsOf("vectorDirector")[0]!.args[0] as { feedback: string }).feedback;
    expect(feedback.split("\n")).toEqual([
      "- shot 1: missing_asset (layer 1): layer asset p-cup is not drawn; code fixed: point_at_nothing (layer 0): points with nothing beside it",
      "- shot 2: face_cut: only 50% of the face is in frame",
    ]);
    expect(callsOf("vectorDirector")).toHaveLength(1);
    expect(summary(h)).toMatch(/görünür hata 2, kodun düzelttiği 1; yeniden planlanacak sahne: 1$/);
    expect(h.logs).toContain("  animasyon denetimi (yeniden plandan sonra): görünür hata 0");
    expect(state.lint).toEqual({ found: 2, revisedScenes: ["s1"], issues: [] });
    expect(state.shots!.filter((s) => s.sceneId === "s1").map((s) => s.id)).toEqual(["s1-sh1"]);
  });

  it("en çok sahnelerin yarısı, en çok hatalıdan başlanarak; kalan bulgular duruma yazılır", async () => {
    const h = harness();
    agents();
    director();
    const one = { code: "empty_frame", detail: "visible content covers 1% of the frame", replan: true };
    lint.shot.mockImplementation((v) => {
      const spec = JSON.stringify(v.vector ?? {});
      if (spec.includes("b-room")) return [{ ...one, shotId: v.shotId }];
      return spec.includes("p-cup") ? [{ ...one, shotId: v.shotId }, { ...one, code: "missing_asset", shotId: v.shotId }] : [];
    });
    const room = { background: "b-room", layers: [{ asset: "c1", x: 900, depth: 0.5 }] };
    const cup = { background: "l1", layers: [{ asset: "p-cup", x: 600, depth: 0.4 }] };
    const shot = (id: string, sceneId: string, startMs: number, vector: object): PlannedShotState => ({ id, sceneId, kind: "still_motion", startMs, endMs: startMs + 1000, description: id, imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot(vector) });
    const calm = { background: "l1", layers: [{ asset: "c1", x: 900, depth: 0.5 }] };
    const id = await keyframeReady(h, { qa: false }, { ...plan([planned(room)], [planned(cup)]), shots: [shot("s1-sh1", "s1", 0, room), shot("s2-sh1", "s2", 2400, cup), shot("s2-sh2", "s2", 3400, calm)] });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(callsOf("vectorDirector")).toHaveLength(1);
    // Bulgusu olmayan çekim nota girmez.
    expect((callsOf("vectorDirector")[0]!.args[0] as { feedback: string }).feedback.split("\n")).toEqual([
      "- shot 1: empty_frame: visible content covers 1% of the frame; missing_asset: visible content covers 1% of the frame",
    ]);
    expect(state.lint!.revisedScenes).toEqual(["s2"]);
    expect(state.lint!.found).toBe(3);
    expect(state.lint!.issues).toEqual([{ ...one, shotId: "s1-sh1" }]);
    expect(h.logs).toContain("  animasyon denetimi (yeniden plandan sonra): görünür hata 1");
  });

  it("denetim çalışamazsa üretim durmaz", async () => {
    const h = harness();
    agents();
    lint.shot.mockImplementation(() => {
      throw new Error("ölçülemedi");
    });
    const id = await keyframeReady(h, { qa: false });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(h.logs.some((l) => l.startsWith("⚠ animasyon denetimi yapılamadı, denetimsiz sürüyor: ") && l.includes("ölçülemedi"))).toBe(true);
    expect(state.lint).toBeUndefined();
    expect(state.done.keyframes).toBeDefined();
  });
});

describe("anlatılan eylem", () => {
  const shot = (id: string, startMs: number, description: string, anims: object[]): PlannedShotState => ({
    id,
    sceneId: "s1",
    kind: "still_motion",
    startMs,
    endMs: startMs + 1000,
    description,
    imagePrompt: "",
    motionPrompt: "",
    camera: "static",
    vector: vshot({ background: "l1", layers: [{ asset: "c1", x: 900, depth: 0.5, anims }] }),
  });
  const shots = [shot("s1-sh1", 0, "Rider types at his desk.", [{ type: "explain", start: 0.2, end: 0.9 }]), shot("s1-sh2", 1000, "Rider nods.", [{ type: "talk" }]), shot("s1-sh3", 2000, "Rider waits.", [])];
  const animsOf = (state: EpisodeState) => state.shots!.map((s) => s.vector!.layers[0]!.anims.map((a) => [a.type, a.start, a.end]));

  it("açıklamadaki eylem kişiye jest olarak verilir; render'da yeni kusur doğuran eylem eklenmez", async () => {
    const h = harness();
    agents();
    // Baş sallama eklenen plan yüzü kadrajdan taşırıyormuş gibi: eklenmez.
    lint.shot.mockImplementation((v) => (JSON.stringify(v.vector).includes('"nod"') ? [{ code: "face_cut", shotId: v.shotId, detail: "x", replan: true }] : []));
    const id = await keyframeReady(h, { qa: false }, { shots });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    // Genel anlatma jesti aynı aralıkta yazmaya döner.
    expect(animsOf(state)).toEqual([[["typing", 0.2, 0.9]], [["talk", 0, 1]], []]);
    expect(h.logs).toContain("  1 çekimde açıklamada anlatılan eylem kişiye jest olarak verildi");
    expect(state.done.keyframes).toBeDefined();
  });

  it("eklenecek jest yoksa günlük yazılmaz; denetim çalışamazsa plan olduğu gibi sürer", async () => {
    const h = harness();
    agents();
    const quiet = await keyframeReady(h, { qa: false }, { shots: [shots[2]!] });
    await h.pipeline.run(quiet, { only: "keyframes" });
    expect(h.logs.some((l) => l.includes("anlatılan eylem"))).toBe(false);

    lint.shot.mockImplementation((v) => {
      if (JSON.stringify(v.vector).includes('"typing"')) throw new Error("ölçülemedi");
      return [];
    });
    const id = await keyframeReady(h, { qa: false }, { shots: [shots[0]!] });
    const state = await h.pipeline.run(id, { only: "keyframes" });
    expect(animsOf(state)).toEqual([[["explain", 0.2, 0.9]]]);
    expect(h.logs.some((l) => l.startsWith("⚠ anlatılan eylemler jestlere çevrilemedi, plan olduğu gibi sürüyor: ") && l.includes("ölçülemedi"))).toBe(true);
    expect(state.done.keyframes).toBeDefined();
  });
});

describe("vektör timeline", () => {
  it("seçili karakter/mekân ve çizilmiş nesneler gömülür; gerçek veri ve arka plan zemini korunur", async () => {
    const h = harness();
    const backdropChar = CHARACTER_SVG.replace(">", '><rect x="0" y="0" width="400" height="800" fill="#fff"/>');
    h.store.putText("lib/c1.svg", backdropChar);
    h.store.putJsonSync("lib/c1.svg.json", { realHeight: 1.7 });
    h.store.putText("lib/l1.svg", ROOM_SVG);
    h.store.putText("lib/map.svg", '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#00f"/></svg>');
    h.store.putJsonSync("lib/map.svg.json", { exact: true });
    h.store.putText("lib/cup.svg", PROP_SVG);
    h.store.putText("lib/bg.svg", ROOM_SVG);
    const id = await h.seed(
      makeState(
        { motionMode: "vector" },
        {
          style: STYLE,
          script: SCRIPT,
          voice: { s1: voiceOf("s1") },
          shots: [],
          keyframes: {},
          cast: {
            characters: [CAST.characters[0]!, { id: "c2", name: "Nobody", kind: "person", role: "x", visualDescription: "x", scenes: [] }],
            locations: [CAST.locations[0]!, { id: "l2", name: "Nowhere", visualDescription: "x", scenes: [] }],
          } as never,
          concept: { candidates: {}, selected: { c1: { key: "lib/c1.svg", mimeType: "image/svg+xml" }, l1: { key: "lib/l1.svg", mimeType: "image/svg+xml" } } },
          vectorProps: {
            "b-map": { description: "map", kind: "background", key: "lib/map.svg" },
            "p-map": { description: "inset map", key: "lib/map.svg" },
            "p-cup": { description: "cup", key: "lib/cup.svg" },
            "b-bg": { description: "bg", kind: "background", key: "lib/bg.svg" },
            "p-none": { description: "not drawn" },
          },
        },
      ),
    );
    const state = await h.pipeline.run(id, { only: "timeline" });
    const assets = state.timeline!.vectorAssets!;
    expect(Object.keys(assets).sort()).toEqual(["b-bg", "b-map", "c1", "l1", "p-cup", "p-map"]);
    expect(assets.c1!.svg).not.toContain('fill="#fff"');
    expect(assets.c1!.meta.realHeight).toBe(1.7);
    expect(assets["p-map"]).toMatchObject({ kind: "prop", width: 100, height: 100 });
    expect(assets["p-map"]!.svg).toContain('fill="#00f"');
    expect(assets["p-cup"]!.svg).not.toContain('fill="#fff"');
    expect(assets.l1!.svg).toContain('height="380"');
    expect(assets["b-bg"]!.kind).toBe("background");
  });

  it("varlığı olmayan vektör bölümünde timeline boş varlıkla kurulur", async () => {
    const h = harness();
    const id = await h.seed(makeState({ motionMode: "vector" }, { script: SCRIPT, voice: {}, shots: [], keyframes: {} }));
    const state = await h.pipeline.run(id, { only: "timeline" });
    expect(state.timeline!.vectorAssets).toEqual({});
  });
});
