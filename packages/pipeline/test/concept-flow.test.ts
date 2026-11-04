import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { QueryFn } from "@ys/agents";
import { styleFromPack, stylePackOf, VectorAssetMeta } from "@ys/core";
import { InMemoryLedger, MediaGateway } from "@ys/media-gateway";
import { FsAssetStore, getJson, putJson, type AssetStore } from "@ys/storage";
import { acceptAsset, EpisodePipeline, likenessKey, newEpisodeState, rejectAsset, type EpisodeInput, type EpisodeState } from "../src/index.ts";

// Remotion yok: 3D figür önizlemesi küçük dosya olarak yazılır; makine meşgul ya da render hatası taklit edilebilir.
const previews = vi.hoisted(() => ({ calls: [] as string[][], mode: "ok" as "ok" | "busy" | "fail" }));
vi.mock("@ys/video/render", () => ({
  renderEpisode: vi.fn(),
  renderStills: vi.fn(),
  renderThumbnail: vi.fn(),
  thumbnailShot: vi.fn(),
  thumbnailTitle: vi.fn(),
  renderFigurePreviews: async (o: { figures: Record<string, unknown>; outDir: string }) => {
    previews.calls.push(Object.keys(o.figures));
    if (previews.mode === "busy") return undefined;
    if (previews.mode === "fail") throw new Error("WebGL yok");
    await mkdir(o.outDir, { recursive: true });
    const out: Record<string, string> = {};
    for (const name of Object.keys(o.figures)) await writeFile((out[name] = join(o.outDir, `${name}.png`)), "png");
    return out;
  },
}));

// Referans araması (Wikimedia) sahte: gerçek kişinin fotoğrafı istenince verilir, varsayılan boş.
const found = vi.hoisted(() => ({ images: [] as { data: Uint8Array; mimeType: string }[] }));
vi.mock("../src/reference.ts", async (orig) => ({
  ...(await orig<object>()),
  findReferences: async () => ({ images: found.images, sources: found.images.map(() => ({ title: "Commons", url: "https://commons" })), keys: found.images.map((_, i) => `library/refs/r${i}.jpg`) }),
  findVectorSources: async () => [],
}));

/**
 * Konsept aşaması uçtan uca, sahte Claude ile (para harcamaz): plan → çizim → kör tahmin → kapı → kütüphane; ret, insan
 * kararı ve yeniden çizim akışları. Sahte ajan, istenen JSON şemasının alanlarından hangi ajan olduğunu anlar.
 */
const CHARACTER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800">' +
  ["leg-l", "leg-r", "body", "arm-l", "arm-r", "head"].map((id) => `<g id="${id}"><rect x="150" y="100" width="100" height="100" fill="#c33"/></g>`).join("") +
  "</svg>";
const ROOM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect x="0" y="700" width="1920" height="380" fill="#888"/></svg>';

interface Calls {
  designer: string[];
  planner: number;
  gate: number;
  /** 3D figür ajanına gelen her istekteki görsel sayısı. */
  figure: number[];
  /** true: figür ajanı geçersiz renk döndürür (tarif kurulamaz). */
  figureBroken?: boolean;
  /** Benzerlik ajanına gelen istek sayısı. */
  likeness?: number;
  /** Kapının uzuv puanı (her çağrıda; yoksa null: puanlanmadı). */
  limbs?: (system: string) => number | null;
  /** Görselli isteklerin metni, ajan türüyle (şemanın ilk alanı). */
  seen?: { agent: string; text: string }[];
}

const LIKENESS_OUT = (() => {
  const none = { value: null, confidence: 0 };
  const noColor = { hex: null, confidence: 0 };
  return {
    status: "ok",
    rejection: null,
    observation: {
      image: { medium: "color_photo", view: "frontal", quality: "high" },
      apparentAge: { value: 45, confidence: 0.8 },
      build: { weight: { value: 0.75, confidence: 0.8 }, muscle: none, shoulders: none },
      head: { shape: none, faceLength: none, faceWidth: none, foreheadHeight: none, jawWidth: none, jawDefinition: none, chin: none, chinProjection: none },
      eyes: { size: none, spacing: none, tilt: none, depth: none, shape: none, color: none },
      brows: { thickness: { value: 0.9, confidence: 0.9 }, arch: none, shape: none, gap: none, heightAboveEyes: none, color: { hex: "#2B1D14", confidence: 0.8 } },
      nose: { size: none, length: none, bridgeWidth: none, tipWidth: none, tip: none, profile: none },
      mouth: { width: none, upperLip: none, lowerLip: none },
      ears: { size: none, protrusion: none },
      skin: { tone: noColor, wrinkles: none },
      hair: { length: none, texture: none, volume: none, baldness: { value: 0.75, confidence: 0.9 }, hairline: none, part: none, style: [], color: noColor, gray: none },
      facialHair: { beard: { value: "full", confidence: 0.9 }, moustache: none, color: noColor },
      accessories: { glasses: none, glassesShape: none, glassesFrame: none, headwear: none },
      distinctive: ["bald crown", "bushy black brows"],
      notes: [],
    },
  };
})();

