import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EpisodeState, PlannedShotState } from "../src/index.ts";
import { callsOf, onAgent, refs, resetFakes } from "./pipeline-fakes.ts";
import { CAST, CHARACTER_SVG, harness, makeState, PROP_SVG, ROOM_SVG, SCRIPT, STYLE, voiceOf, vshot, type Harness } from "./pipeline-harness.ts";

vi.mock("@ys/agents", async (orig) => (await import("./pipeline-fakes.ts")).mockAgents(await orig()));
vi.mock("@ys/video/render", async () => {
  const f = await import("./pipeline-fakes.ts");
  return f.renderModule();
});
vi.mock("@ys/video/lint", () => ({ lintShot: () => [] }));
vi.mock("../src/reference.ts", async (orig) => {
  const f = await import("./pipeline-fakes.ts");
  return {
    ...(await orig<object>()),
    findReferences: (...a: any[]) => f.refs.find(...a),
    findVectorSources: (...a: any[]) => f.refs.vectors(...a),
    rasterizeSvg: (...a: any[]) => f.refs.rasterize(...a),
  };
});

/**
 * Set eşyası (input.setDressing, verilmezse açık): kare aşamasında döşenmemiş mekânlar için set düzenleyiciye tek
 * çağrı; seçilen eşyalar mekânıyla vectorProps'a girer, öbür nesnelerle çizilir, yönetmene sunulmaz. Ajanlar sahtedir.
 */

type Fn = (s: EpisodeState) => Promise<void>;
const call = (h: Harness, name: string, state: EpisodeState) => (h.pipeline as unknown as Record<string, Fn>)[name]!.call(h.pipeline, state);
// Set düzenleyici kare aşamasının çekimleriyle çağrılır (vectorPropsDraw).
const dress = (h: Harness, state: EpisodeState) =>
  (h.pipeline as unknown as { setDressing: (s: EpisodeState, shots: PlannedShotState[]) => Promise<void> }).setDressing.call(h.pipeline, state, state.shots ?? []);

const shot = (id: string, background: string, layers: object[]): PlannedShotState => ({
  id,
  sceneId: id.split("-")[0]!,
  kind: "still_motion",
  startMs: 0,
  endMs: 1000,
  description: id,
  imagePrompt: "",
  motionPrompt: "",
  camera: "static",
  vector: vshot({ background, layers }),
});

function stateWith(h: Harness, input: object = {}, extra: Partial<EpisodeState> = {}): EpisodeState {
  h.store.putText("lib/c1.svg", CHARACTER_SVG);
  h.store.putText("lib/l1.svg", ROOM_SVG);
  h.store.putText(voiceOf("s1").key, "mp3");
  return makeState(
    { motionMode: "vector", lineStyle: "outline", qa: false, ...input },
    {
      style: STYLE,
      script: SCRIPT,
      story: { title: "Garajdan dünyaya", logline: "", premise: "", hook: "", beats: [] } as never,
      cast: CAST,
      voice: { s1: voiceOf("s1"), s2: voiceOf("s2") },
      concept: { candidates: {}, selected: { c1: { key: "lib/c1.svg", mimeType: "image/svg+xml" }, l1: { key: "lib/l1.svg", mimeType: "image/svg+xml" } } },
      shots: [
        shot("s1-sh1", "l1", [{ asset: "c1", x: 900, depth: 0.5 }, { asset: "p-cup", x: 600, depth: 0.4 }]),
        shot("s1-sh2", "l1~rev", [{ asset: "c1", x: 900, depth: 0.5 }]),
        shot("s2-sh1", "b-room", [{ asset: "c1", x: 900, depth: 0.5 }]),
        shot("s2-sh2", "b-map", []),
      ],
      vectorProps: {
        "p-cup": { description: "a tea cup", key: "lib/cup.svg" },
        "b-room": { description: "an empty office", kind: "background", key: "lib/l1.svg" },
        "b-map": { description: "route", kind: "background", map: { projection: "flat", focus: ["USA"], highlight: [], markers: [], routes: [] }, key: "lib/l1.svg" },
        "b-unused": { description: "a hall nobody uses", kind: "background" },
      },
      ...extra,
    },
  );
}

const PIECE = (name: string) => ({ name, description: `a tall ${name}`, reference: `${name} 1970s` });

beforeEach(() => {
  resetFakes();
  refs.find.mockResolvedValue({ images: [], sources: [], keys: [] });
  refs.vectors.mockResolvedValue([]);
  refs.rasterize.mockResolvedValue({ data: new Uint8Array([1]), mimeType: "image/png" });
  onAgent("assetPlanner", (b: { name: string }) => ({ subject: b.name, moved: [], cues: [] }));
  onAgent("vectorDesigner", () => ({ svg: PROP_SVG, realHeight: 1.8, grounded: true }));
  onAgent("assetGuess", () => ({ guess: "a bookcase", confidence: 7 }));
  onAgent("assetGate", () => ({ recognizable: 9, fidelity: null, defects: [] }));
});

