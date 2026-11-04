import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptAsset, rejectAsset, type EpisodeState } from "../src/index.ts";
import { callsOf, onAgent, refs, resetFakes } from "./pipeline-fakes.ts";
import { CAST, harness, makeState, ROOM_SVG, STYLE, vshot, type Harness } from "./pipeline-harness.ts";

vi.mock("@ys/agents", async (orig) => (await import("./pipeline-fakes.ts")).mockAgents(await orig()));
vi.mock("@ys/video/render", async () => {
  const f = await import("./pipeline-fakes.ts");
  return f.renderModule();
});
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
 * Ters açı (input.reverseViews, verilmezse açık): çok kullanılan odaya aynı yerin karşı tarafı bir kez çizilir; aynı
 * odada art arda gelen çekimler iki açı arasında gider. Asıl çizime bakılarak çizilir, kapıda onunla karşılaştırılır,
 * kütüphanede asıl çizimden türeyen anahtarda durur. Ajanlar sahtedir.
 */

const ROOM = "library/vector/background/room.svg";
const REV = "library/vector/background/room.reverse.svg";
const REV_SVG = ROOM_SVG.replace('fill="#888"', 'fill="#555"');

type Fn = (s: EpisodeState) => Promise<void>;
const reverseViews = (h: Harness, state: EpisodeState) => (h.pipeline as unknown as { vectorBackgroundViews: Fn }).vectorBackgroundViews.call(h.pipeline, state);
type Assets = (s: EpisodeState, stage: string) => Promise<Record<string, { meta: { floorY?: number } }>>;
const assetsOf = (h: Harness, state: EpisodeState) => (h.pipeline as unknown as { vectorAssets: Assets }).vectorAssets.call(h.pipeline, state, "timeline");

const shot = (i: number, background: string) => ({
  id: `s1-sh${i}`,
  sceneId: "s1",
  kind: "still_motion" as const,
  startMs: i * 1000,
  endMs: (i + 1) * 1000,
  description: "",
  imagePrompt: "",
  motionPrompt: "",
  camera: "static",
  vector: vshot({ background, layers: [{ asset: "c1", x: 900, depth: 0.3 }] }),
});

/** Ofis (l1) altı çekimde art arda, koridor (l2) bir çekimde. */
function stateWith(h: Harness, input: object = {}, bgs = ["l1", "l1", "l1", "l1", "l1", "l1", "l2"], extra: Partial<EpisodeState> = {}): EpisodeState {
  h.store.putText(ROOM, ROOM_SVG);
  h.store.putJsonSync(`${ROOM}.json`, { floorY: 700 });
  h.store.putText("library/vector/background/l2.svg", ROOM_SVG);
  return makeState(
    { motionMode: "vector", ...input },
    {
      style: STYLE,
      cast: {
        characters: [CAST.characters[0]!],
        locations: [
          { id: "l1", name: "Ofis", visualDescription: "a small office", scenes: [] },
          { id: "l2", name: "Koridor", visualDescription: "a corridor", scenes: [] },
        ],
      } as never,
      concept: {
        candidates: {},
        selected: { l1: { key: ROOM, mimeType: "image/svg+xml" }, l2: { key: "library/vector/background/l2.svg", mimeType: "image/svg+xml" } },
      },
      shots: bgs.map((bg, i) => shot(i, bg)) as never,
      ...extra,
    },
  );
}

function agents(scores: number[] = [9]) {
  const left = [...scores];
  onAgent("vectorDesigner", () => ({ svg: REV_SVG, realHeight: 3, grounded: true, floorY: 690 }));
  onAgent("assetGuess", () => ({ guess: "an office, other side", confidence: 8 }));
  onAgent("assetGate", () => ({ recognizable: left.length > 1 ? left.shift()! : left[0]!, fidelity: 9, defects: ["door missing"] }));
}

const backgrounds = (state: EpisodeState) => state.shots!.map((s) => s.vector!.background);

beforeEach(() => {
  resetFakes();
  refs.rasterize.mockResolvedValue({ data: new Uint8Array([7]), mimeType: "image/png" });
});

