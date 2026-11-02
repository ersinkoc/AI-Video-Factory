import { beforeEach, describe, expect, it, vi } from "vitest";
import { existingSamples, loadStyleSamples, SAMPLE_BRIEF, STYLE_SAMPLES_KEY, type EpisodeState } from "../src/index.ts";
import { callsOf, onAgent, resetFakes } from "./pipeline-fakes.ts";
import { CAST, CHARACTER_SVG, harness, makeState, ROOM_SVG, type Harness } from "./pipeline-harness.ts";
import { styleFromPack, stylePackOf } from "@ys/core";

vi.mock("@ys/agents", async (orig) => (await import("./pipeline-fakes.ts")).mockAgents(await orig()));
vi.mock("@ys/video/render", async () => {
  const f = await import("./pipeline-fakes.ts");
  return f.renderModule();
});

/**
 * Stil örnekleri (yeni bölüm formunun önizlemesi): bölümlerde o stilde çizilmiş karakter ve mekân kullanılır, eksikler
 * pipeline'ın tasarımcısı ve kalite kapısıyla çizilir. Ajanlar sahtedir.
 */

const CHAR = "library/vector/character/";
const CAST3 = { ...CAST, characters: ["c1", "c2", "c3"].map((id) => ({ ...CAST.characters[0]!, id })) };
const metaOf = (h: Harness, key: string) => JSON.parse(new TextDecoder().decode(h.store.map.get(key)!));
const BG = "library/vector/background/";

function putAsset(h: Harness, key: string, check: object) {
  h.store.putText(key, key.startsWith(CHAR) ? CHARACTER_SVG : ROOM_SVG);
  h.store.putJsonSync(`${key}.json`, { realHeight: 1.7, check: { kind: "character", name: "x", recognizable: 9, ...check } });
}

/** Verilen pakette çizilmiş, kadrosu ve seçimi olan bölüm. */
function episodeIn(h: Harness, id: string, pack: string | undefined, selected: Record<string, string>, extra: Partial<EpisodeState> = {}) {
  const state = makeState({}, {
    id,
    cast: CAST3,
    style: pack ? styleFromPack(stylePackOf(pack) ?? stylePackOf("noir")!) : undefined,
    concept: { candidates: {}, selected: Object.fromEntries(Object.entries(selected).map(([k, key]) => [k, { key, mimeType: "image/svg+xml" }])), round: 1 } as never,
    ...extra,
  });
  if (pack && !stylePackOf(pack)) state.style!.pack = pack;
  return h.seed(state);
}

/** Karakter ve mekânı kapıdan geçiren sahte ajanlar. */
function passingAgents() {
  onAgent("assetPlanner", () => ({ subject: "x", moved: [], cues: [] }));
  onAgent("vectorDesigner", (brief: { kind: string }) =>
    brief.kind === "character" ? { svg: CHARACTER_SVG, realHeight: 1.75, grounded: true } : { svg: ROOM_SVG, realHeight: 3, grounded: true, floorY: 700 },
  );
  onAgent("assetGuess", () => ({ guess: "a man in a study", confidence: 8 }));
  onAgent("assetGate", () => ({ recognizable: 9, fidelity: null, defects: [] }));
}

beforeEach(() => resetFakes());