describe("set eşyası", () => {
  it("kullanılan mekânlara (ters açı asıl mekânıyla, harita yok) bir çağrı; eşyalar mekânıyla kaydedilir ve çizilir", async () => {
    const h = harness();
    onAgent("setDresser", () => ({ locations: [{ id: "l1", pieces: [PIECE("bookcase"), PIECE("cabinet")] }, { id: "b-room", pieces: [PIECE("plant")] }] }));
    const state = stateWith(h);
    await call(h, "vectorPropsDraw", state);
    const [args] = callsOf("setDresser")[0]!.args as [{ topic: string; places: { id: string; name: string; description: string; props: string[] }[] }];
    expect(args.topic).toBe(`Garajdan dünyaya (${state.input.topic})`);
    expect(args.places).toEqual([
      { id: "l1", name: "Station", description: "relay station", props: ["p-cup: a tea cup"] },
      { id: "b-room", name: "b-room", description: "an empty office", props: [] },
    ]);
    expect(state.sets).toEqual({ l1: ["set-l1-1", "set-l1-2"], "b-room": ["set-b-room-1"] });
    expect(state.vectorProps!["set-l1-1"]).toMatchObject({ description: "a tall bookcase", kind: "prop", reference: "bookcase 1970s", set: "l1" });
    // Mekânı kullanılan eşyalar öbür nesnelerle birlikte çizilir.
    for (const id of ["set-l1-1", "set-l1-2", "set-b-room-1"]) expect(state.vectorProps![id]!.key).toMatch(/^library\/vector\/prop\//);
    expect(h.logs).toContain("  set eşyası: 2 mekân için 3 eşya seçildi");

    // Döşenmiş mekân yeniden sorulmaz; mekânı artık kullanılmayan eşya çizilmez.
    resetFakes();
    state.vectorProps!["set-b-unused-1"] = { description: "a lamp", kind: "prop", set: "b-unused" };
    await call(h, "vectorPropsDraw", state);
    expect(callsOf("setDresser")).toHaveLength(0);
    expect(state.vectorProps!["set-b-unused-1"]!.key).toBeUndefined();
  });

  it("konusu başlıkla aynıysa yalnız konu gider; eşyasız mekân boş listeyle kaydedilir", async () => {
    const h = harness();
    onAgent("setDresser", () => ({ locations: [{ id: "l1", pieces: [] }] }));
    const state = stateWith(h, {}, { story: undefined });
    await dress(h, state);
    expect((callsOf("setDresser")[0]!.args[0] as { topic: string }).topic).toBe(state.input.topic);
    expect(state.sets).toEqual({ l1: [], "b-room": [] });
    expect(h.logs).toContain("  set eşyası: 2 mekân için 0 eşya seçildi");
    // Nesne kaydı hiç yoksa (yönetmen nesne koymadı) kayıt eşyalarla açılır.
    onAgent("setDresser", () => ({ locations: [{ id: "l1", pieces: [PIECE("bookcase")] }] }));
    const bare = stateWith(h, {}, { vectorProps: undefined });
    await dress(h, bare);
    expect(bare.sets).toEqual({ l1: ["set-l1-1"] });
    expect(Object.keys(bare.vectorProps!)).toEqual(["set-l1-1"]);
  });

  it("kapalıysa ve döşenecek mekân yoksa çağrı yok; çağrı düşerse günlüğe yazılır, mekân kaydedilmez", async () => {
    const h = harness();
    onAgent("setDresser", () => {
      throw new Error("ajan düştü");
    });
    const off = stateWith(h, { setDressing: false });
    await dress(h, off);
    expect(off.sets).toBeUndefined();
    const empty = stateWith(h, {}, { shots: [], vectorProps: undefined });
    await dress(h, empty);
    expect(callsOf("setDresser")).toHaveLength(0);
    // Döşenecek mekân yoksa kayıt da açılmaz.
    expect([empty.sets, empty.vectorProps]).toEqual([undefined, undefined]);
    const state = stateWith(h);
    await dress(h, state);
    expect(callsOf("setDresser")).toHaveLength(1);
    expect(state.sets).toBeUndefined();
    expect(h.logs).toContain("  set düzenleyici atlandı: ajan düştü");
  });

  it("kadro yeniden kurulunca tarifi değişen mekânın set eşyaları atılır; değişmeyen mekânınki ve yönetmenin arka planınınki kalır", async () => {
    const h = harness();
    const sets = { l1: ["set-l1-1"], "b-room": ["set-b-room-1"] };
    const vectorProps = {
      "set-l1-1": { description: "a bookcase", kind: "prop" as const, set: "l1", key: "lib/a.svg" },
      "set-b-room-1": { description: "a cabinet", kind: "prop" as const, set: "b-room", key: "lib/b.svg" },
    };
    const seed = () => h.seed(makeState({}, { style: STYLE, script: SCRIPT, cast: CAST, sets: structuredClone(sets), vectorProps: structuredClone(vectorProps) }));
    onAgent("castingDirector", () => CAST);
    expect((await h.pipeline.run(await seed(), { only: "cast" })).sets).toEqual(sets);
    onAgent("castingDirector", () => ({ ...CAST, locations: [{ ...CAST.locations[0]!, visualDescription: "a new station" }] }));
    const state = await h.pipeline.run(await seed(), { only: "cast" });
    expect(state.sets).toEqual({ "b-room": ["set-b-room-1"] });
    expect(Object.keys(state.vectorProps!)).toEqual(["set-b-room-1"]);
  });

  it("yönetmene set eşyası sunulmaz (yerleşimini kod yapar)", async () => {
    const h = harness();
    onAgent("vectorDirector", () => ({ shots: [{ startWord: 0, description: "x", ambience: "none", spec: vshot({ layers: [{ asset: "c1", x: 500, depth: 0.5 }] }) }], newProps: [], newBackgrounds: [] }));
    const state = stateWith(h, {}, { vectorProps: { "p-cup": { description: "a tea cup" }, "set-l1-1": { description: "a bookcase", kind: "prop", set: "l1" } } });
    const plan = (h.pipeline as unknown as { planVectorScene: (...a: unknown[]) => Promise<unknown> }).planVectorScene;
    await plan.call(h.pipeline, state, SCRIPT.scenes[0], 6, []);
    expect((callsOf("vectorDirector")[0]!.args[0] as { props: Record<string, string> }).props).toEqual({ "p-cup": "a tea cup" });
  });
});