/** Görselli isteğin (async iterable) metni ve görsel sayısı. */
async function inspect(prompt: unknown): Promise<{ text: string; images: number }> {
  let text = "";
  let images = 0;
  for await (const m of prompt as AsyncIterable<{ message: { content: { type: string; text?: string }[] } }>)
    for (const c of m.message.content) c.type === "image" ? images++ : (text += c.text ?? "");
  return { text, images };
}

const FIGURE = {
  skin: "#e0b08c",
  hair: { style: "short", color: "#3a2a20" },
  beard: "none",
  glasses: true,
  top: { style: "vest", color: "#c9694a", inner: "#f4efe4" },
  bottom: { style: "trousers", color: "#4a5a78" },
  shoes: "#5a3a26",
  build: "slim",
};

function fakeClaude(score: () => number, calls: Calls): QueryFn {
  return ((params: { prompt: unknown; options?: { outputFormat?: { schema?: { properties?: Record<string, unknown> } }; systemPrompt?: string } }) => {
    const props = Object.keys(params.options?.outputFormat?.schema?.properties ?? {});
    const prompt = typeof params.prompt === "string" ? params.prompt : "(görselli istek)";
    let out: unknown;
    if (props.includes("svg")) {
      calls.designer.push(prompt);
      const background = /^Location:/.test(prompt);
      out = background ? { svg: ROOM_SVG, realHeight: 3, grounded: true, floorY: 700 } : { svg: CHARACTER_SVG, realHeight: 1.7, grounded: true };
    } else if (props.includes("cues")) {
      calls.planner++;
      out = { subject: "a young rider standing", moved: [], pose: "front", silhouette: "", parts: [], cues: ["hat", "bag"], avoid: [], referencesMatch: null, betterQuery: "" };
    } else if (props.includes("confidence")) {
      out = { guess: "a person", confidence: 8 };
    } else if (props.includes("recognizable")) {
      calls.gate++;
      out = { recognizable: score(), fidelity: null, limbs: calls.limbs?.(params.options?.systemPrompt ?? "") ?? null, defects: ["arms too short"] };
    } else if (props.includes("shoes")) {
      out = calls.figureBroken ? { ...FIGURE, skin: "ten rengi" } : FIGURE;
      return (async function* () {
        const seen = await inspect(params.prompt);
        calls.figure.push(seen.images);
        calls.seen?.push({ agent: "figure", text: seen.text });
        yield { type: "result", subtype: "success", duration_ms: 10, total_cost_usd: 0.001, structured_output: out };
      })();
    } else if (props.includes("observation")) {
      calls.likeness = (calls.likeness ?? 0) + 1;
      out = LIKENESS_OUT;
    } else throw new Error(`bilinmeyen ajan: ${props.join(",")}`);
    return (async function* () {
      if (typeof params.prompt !== "string") calls.seen?.push({ agent: props[0]!, text: (await inspect(params.prompt)).text });
      yield { type: "result", subtype: "success", duration_ms: 10, total_cost_usd: 0.001, structured_output: out };
    })();
  }) as unknown as QueryFn;
}

const input: EpisodeInput = {
  topic: "Pony Express",
  lang: "tr",
  targetSec: 60,
  tier: "economy",
  aiClipRatio: 0,
  budgetUsd: 3,
  width: 1920,
  height: 1080,
  fps: 30,
  motionMode: "vector",
};