describe("ters açı", () => {
  it("çok kullanılan oda için asıl çizime bakılarak çizilir, kapıda karşılaştırılır; aynı odada art arda çekimler iki açı arasında gider", async () => {
    const h = harness();
    agents();
    const state = stateWith(h);
    await reverseViews(h, state);
    expect(state.backgroundViews).toEqual({ l1: { key: REV, ok: true } });
    expect(h.store.text(REV)).toContain("#555");
    // Zemin çizgisi asıl görünüşünki (tasarımcının 690'ı değil): kesmede kişiler aynı yükseklikte.
    expect(h.store.json(`${REV}.json`)).toMatchObject({ floorY: 700, check: { passed: true, entityId: "l1~rev" } });
    // Tek çekimlik koridora çizim yok; tasarımcı ters açı kipinde, asıl çizimin SVG'si, görüntüsü ve zemin çizgisiyle.
    expect(callsOf("vectorDesigner")).toHaveLength(1);
    expect(callsOf("vectorDesigner")[0]!.args[0]).toMatchObject({ kind: "background", name: "Ofis", description: "a small office", view: "reverse", front: ROOM_SVG, floorY: 700, references: [{ mimeType: "image/png" }] });
    expect(callsOf("assetGate")[0]!.args[0]).toMatchObject({ name: "Ofis (ters açı)", references: [{ data: new Uint8Array([7]) }] });
    // Aynı odada 2., 4., 6. çekim ters açıdan; başka oda olduğu gibi.
    expect(backgrounds(state)).toEqual(["l1", "l1~rev", "l1", "l1~rev", "l1", "l1~rev", "l2"]);
    expect(h.logs).toContain("  3 çekim odanın ters açısından (aynı odada art arda kesmede karşı duvar)");
    // Render ve kurgu ters açıyı ayrı arka plan olarak bulur.
    const assets = await assetsOf(h, state);
    expect(assets["l1~rev"]!.meta.floorY).toBe(700);
    expect(assets["l2~rev"]).toBeUndefined();

    // Aynı oda başka bölümde: kütüphaneden, para gitmez; bu bölümde tekrar çağrı bir şey çizmez.
    resetFakes();
    const other = stateWith(h);
    await reverseViews(h, other);
    await reverseViews(h, other);
    expect(other.backgroundViews).toEqual({ l1: { key: REV, ok: true } });
    expect(callsOf("vectorDesigner")).toHaveLength(0);
    expect(h.logs).toContain("  Ofis (ters açı): kütüphaneden (kapı ✓)");
  });

  it("kapıyı geçemezse oda tek açıdan görünür ve yeniden çizilmez; insan kabul edince kullanılır, reddedince bırakılır", async () => {
    const h = harness();
    agents([3]);
    const state = stateWith(h);
    await reverseViews(h, state);
    expect(state.backgroundViews).toEqual({ l1: { key: REV, ok: false } });
    expect(callsOf("vectorDesigner")).toHaveLength(3);
    expect(backgrounds(state)).toEqual(["l1", "l1", "l1", "l1", "l1", "l1", "l2"]);
    expect(h.logs).toContain("  Ofis: ters açı kalite kapısından geçemedi; oda tek açıdan görünecek");
    expect(state.assetChecks![REV]).toMatchObject({ entityId: "l1~rev", rejectedKey: "library/vector/background/room.reverse.rejected.svg" });
    resetFakes();
    await reverseViews(h, state);
    expect(callsOf("vectorDesigner")).toHaveLength(0);

    // İnsan kabul eder: kurgu yenilenir, çekimler ters açıyı alır (atama kurgu aşamasında da tazelenir).
    state.done.timeline = "x";
    await acceptAsset(h.store, state, REV);
    expect(state.backgroundViews!.l1).toEqual({ key: REV, ok: true });
    expect(state.concept!.selected.l1!.key).toBe(ROOM);
    expect(state.done.timeline).toBeUndefined();
    await reverseViews(h, state);
    expect(backgrounds(state)).toEqual(["l1", "l1~rev", "l1", "l1~rev", "l1", "l1~rev", "l2"]);
    // İnsan reddeder: önceki atama geri alınır.
    await rejectAsset(h.store, state, REV, "kapı yok");
    expect(state.backgroundViews!.l1).toEqual({ key: REV, ok: false });
    await reverseViews(h, state);
    expect(backgrounds(state)).toEqual(["l1", "l1", "l1", "l1", "l1", "l1", "l2"]);
  });

  it("kapalıysa, oda az kullanılıyorsa ya da hiç art arda gelmiyorsa çizilmez; harita arka planına ters açı yok", async () => {
    const h = harness();
    agents();
    const off = stateWith(h, { reverseViews: false });
    await reverseViews(h, off);
    expect(off.backgroundViews).toBeUndefined();
    const few = stateWith(h, {}, ["l1", "l1", "l1", "l1", "l1", "l2"]);
    await reverseViews(h, few);
    const apart = stateWith(h, {}, ["l1", "l2", "l1", "l2", "l1", "l2", "l1", "l2", "l1", "l2", "l1", "l2"]);
    await reverseViews(h, apart);
    const map = stateWith(h, {}, ["m", "m", "m", "m", "m", "m"], { vectorProps: { m: { description: "harita", kind: "background", key: "library/vector/geo/x.svg", map: { focus: ["TUR"] } } as never } });
    await reverseViews(h, map);
    const noShots = stateWith(h, {}, [], { shots: undefined });
    await reverseViews(h, noShots);
    for (const s of [few, apart, map, noShots]) expect(s.backgroundViews).toEqual({});
    expect(callsOf("vectorDesigner")).toHaveLength(0);
  });

  it("yönetmenin istediği ek arka plana da (zemin çizgisi yoksa tasarımcınınki kalmaz); asıl çizim değişince eski ters açı kullanılmaz", async () => {
    const h = harness();
    agents();
    h.store.putText("library/vector/background/lab.svg", ROOM_SVG);
    const lab = stateWith(h, {}, ["b-lab", "b-lab", "b-lab", "b-lab", "b-lab", "b-lab"], {
      vectorProps: { "b-lab": { description: "a chemistry lab", kind: "background", key: "library/vector/background/lab.svg" } as never },
    });
    await reverseViews(h, lab);
    expect(callsOf("vectorDesigner")[0]!.args[0]).toMatchObject({ name: "b-lab", description: "a chemistry lab", view: "reverse" });
    expect(callsOf("vectorDesigner")[0]!.args[0]).not.toHaveProperty("floorY");
    expect(h.store.json("library/vector/background/lab.reverse.svg.json")).not.toHaveProperty("floorY");
    expect(lab.backgroundViews!["b-lab"]!.ok).toBe(true);

    // Kadroda adı olmayan seçili oda: ad ve tarif kimlikten.
    resetFakes();
    agents();
    h.store.putText("library/vector/background/x.svg", ROOM_SVG);
    const bare = stateWith(h, {}, ["lx", "lx", "lx", "lx", "lx", "lx"]);
    bare.concept!.selected.lx = { key: "library/vector/background/x.svg", mimeType: "image/svg+xml" };
    await reverseViews(h, bare);
    expect(callsOf("vectorDesigner")[0]!.args[0]).toMatchObject({ name: "lx", description: "lx" });

    // İnsan ofis için başka bir çizim seçti: eski ters açı bayat (kullanılmaz), yenisi çizilir.
    resetFakes();
    agents();
    const state = stateWith(h);
    await reverseViews(h, state);
    h.store.putText("library/vector/background/room2.svg", ROOM_SVG);
    state.concept!.selected.l1 = { key: "library/vector/background/room2.svg", mimeType: "image/svg+xml" };
    expect((await assetsOf(h, state))["l1~rev"]).toBeUndefined();
    await reverseViews(h, state);
    expect(state.backgroundViews!.l1).toEqual({ key: "library/vector/background/room2.reverse.svg", ok: true });
  });
});
