import { VectorShot, type PlacedLayer, type VectorAsset } from "@ys/core";
import { describe, expect, it } from "vitest";
import { cameraDrift, depthOfField, focusLayer, LENS, lensScale, screenGlow, type LensModel } from "../src/lens.ts";

const pl = (index: number, x: number, z: number, extra: Partial<PlacedLayer> = {}): PlacedLayer => ({ index, x, y: 900, height: 500, width: 200, scale: 1, z, sitting: false, grounded: true, fixes: [], ...extra });
const asset = (id: string, kind: VectorAsset["kind"], meta: VectorAsset["meta"] = {}): VectorAsset => ({ id, kind, svg: "<svg/>", width: 100, height: 100, meta });
const SAFE = { hero: asset("hero", "character"), ada: asset("ada", "character"), cup: asset("cup", "prop"), desk: asset("desk", "prop"), map: asset("map", "background", { exact: true }) };
const close = { zoomFrom: 2.2, zoomTo: 2.2, panX: 0, focusX: 700, focusY: 500 };
const model = (layers: object[], placed: PlacedLayer[], extra: Partial<LensModel> = {}, shot: object = {}): LensModel => ({
  spec: VectorShot.parse({ layers, camera: close, ...shot }),
  safe: SAFE,
  placed,
  cam: close,
  ...extra,
});

describe("sinematografi: netlik düzlemi", () => {
  it("özne, yoksa anlatılan nesne, yoksa konuşan ya da odağa en yakın kişi; kimse yoksa yok", () => {
    const layers = [{ asset: "hero", x: 700 }, { asset: "ada", x: 1300 }, { asset: "cup", x: 900 }];
    const placed = [pl(0, 700, 70), pl(1, 1300, 70), pl(2, 900, 70)];
    expect(focusLayer(model(layers, placed, { subject: 2 }))).toBe(2);
    expect(focusLayer(model(layers, placed, {}, { key: 2 }))).toBe(2);
    // Yerleşmemiş özne sayılmaz; odak (700, 500) hero'nun yüzünde.
    expect(focusLayer(model(layers, placed, { subject: 5 }))).toBe(0);
    // Konuşan, odaktan uzak olsa da önce gelir.
    const talking = layers.map((l, i) => (i === 1 ? { ...l, anims: [{ type: "talk" }] } : l));
    expect(focusLayer(model(talking, placed))).toBe(1);
    // Odak verilmemişse karenin ortası (960): ona en yakın kişi ada değil hero (700 < 1300 uzaklığı).
    const centred = { ...model(layers, placed), cam: { zoomFrom: 2, zoomTo: 2, panX: 0 } };
    expect(focusLayer(centred)).toBe(0);
    expect(focusLayer(model([{ asset: "cup", x: 900 }], [pl(0, 900, 70)]))).toBeUndefined();
  });

  it("geniş çekimde, haritada, Manim tahtasında, makroda ve netlenecek bir şey yokken alan derinliği yok", () => {
    const layers = [{ asset: "hero", x: 700 }];
    const placed = [pl(0, 700, 70)];
    const wide = { ...model(layers, placed), cam: { zoomFrom: 1, zoomTo: 1.1, panX: 0 } };
    expect(depthOfField(wide, 1)).toBeUndefined();
    expect(depthOfField(model(layers, placed, { macro: 0 }), 1)).toBeUndefined();
    expect(depthOfField(model(layers, placed, { bg: SAFE.map }), 1)).toBeUndefined();
    expect(depthOfField(model(layers, placed, {}, { math: { steps: ["x"] } }), 1)).toBeUndefined();
    expect(depthOfField(model([{ asset: "cup", x: 900 }], [pl(0, 900, 70)]), 1)).toBeUndefined();
    // Kamera yaklaşırken alan derinliği zoom'la artar (k: kamera ilerlemesi).
    const push = { ...model(layers, placed), cam: { zoomFrom: 1, zoomTo: 2.2, panX: 0, focusX: 700, focusY: 500 } };
    expect(lensScale(push.cam, 0.5)).toBeCloseTo(1.6, 6);
    expect(depthOfField(push, 0)).toBeUndefined();
    expect(depthOfField(push, 0.5)!.bg).toBeLessThan(depthOfField(push, 1)!.bg);
  });
});