async function setup(score: () => number, pack = "flat-explainer", reference?: string) {
  const store: AssetStore = new FsAssetStore(mkdtempSync(join(tmpdir(), "ys-concept-")));
  const calls: Calls = { designer: [], planner: 0, gate: 0, figure: [], seen: [] };
  const pipeline = new EpisodePipeline({
    gateway: new MediaGateway({ providers: [], store, ledger: new InMemoryLedger() }),
    store,
    ledger: new InMemoryLedger(),
    workDir: mkdtempSync(join(tmpdir(), "ys-work-")),
    agentDeps: { queryFn: fakeClaude(score, calls) },
  });
  const state: EpisodeState = {
    ...newEpisodeState(input),
    style: styleFromPack(stylePackOf(pack)!),
    script: { title: "t", scenes: [] } as never,
    cast: {
      characters: [{ id: "c1", name: "Rider", kind: "person", role: "rider", visualDescription: "young rider", scenes: [], ...(reference ? { reference } : {}) }],
      locations: [{ id: "l1", name: "Station", visualDescription: "relay station", scenes: [] }] as never,
    },
    done: { style: "x", story: "x", script: "x", cast: "x" },
    approvals: { script: "x" },
  };
  await pipeline.save(state);
  return { store, calls, pipeline, id: state.id };
}

