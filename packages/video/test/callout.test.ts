import { VectorShot, type PlacedLayer } from "@ys/core";
import { describe, expect, it } from "vitest";
import { CALLOUT, calloutBlocked, calloutCost, calloutScale, calloutSpot, calloutTarget, overlap } from "../src/callout.ts";

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

  it("anlatılan nesne (key) hâlâ küçükse ona; okunur boydaysa, karakterse ya da yerleşmemişse öteki adaylar", () => {
    // Masa (0), üstünde küçük kalem (1, 20 px) ve anlatılan kâğıt (2, 200 px: %25'in altında, balon).
    const placed = [pl(0, 300), pl(1, 20, { on: 0 }), pl(2, 200, { on: 0 })];
    const all = () => true;
    expect(calloutTarget(shot({ key: 2 }), placed, all, 1)).toBe(2);
    // 200 × 1,4 = 280 ≥ 270: okunuyor; sıra masadaki en küçük nesneye gelir.
    expect(calloutTarget(shot({ key: 2 }), placed, all, 1.4)).toBe(1);
    expect(calloutTarget(shot({ key: 2 }), placed, (i) => i !== 2, 1)).toBe(1);
    expect(calloutTarget(shot({ key: 2 }), placed.slice(0, 2), all, 1)).toBe(1);
    // Yönetmenin balonu önce gelir.
    expect(calloutTarget(shot({ key: 2, callout: 1 }), placed, all, 1)).toBe(1);
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

  it("yakına geniş çekimi dolduran geçiş getirdiyse (özne yok) anlatılan nesne; içerikli ekranda ölçü ekranın boyu", () => {
    const placed = [pl(0, 600), pl(1, 60, { heldBy: 0 }), pl(2, 100, { on: 0 })];
    // Özne yok: anlatılan nesne 60 px × 2 = 120 < 162.
    expect(calloutTarget(shot({ key: 1 }), placed, props, 2)).toBe(1);
    // İçerikli ekranlı dizüstü 100 px × 2 = 200 (okunur sayılırdı) ama ekranı boyunun %50'si: 100 < 130 (%12): balon.
    const laptop = shot({ key: 2, layers: [{ asset: "a", x: 0 }, { asset: "b", x: 0 }, { asset: "c", x: 0, screen: { lines: ["PayPal"] } }] });
    expect(calloutTarget(laptop, placed, props, 2, undefined, () => 0.5)).toBe(2);
    // Ekranı büyük (%70: 140 px) monitör zaten okunur; ekranı bulunamayan nesnede yine alanın karekökü.
    expect(calloutTarget(laptop, placed, props, 2, undefined, () => 0.7)).toBeUndefined();
    expect(calloutTarget(laptop, placed, props, 1.5, undefined, () => undefined)).toBe(2);
    expect(calloutTarget(laptop, placed, props, 2, undefined)).toBeUndefined();
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
    // Orada bir kişinin göğsü var: gövde yarı ağırlıkla sayılır; üstteki aday da göğsün üst kenarına değdiğinden balon
    // ortaya yakın üst adaya gider.
    const chest = { x: 1440, y: 480, w: 160, h: 200 };
    expect(calloutSpot([1500, 800], [], [chest])).toEqual([1340, 290]);
    expect(calloutCost([1520, 560], [1500, 800], [], [chest])).toBeCloseTo(calloutCost([1520, 560], [1500, 800], []) + CALLOUT.body * 160 * 200);
  });

  it("yakın çekimde bir yüze değen ya da bir kişinin gövdesinin dörtte birinden çoğunu örten yerde balon açılmaz", () => {
    const face = { x: 1500, y: 300, w: 80, h: 80 };
    expect(calloutBlocked([1520, 330], [face], [], true)).toBe(true);
    // Geniş çekimde yüze değmek bedeldir, engel değil.
    expect(calloutBlocked([1520, 330], [face], [], false)).toBe(false);
    // Gövdenin yarısı balonun altında; köşesine değmek engel değil.
    expect(calloutBlocked([1520, 560], [], [{ x: 1500, y: 600, w: 100, h: 300 }], false)).toBe(true);
    expect(calloutBlocked([1520, 560], [], [{ x: 1680, y: 720, w: 100, h: 100 }], false)).toBe(false);
  });

  it("çekimin başında kapalı, yaylanarak açılır (biraz taşar), sonra tam boy", () => {
    expect(calloutScale(0)).toBe(0);
    expect(calloutScale(CALLOUT.appear)).toBe(0);
    expect(calloutScale(CALLOUT.appear + CALLOUT.grow * 0.7)).toBeGreaterThan(1);
    expect(calloutScale(1)).toBeCloseTo(1);
    // Nesnesi sahneye geç giriyorsa balon onun girişinden sonra açılır; appear'dan önce hiç açılmaz.
    expect(calloutScale(0.3, 0.35)).toBe(0);
    expect(calloutScale(0.35 + CALLOUT.grow, 0.35)).toBeCloseTo(1);
    expect(calloutScale(CALLOUT.appear, 0)).toBe(0);
  });
});