describe("stil örnekleri", () => {
  it("bölümlerde çizilmiş olan ücretsiz alınır; eksik karakter bankaya sunucu, eksik mekân kütüphaneye çizilir", async () => {
    const h = harness();
    putAsset(h, `${CHAR}${"1".repeat(32)}.svg`, { passed: true });
    putAsset(h, `${BG}${"2".repeat(32)}.svg`, { passed: true });
    await episodeIn(h, "2026-11-01-pixel", "pixel", { c1: `${CHAR}${"1".repeat(32)}.svg`, l1: `${BG}${"2".repeat(32)}.svg` });
    passingAgents();
    const samples = await h.pipeline.drawStyleSamples(["pixel", "noir"]);
    expect(samples.pixel).toMatchObject({ character: `${CHAR}${"1".repeat(32)}.svg`, background: `${BG}${"2".repeat(32)}.svg`, source: "library" });
    expect(samples.noir).toMatchObject({ source: "drawn" });
    expect(samples.noir!.character).toMatch(/^library\/vector\/character\/[0-9a-f]{32}\.svg$/);
    expect(samples.noir!.background).toMatch(/^library\/vector\/background\/[0-9a-f]{32}\.svg$/);
    // Karakter bankaya sunucu olarak girer; mekân aynı konuyla.
    const meta = metaOf(h, `${samples.noir!.character}.json`);
    expect(meta.identity).toMatchObject({ name: SAMPLE_BRIEF.character.name, role: "presenter", bank: true, pack: "noir" });
    expect(callsOf("vectorDesigner").map((c) => (c.args[0] as { kind: string }).kind).sort()).toEqual(["background", "character"]);
    expect(await loadStyleSamples(h.store)).toEqual(samples);
    expect(h.logs).toContain("  stil örneği hazır: noir (drawn)");
    expect(h.logs).toContain("  stil örneği hazır: pixel (library)");

    // Tamamlanmış paket yeniden çizilmez; paket verilmezse hepsi denenir.
    resetFakes();
    onAgent("assetPlanner", () => {
      throw new Error("çizim yok");
    });
    const all = await h.pipeline.drawStyleSamples();
    expect(all.noir).toEqual(samples.noir);
    expect(Object.keys(all)).toEqual(expect.arrayContaining(["pixel", "noir"]));
    expect(h.logs.filter((l) => l.startsWith("⚠ stil örneği çizilemedi: flat-explainer /"))).toHaveLength(2);
  });

  it("yarım örnek tamamlanır; kapıdan geçemeyen atlanır, hiçbiri yoksa kaydedilmez; bilinmeyen paket hata", async () => {
    const h = harness();
    await expect(h.pipeline.drawStyleSamples(["yok"])).rejects.toThrow("Bilinmeyen stil paketi: yok");
    h.store.putJsonSync(STYLE_SAMPLES_KEY, { noir: { character: `${CHAR}${"3".repeat(32)}.svg`, source: "library", at: "t" } });
    onAgent("assetPlanner", () => ({ subject: "x", moved: [], cues: [] }));
    onAgent("vectorDesigner", () => ({ svg: ROOM_SVG, realHeight: 3, grounded: true, floorY: 700 }));
    onAgent("assetGuess", () => ({ guess: "?", confidence: 2 }));
    onAgent("assetGate", () => ({ recognizable: 2, fidelity: null, defects: ["belirsiz"] }));
    const out = await h.pipeline.drawStyleSamples(["noir", "ukiyo-e"]);
    // Mekân kapıdan geçemedi: noir yarım kalır (karakteri korunur), ukiyo-e hiç kaydedilmez.
    expect(out.noir).toMatchObject({ character: `${CHAR}${"3".repeat(32)}.svg`, source: "library" });
    expect(out.noir!.background).toBeUndefined();
    expect(out["ukiyo-e"]).toBeUndefined();
    expect(callsOf("vectorDesigner").map((c) => (c.args[0] as { name: string }).name)).toContain(SAMPLE_BRIEF.background.name);
    expect(h.logs.some((l) => l.startsWith("⚠ stil örneği çizilemedi: ukiyo-e / Guide:"))).toBe(true);

    // Mekân bu sefer geçer: yarım örnek tamamlanır.
    passingAgents();
    const done = await h.pipeline.drawStyleSamples(["noir"]);
    expect(done.noir).toMatchObject({ character: `${CHAR}${"3".repeat(32)}.svg`, source: "drawn" });
    expect(done.noir!.background).toBeDefined();
  });

  it("bölüm taraması: stilsiz, bilinmeyen paketli, kadrosuz bölüm ve kapıdan geçmemiş/reddedilmiş varlık atlanır; insanın kabul ettiği alınır", async () => {
    const h = harness();
    const k = (n: string, dir = CHAR) => `${dir}${n.repeat(32)}.svg`;
    putAsset(h, k("4"), { passed: false });
    putAsset(h, k("5"), { passed: true, override: { decision: "rejected", at: "t" } });
    putAsset(h, k("6"), { passed: false, override: { decision: "accepted", at: "t" } });
    putAsset(h, k("7", BG), { passed: true });
    await episodeIn(h, "2026-10-01-stilsiz", undefined, { c1: k("6") });
    await episodeIn(h, "2026-10-02-bilinmeyen", "eski-paket", { c1: k("6") });
    await episodeIn(h, "2026-10-03-kadrosuz", "noir", { c1: k("6") }, { cast: undefined });
    await episodeIn(h, "2026-10-03-konseptsiz", "noir", {}, { concept: undefined });
    // Kapıdan geçmemiş, reddedilmiş ya da kaydı olmayan karakter atlanır.
    await episodeIn(h, "2026-10-04-noir", "noir", { c1: k("4"), c2: k("5"), c3: k("8"), l1: k("7", BG) });
    await episodeIn(h, "2026-10-03-noir-eski", "noir", { c1: k("6") });
    await episodeIn(h, "2026-10-06-comic", "comic-pop", { c1: k("7", BG) });
    const found = await existingSamples(h.store);
    expect(Object.keys(found)).toEqual(["noir"]);
    // En yeni bölüm önce: 10-04'ün karakterleri kullanılamaz, mekânı alınır; karakter daha eski bölümden.
    expect(found.noir).toMatchObject({ character: k("6"), background: k("7", BG), source: "library" });
  });
});