describe("sinematografi: kim bulanıklaşır", () => {
  // hero konuşmuyor; arkada ada (z 20), önde masa (z 95) ve uzaktaki fincan (z 10).
  const layers = [{ asset: "hero", x: 700 }, { asset: "ada", x: 1300 }, { asset: "desk", x: 900 }, { asset: "cup", x: 1500 }];
  const placed = [pl(0, 700, 70), pl(1, 1300, 20), pl(2, 900, 95), pl(3, 1500, 10)];

  it("netlik düzleminin önü ve arkası derinlik farkıyla, tavanla; kişi en çok person kadar, duvar bg kadar", () => {
    const d = depthOfField(model(layers, placed), 1)!;
    expect(d.layers.has(0)).toBe(false);
    // Masa: |95 − 70| − 12 = 13 → 13 × 0,08 = 1,04 px.
    expect(d.layers.get(2)).toBeCloseTo(13 * LENS.perDepth, 6);
    // Fincan: |10 − 70| − 12 = 48 → 3,84 px (tavan max).
    expect(d.layers.get(3)).toBeCloseTo(Math.min(LENS.max, (60 - LENS.band) * LENS.perDepth), 6);
    expect(d.layers.get(1)).toBe(LENS.person);
    expect(d.bg).toBe(LENS.bg);
    expect(d.crowd).toBe(0);
    // Bant içindeki fark ya da min'in altındaki bulanıklık yazılmaz.
    const near = depthOfField(model(layers, [pl(0, 700, 70), pl(1, 1300, 75), pl(2, 900, 86), pl(3, 1500, 66)]), 1)!;
    expect([...near.layers.keys()]).toEqual([]);
  });

  it("kişiler yalnız gerçek yakın çekimde bulanıklaşır; konuşan her zaman net", () => {
    const medium = { ...model(layers, placed), cam: { ...close, zoomFrom: 1.6, zoomTo: 1.6 } };
    const d = depthOfField(medium, 1)!;
    expect(d.layers.has(1)).toBe(false);
    expect(d.layers.has(3)).toBe(true);
    const talking = layers.map((l, i) => (i === 1 ? { ...l, anims: [{ type: "talk" }] } : l));
    // Konuşan ada, odak hero'da kalsın diye özne verilir.
    expect(depthOfField(model(talking, placed, { subject: 0 }), 1)!.layers.has(1)).toBe(false);
  });

  it("öznenin tutanı, tuttuğu, altındaki, üstündeki, anlatılan nesne, balon nesnesi ve ekranlı her şey net", () => {
    const set = [
      { asset: "hero", x: 700 },
      { asset: "cup", x: 700, heldBy: 0 },
      { asset: "desk", x: 900 },
      { asset: "cup", x: 900, on: 2 },
      { asset: "cup", x: 1500 },
      { asset: "cup", x: 1600 },
      { asset: "desk", x: 1700, screen: { kind: "code", lines: ["x"] } },
    ];
    const far = (i: number, x: number, extra: Partial<PlacedLayer> = {}) => pl(i, x, 5, extra);
    const at = [pl(0, 700, 70), far(1, 700, { heldBy: 0 }), far(2, 900), far(3, 900, { on: 2 }), far(4, 1500), far(5, 1600), far(6, 1700)];
    // Özne fincan (1): tutan hero net; anlatılan nesne 4, balon nesnesi 5, ekranlı 6 net; masa (2) ve üstündeki fincan
    // (3) özneyle ilgisiz: bulanık değil çünkü z'leri fincanla aynı (5).
    const held = depthOfField(model(set, at, { subject: 1 }, { key: 4, callout: 5 }), 1)!;
    expect([...held.layers.keys()]).toEqual([]);
    // Özne masa (2): üstündeki fincan (3) net; hero uzak (70 − 5), bulanık.
    const desk = depthOfField(model(set, at, { subject: 2 }), 1)!;
    expect(desk.layers.has(3)).toBe(false);
    expect(desk.layers.get(0)).toBe(LENS.person);
    // Özne masadaki fincan (3): altındaki masa net.
    expect(depthOfField(model(set, [...at.slice(0, 2), pl(2, 900, 95), ...at.slice(3)], { subject: 3 }), 1)!.layers.has(2)).toBe(false);
  });

  it("havada duran nesneye netlenince netlik en yakın kişinin düzleminde; kişi yoksa nesnenin", () => {
    const air = [{ asset: "hero", x: 700 }, { asset: "ada", x: 1500 }, { asset: "cup", x: 960 }];
    const at = [pl(0, 700, 70), pl(1, 1500, 30), pl(2, 960, -10, { grounded: false })];
    const d = depthOfField(model(air, at, { subject: 2 }), 1)!;
    expect(d.layers.has(0)).toBe(false);
    expect(d.layers.has(1)).toBe(true);
    expect(d.bg).toBe(LENS.bg);
    // Yerdeki nesnede netlik kendi derinliğinde (kişiler bulanıklaşır).
    expect(depthOfField(model(air, [...at.slice(0, 2), pl(2, 960, -10)], { subject: 2 }), 1)!.layers.has(0)).toBe(true);
    // Kişisiz havadaki nesne kendi düzleminde: duvar net.
    expect(depthOfField(model([{ asset: "cup", x: 960 }], [pl(0, 960, 0, { grounded: false })], { subject: 0 }), 1)!.bg).toBe(0);
  });

  it("figüranlar kendi sıralarının derinliğinde bulanıklaşır", () => {
    expect(depthOfField(model(layers, placed, { crowd: { z: 20 } }), 1)!.crowd).toBe(LENS.person);
  });
});

