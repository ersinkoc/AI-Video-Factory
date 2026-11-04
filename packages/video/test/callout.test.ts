import { VectorShot, type PlacedLayer } from "@ys/core";
import { describe, expect, it } from "vitest";
import { CALLOUT, calloutScale, calloutSpot, calloutTarget, overlap } from "../src/callout.ts";

const pl = (index: number, height: number, extra: Partial<PlacedLayer> = {}): PlacedLayer => ({ index, x: 960, y: 800, height, width: height, scale: 1, z: 0, sitting: false, grounded: true, fixes: [], ...extra });
const shot = (extra: object = {}) => VectorShot.parse({ layers: [{ asset: "a", x: 0 }, { asset: "b", x: 0 }, { asset: "c", x: 0 }], ...extra });
const props = (i: number) => i !== 0;

describe("büyütme balonu: hangi nesne", () => {
  it("yönetmen istemediyse elde tutulan küçük nesne; büyük ya da elde olmayan nesneye balon yok", () => {
    const placed = [pl(0, 600), pl(1, 60, { heldBy: 0 }), pl(2, 40)];
    expect(calloutTarget(shot(), placed, props, 1)).toBe(1);
    // Zoom'da ekrandaki boy büyür: 60 px × 2 = 120 > 108.
    expect(calloutTarget(shot(), placed, props, 2)).toBeUndefined();
    expect(calloutTarget(shot(), [pl(0, 600), pl(2, 40)], props, 1)).toBeUndefined();
  });

  it("elde nesne yoksa masaya konan çok küçük nesnelerin en küçüğü; masa, üstünde bir şey duran nesne ve okunur boydaki nesne değil", () => {
    // Masa (1), üstünde monitör (2, 100 px: okunur), zarf (3, 30 px), kalem (4, 20 px), monitörün üstünde etiket (5, 25 px).
    const desk = [pl(0, 600), pl(1, 300), pl(2, 100, { on: 1 }), pl(3, 30, { on: 1 }), pl(4, 20, { on: 1 }), pl(5, 25, { on: 2 })];
    const all = () => true;
    expect(calloutTarget(shot(), desk, all, 1)).toBe(4);
    // Eşit boyda kimlik sırası; okunur boydakiler (6%'nın üstü) aday değil.
    expect(calloutTarget(shot(), [pl(1, 300), pl(3, 30, { on: 1 }), pl(4, 30, { on: 1 })], all, 1)).toBe(3);
    expect(calloutTarget(shot(), [pl(1, 300), pl(2, 100, { on: 1 })], all, 1)).toBeUndefined();
    // Masada yalnız karakter oturuyorsa (nesne değil) balon yok; elde tutulan küçük nesne masadakinden önce gelir.
    expect(calloutTarget(shot(), [pl(1, 300), pl(4, 20, { on: 1 })], (i) => i !== 4, 1)).toBeUndefined();
    expect(calloutTarget(shot(), [...desk, pl(6, 60, { heldBy: 0 })], all, 1)).toBe(6);
  });

  it("yönetmenin seçtiği nesne: küçükse balon, büyük, karakter ya da yerleşmemişse yok", () => {
    const placed = [pl(0, 600), pl(1, 60, { heldBy: 0 }), pl(2, 200)];
    expect(calloutTarget(shot({ callout: 2 }), placed, props, 1)).toBe(2);
    expect(calloutTarget(shot({ callout: 2 }), placed, props, 1.4)).toBeUndefined();
    expect(calloutTarget(shot({ callout: 0 }), placed, props, 1)).toBeUndefined();
    expect(calloutTarget(shot({ callout: 2 }), placed.slice(0, 2), props, 1)).toBeUndefined();
  });

  it("yakın çekimde yalnız kameranın okunur boya getiremediği özne nesneye; Manim tahtalı çekimde hiç", () => {
    const placed = [pl(0, 600), pl(1, 60, { heldBy: 0 }), pl(2, 100, { on: 0 })];
    // Kişi yakın çekimi (özne nesne yok): balon yok.
    expect(calloutTarget(shot(), placed, props, CALLOUT.closeUp)).toBeUndefined();
    // Özne 60 px × 1,5 = 90 < 162 (kare yüksekliğinin %15'i): balon; 100 px × 2 = 200: zaten okunur.
    expect(calloutTarget(shot(), placed, props, CALLOUT.closeUp, 1)).toBe(1);
    expect(calloutTarget(shot(), placed, props, 2, 2)).toBeUndefined();
    // Özne karakterse ya da yerleşmemişse yok; yönetmenin seçtiği nesne yakın çekimde sayılmaz.
    expect(calloutTarget(shot(), placed, props, 2, 0)).toBeUndefined();
    expect(calloutTarget(shot(), placed, props, 2, 9)).toBeUndefined();
    expect(calloutTarget(shot({ callout: 2 }), placed, props, 2)).toBeUndefined();
    expect(calloutTarget(shot({ math: { steps: ["a=b"] } }), placed, props, 1)).toBeUndefined();
  });
});

describe("büyütme balonu: yer ve açılış", () => {
  it("kesişim alanı", () => {
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(0);
  });

  it("yüzü ve yazıyı örtmeyen, nesneyi saklamayan, nesneye yakın yer", () => {
    // Boş sahne: nesneye en yakın aday (üstünde, onu örtmeden).
    expect(calloutSpot([1500, 800], [])).toEqual([1520, 560]);
    expect(calloutSpot([300, 800], [])).toEqual([400, 560]);
    // Orada bir yüz var: bir üst adaya çıkar.
    expect(calloutSpot([1500, 800], [{ x: 1400, y: 600, w: 300, h: 160 }])).toEqual([1520, 330]);
    // Nesnenin hemen yanındaki adaylar seçilmez: balon onu örterdi.
    const spot = calloutSpot([1520, 400], []);
    expect(Math.hypot(spot[0] - 1520, spot[1] - 400)).toBeGreaterThan(CALLOUT.r + 60);
  });

  it("çekimin başında kapalı, yaylanarak açılır (biraz taşar), sonra tam boy", () => {
    expect(calloutScale(0)).toBe(0);
    expect(calloutScale(CALLOUT.appear)).toBe(0);
    expect(calloutScale(CALLOUT.appear + CALLOUT.grow * 0.7)).toBeGreaterThan(1);
    expect(calloutScale(1)).toBeCloseTo(1);
  });
});