describe("konsept akışı (sahte Claude)", () => {
  it("geçen çizim seçilir, kütüphaneye kimliği ve planıyla yazılır", async () => {
    const { store, calls, pipeline, id } = await setup(() => 9);
    const state = await pipeline.run(id, { until: "concept" });
    expect(Object.keys(state.concept!.selected).sort()).toEqual(["c1", "l1"]);
    const key = state.concept!.selected.c1!.key;
    const meta = VectorAssetMeta.parse(await getJson(store, `${key}.json`));
    expect(meta.check).toMatchObject({ passed: true, entityId: "c1", plan: { subject: "a young rider standing" } });
    expect(meta.identity).toMatchObject({ name: "Rider", pack: "flat-explainer" });
    expect(calls.designer).toHaveLength(2);
    expect(calls.planner).toBe(2);
    // Düz pakette 3D figür yok.
    expect(meta.figure).toBeUndefined();
    expect(calls.figure).toEqual([]);
  });

  it("3D pakette onaylı karakterin çizimi figür ajanına gider; tarif paketin yüzeyiyle kütüphaneye yazılır, bir kez", async () => {
    previews.calls.length = 0;
    previews.mode = "ok";
    const { store, calls, pipeline, id } = await setup(() => 9, "clay");
    let state = await pipeline.run(id, { until: "concept" });
    const key = state.concept!.selected.c1!.key;
    const saved = VectorAssetMeta.parse(await getJson(store, `${key}.json`));
    expect(saved.figure).toMatchObject({ finish: "clay", glasses: true, top: { style: "vest", inner: "#f4efe4" } });
    // Önizleme PNG'si figürün yanında; Stüdyo konsept kartı için bölümde de anılır.
    const png = key.replace(/\.svg$/, ".figure.png");
    expect(saved.figurePreview).toBe(png);
    expect(new TextDecoder().decode((await store.get(png))!)).toBe("png");
    expect(state.figurePreviews).toEqual({ [key]: png });
    expect(previews.calls).toEqual([["f0"]]);
    // Yalnız karakter (mekân figür olmaz); referans yok: yalnız çizimin kendisi.
    expect(calls.figure).toEqual([1]);
    expect(state.activity!.some((a) => a.msg.includes("Rider: 3D figür hazır (short saç, vest)"))).toBe(true);

    // Konsept yeniden çalışınca hazır tarif yeniden istenmez, önizleme yeniden çizilmez.
    delete state.done.concept;
    await pipeline.save(state);
    state = await pipeline.run(id, { until: "concept" });
    expect(calls.figure).toEqual([1]);
    expect(previews.calls).toHaveLength(1);
    expect(state.figurePreviews).toEqual({ [key]: png });

    // Tarif yoksa (ör. Stüdyo'da başka çizim seçildi) yeniden hazırlanır; gerçek kişinin kayıtlı referansları da gider
    // (en çok iki, depoda olmayan atlanır).
    const meta = VectorAssetMeta.parse(await getJson(store, `${key}.json`));
    await store.put("library/refs/a.jpg", new Uint8Array([255, 216, 255]), "image/jpeg");
    await store.put("library/refs/b.jpg", new Uint8Array([255, 216, 255]), "image/jpeg");
    await putJson(store, `${key}.json`, { ...meta, figure: undefined, check: { ...meta.check!, refs: ["library/refs/yok.jpg", "library/refs/a.jpg", "library/refs/b.jpg"] } });
    delete state.done.concept;
    await pipeline.save(state);
    await pipeline.run(id, { until: "concept" });
    expect(calls.figure).toEqual([1, 2]);
    // Tarif yenilendi: önizleme de yeniden çizilir.
    expect(previews.calls).toHaveLength(2);
  });

  it("önizleme: makine meşgulse sonraya kalır, hata olursa bölüm durmaz; kayıtlı PNG kaybolduysa yeniden çizilir", async () => {
    previews.calls.length = 0;
    previews.mode = "busy";
    const { store, pipeline, id } = await setup(() => 9, "vinyl-toy");
    let state = await pipeline.run(id, { until: "concept" });
    const key = state.concept!.selected.c1!.key;
    expect(state.figurePreviews).toBeUndefined();
    expect(VectorAssetMeta.parse(await getJson(store, `${key}.json`)).figurePreview).toBeUndefined();
    expect(state.activity!.some((a) => a.msg.includes("önizlemesi sonraya kaldı"))).toBe(true);

    previews.mode = "fail";
    delete state.done.concept;
    await pipeline.save(state);
    state = await pipeline.run(id, { until: "concept" });
    expect(state.activity!.some((a) => a.msg.includes("önizlemesi çıkarılamadı: WebGL yok"))).toBe(true);

    // Kayıtta önizleme var ama dosyası yok: yeniden çizilir.
    previews.mode = "ok";
    const meta = VectorAssetMeta.parse(await getJson(store, `${key}.json`));
    await putJson(store, `${key}.json`, { ...meta, figurePreview: "library/yok.png" });
    delete state.done.concept;
    await pipeline.save(state);
    state = await pipeline.run(id, { until: "concept" });
    expect(previews.calls).toHaveLength(3);
    expect(state.figurePreviews![key]).toBe(key.replace(/\.svg$/, ".figure.png"));
    expect(state.activity!.some((a) => a.msg.includes("3D figür önizlemesi: 1 figür"))).toBe(true);
  });

  it("figür tarifi kurulamazsa SVG çizimle sürer, bölüm durmaz", async () => {
    const { store, calls, pipeline, id } = await setup(() => 9, "soft-3d");
    calls.figureBroken = true;
    const state = await pipeline.run(id, { until: "concept" });
    expect(state.concept!.selected.c1).toBeDefined();
    expect(VectorAssetMeta.parse(await getJson(store, `${state.concept!.selected.c1!.key}.json`)).figure).toBeUndefined();
    expect(state.activity!.some((a) => a.msg.includes("Rider: 3D figür hazırlanamadı"))).toBe(true);
  });

  it("kapıyı geçemeyen karakter 3 denemeden sonra reddedilir; Stüdyo bölümü çökmez, seçim yapılmaz", async () => {
    const { calls, pipeline, id } = await setup(() => 5);
    const state = await pipeline.run(id, { until: "concept" });
    expect(state.concept!.selected.c1).toBeUndefined();
    const check = Object.values(state.assetChecks!).find((c) => c.entityId === "c1")!;
    expect(check).toMatchObject({ passed: false, attempts: 3 });
    expect(check.rejectedKey).toMatch(/\.rejected\.svg$/);
    // Yeniden çizimler kapının kusurlarını düzeltme olarak alır.
    expect(calls.designer.filter((p) => p.startsWith("Character")).at(-1)).toContain("arms too short");
    // Yeniden çizim önceki denemenin üzerinden yapılır; önceki izleyici tahminleri birikir.
    const redraw = calls.designer.filter((p) => p.startsWith("Character")).at(-1)!;
    expect(redraw).toContain("<previous_svg>");
    expect(redraw).toContain(`saw: "a person", then "a person"`);
    expect(calls.designer.find((p) => p.startsWith("Character"))).not.toContain("<previous_svg>");

    // Devam: bu bölümde reddedilmiş karakter yeniden çizilmez (para gitmez), karar insanın.
    calls.designer.length = 0;
    const again = await pipeline.run(id, { until: "concept" });
    expect(again.concept!.selected.c1).toBeUndefined();
    expect(calls.designer.filter((p) => p.startsWith("Character"))).toHaveLength(0);
  });

  it("tanınan ama kolları ve elleri bozuk karakter geçmez: uzuvlar düzelene kadar yeniden çizilir; mekânda uzuv puanı sayılmaz", async () => {
    const { calls, pipeline, id } = await setup(() => 9);
    // Karakterde ilk çizimin uzuvları 5 (ayrı borular, eldiven eller), ikincisi 8; mekânda denetçi 3 verse de sayılmaz.
    const limbs = [5, 8];
    calls.limbs = (system) => (system.includes("puppet character") ? limbs.shift()! : 3);
    const state = await pipeline.run(id, { until: "concept" });
    const check = Object.values(state.assetChecks!).find((c) => c.entityId === "c1")!;
    expect(check).toMatchObject({ passed: true, attempts: 2, recognizable: 9, limbs: 8 });
    expect(calls.designer.filter((p) => p.startsWith("Character")).at(-1)).toContain("arms too short");
    const room = Object.values(state.assetChecks!).find((c) => c.entityId === "l1")!;
    expect(room).toMatchObject({ passed: true, attempts: 1 });
    expect(room.limbs).toBeUndefined();
    expect(state.concept!.selected.c1).toBeDefined();
  });

  it("ilk iki çizim de tanınmazsa (≤4/10) üçüncüsü çizilmez", async () => {
    const { calls, pipeline, id } = await setup(() => 3);
    const state = await pipeline.run(id, { until: "concept" });
    const check = Object.values(state.assetChecks!).find((c) => c.entityId === "c1")!;
    expect(check).toMatchObject({ passed: false, attempts: 2 });
    expect(calls.designer.filter((p) => p.startsWith("Character"))).toHaveLength(2);
  });

  it("insan notla reddedince yeni anahtara çizilir, not her denemede kalır, eski çizim yerinde kalır", async () => {
    let score = 9;
    const { store, calls, pipeline, id } = await setup(() => score);
    let state = await pipeline.run(id, { until: "concept" });
    const first = state.concept!.selected.c1!.key;
    const firstSvg = new TextDecoder().decode((await store.get(first))!);

    await rejectAsset(store, state, first, "hat must be flat-brimmed");
    await pipeline.save(state);
    calls.designer.length = 0;
    score = 5;
    state = await pipeline.run(id, { until: "concept" });
    const redraws = calls.designer.filter((p) => p.startsWith("Character"));
    expect(redraws).toHaveLength(3);
    for (const p of redraws) expect(p).toContain("Human reviewer: hat must be flat-brimmed");
    const second = Object.entries(state.assetChecks!).find(([k, c]) => c.entityId === "c1" && k !== first)!;
    expect(second[0]).not.toBe(first);
    expect(new TextDecoder().decode((await store.get(first))!)).toBe(firstSvg);

    // İnsan reddedileni kabul eder: yeni anahtara yazılır ve seçilir.
    await acceptAsset(store, state, second[0]);
    expect(state.concept!.selected.c1?.key).toBe(second[0]);
  });
  it("gerçek kişi: referanslardan benzerlik bir kez ölçülür; tasarımcı kaydı, kapı ipuçlarını, 3D figür ajanı ölçüyü alır", async () => {
    previews.mode = "ok";
    found.images = [{ data: new Uint8Array([255, 216, 255]), mimeType: "image/jpeg" }];
    try {
      const { store, calls, pipeline, id } = await setup(() => 9, "clay", "Pony Express rider photo");
      await store.put("library/refs/r0.jpg", new Uint8Array([255, 216, 255]), "image/jpeg");
      let state = await pipeline.run(id, { until: "concept" });
      expect(calls.likeness).toBe(1);
      expect(await getJson(store, likenessKey("Pony Express rider photo"))).toMatchObject({ status: "ok" });
      const text = (agent: string) => calls.seen!.filter((s) => s.agent === agent).map((s) => s.text);
      // Tasarımcı (görselli istek: şemanın ilk alanı svg) kaydı, kapı ipuçlarını alır.
      expect(text("svg").some((t) => t.includes("Likeness sheet") && t.includes("- Brows: very thick, #2B1D14") && t.includes("- Hair: marked baldness"))).toBe(true);
      expect(text("recognizable").some((t) => t.includes("Likeness measured from the reference photos") && t.includes("bald crown; bushy black brows"))).toBe(true);
      // 3D figür ajanı çizim + fotoğraf ve ölçülen benzerlik.
      expect(text("figure").at(-1)).toContain("- Build: heavy");
      expect(calls.figure).toEqual([2]);
      expect(state.activity!.some((a) => a.msg.includes("Rider: benzerlik ölçüldü (bald crown; bushy black brows)"))).toBe(true);

      // Konsept yeniden: kütüphanede çizim ve ölçü var, ajan yeniden sorulmaz.
      delete state.done.concept;
      await pipeline.save(state);
      state = await pipeline.run(id, { until: "concept" });
      expect(calls.likeness).toBe(1);
    } finally {
      found.images = [];
    }
  });
});