describe("sinematografi: kameranın nefesi ve ekran parıltısı", () => {
  const parse = (tr: string) => {
    const m = /^translate\(960px, 540px\) scale\(([\d.]+)\) translate\((-?[\d.]+)px, (-?[\d.]+)px\)$/.exec(tr)!;
    return { scale: Number(m[1]), dx: Number(m[2]) + 960, dy: Number(m[3]) + 540 };
  };

  it("tohumlu, yavaş, en çok amp px; overscan kenarı kapatır; aynı tohum aynı salınım", () => {
    const xs = Array.from({ length: 60 }, (_, i) => parse(cameraDrift("s1-sh1", i * 0.5)));
    for (const { scale, dx, dy } of xs) {
      expect(scale).toBe(1 + LENS.drift.overscan);
      expect(Math.abs(dx)).toBeLessThanOrEqual(LENS.drift.amp + 0.01);
      expect(Math.abs(dy)).toBeLessThanOrEqual(LENS.drift.amp * 0.6 + 0.01);
    }
    // Kenar boşluğu açılmaz: overscan'in kenarda kazandırdığı pay salınımdan büyük.
    expect((LENS.drift.overscan * 1920) / 2).toBeGreaterThan(LENS.drift.amp);
    expect((LENS.drift.overscan * 1080) / 2).toBeGreaterThan(LENS.drift.amp * 0.6);
    // Yavaş: kare başına (1/30 sn) yarım pikselden az.
    const a = parse(cameraDrift("s1-sh1", 3));
    const b = parse(cameraDrift("s1-sh1", 3 + 1 / 30));
    expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeLessThan(0.5);
    expect(cameraDrift("s1-sh1", 3)).toBe(cameraDrift("s1-sh1", 3));
    expect(cameraDrift("s2-sh1", 3)).not.toBe(cameraDrift("s1-sh1", 3));
  });

  it("ışık saçan ekran içeriğiyle parlar (kod ve terminal mavimsi); kara tahta parlamaz", () => {
    expect(screenGlow(asset("p-monitor", "prop"), "code", 200, 120)).toContain("rgba(120,190,255,0.32)");
    expect(screenGlow(asset("p-tv", "prop"), "web", 400, 300)).toMatch(/^0 0 42\.0px rgba\(235,245,255,0\.38\), 0 0 100\.8px/);
    // Küçük ekranda en az 4 px.
    expect(screenGlow(asset("p-iphone", "prop"), "chat", 10, 20)).toMatch(/^0 0 4\.0px/);
    expect(screenGlow(asset("p-ibm-pc", "prop"), "terminal", 100, 100)).toBeDefined();
    expect(screenGlow(asset("p-blackboard", "prop"), "text", 400, 300)).toBeUndefined();
    expect(screenGlow(asset("p-pcb", "prop"), "text", 400, 300)).toBeUndefined();
  });
});
