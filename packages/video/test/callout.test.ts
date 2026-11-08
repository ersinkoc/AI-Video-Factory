import { VectorShot, type PlacedLayer } from "@ys/core";
import { describe, expect, it } from "vitest";
import { CALLOUT, calloutBlocked, calloutCost, calloutScale, calloutSpot, calloutTarget, clipSegment, isFurniture, leaderIn, leaderOf, leaderTip, overlap } from "../src/callout.ts";

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
  it("ekran yazısı olan nesnede çizgi ekranın kenarında biter, yazının üstünden geçmez (Linux s1-sh1)", () => {
    const screen = { x: 900, y: 400, w: 200, h: 100 };
    // Balon solda, nesnenin noktası ekranın ortasında: uç ekranın sol kenarı.
    expect(leaderTip([500, 450], [1000, 450], screen)).toEqual([900, 450]);
    // Nokta ekranın altında (kasada) ama çizgi ekrandan geçiyor: yine ilk değdiği yerde biter.
    expect(leaderTip([1000, 100], [1000, 600], screen)).toEqual([1000, 400]);
    // Çizgi ekrana değmiyor, ekran yok ya da balon ekranın içinde: uç nesnenin noktası.
    expect(leaderTip([500, 700], [1000, 700], screen)).toEqual([1000, 700]);
    expect(leaderTip([500, 450], [1000, 450])).toEqual([1000, 450]);
    expect(leaderTip([950, 450], [1000, 450], screen)).toEqual([1000, 450]);
  });

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
    // Orada bir kişinin göğsü var: gövde yarı ağırlıkla sayılır; üstteki aday da göğsün üst kenarına değiyor, ortaya
    // yakın üst adayın işaret çizgisi göğsün içinden geçiyor (leader bedeli), balon karşı taraftaki üst adaya gider.
    const chest = { x: 1440, y: 480, w: 160, h: 200 };
    expect(calloutSpot([1500, 800], [], [chest])).toEqual([580, 290]);
    expect(calloutCost([1520, 560], [1500, 800], [], [chest])).toBeCloseTo(calloutCost([1520, 560], [1500, 800], []) + CALLOUT.body * 160 * 200);
    const through = leaderIn(leaderOf([1340, 290], [1500, 800]), [chest]);
    expect(through).toBeGreaterThan(50);
    expect(calloutCost([1340, 290], [1500, 800], [], [chest])).toBeCloseTo(calloutCost([1340, 290], [1500, 800], []) + CALLOUT.body * CALLOUT.leader * through);
  });

  it("işaret çizgisi: balonun kenarından nesnenin kutusuna; kutulardan geçen boyu", () => {
    // Yatay çizgi, kutunun ortasından: [0.25, 0.75].
    expect(clipSegment([0, 50], [400, 50], { x: 100, y: 0, w: 200, h: 100 })).toEqual([0.25, 0.75]);
    // Kutunun yanından geçen, kutuya paralel dışarıda ve içeride kalan çizgiler.
    expect(clipSegment([0, 150], [400, 150], { x: 100, y: 0, w: 200, h: 100 })).toBeUndefined();
    expect(clipSegment([150, -50], [150, -10], { x: 100, y: 0, w: 200, h: 100 })).toBeUndefined();
    expect(clipSegment([150, 20], [150, 80], { x: 100, y: 0, w: 200, h: 100 })).toEqual([0, 1]);
    // Balonun merkezinden 1000 px sağdaki nesne: çizgi kenardan (r) başlar, nesnenin kutusunun sol kenarında biter.
    expect(leaderOf([0, 0], [1000, 0], { x: 950, y: -20, w: 100, h: 40 })).toEqual([
      [CALLOUT.r, 0],
      [950, 0],
    ]);
    expect(leaderOf([0, 0], [1000, 0])).toEqual([
      [CALLOUT.r, 0],
      [1000, 0],
    ]);
    // Kutu çizgiye hiç değmiyorsa hedefe kadar; hedef balonun içindeyse çizgi yok.
    expect(leaderOf([0, 0], [1000, 0], { x: 0, y: 500, w: 10, h: 10 })![1]).toEqual([1000, 0]);
    expect(leaderOf([0, 0], [100, 0])).toBeUndefined();
    expect(leaderIn(undefined, [{ x: 0, y: 0, w: 10, h: 10 }])).toBe(0);
    expect(leaderIn([[0, 5], [100, 5]], [{ x: 20, y: 0, w: 10, h: 10 }, { x: 50, y: 0, w: 20, h: 10 }, { x: 0, y: 50, w: 10, h: 10 }])).toBeCloseTo(30);
  });

  it("mobilya (üstüne bir şey konabilen, en uzun kenarı furniture'dan uzun) balona girmez", () => {
    const desk = { width: 200, height: 100, meta: { surface: 0.8, realHeight: 0.35 } };
    expect(isFurniture(desk)).toBe(true);
    // Küçük kutu, yüzeysiz uzun nesne ve boyu bilinmeyen yüzey mobilya değil.
    expect(isFurniture({ ...desk, meta: { surface: 0.9, realHeight: 0.2 } })).toBe(false);
    expect(isFurniture({ ...desk, meta: { realHeight: 2 } })).toBe(false);
    expect(isFurniture({ ...desk, meta: { surface: 0.8 } })).toBe(false);
    // Uzun kenar boydaysa (dolap) boy sayılır.
    expect(isFurniture({ width: 50, height: 100, meta: { surface: 0.5, realHeight: 0.7 } })).toBe(true);
  });

  it("yakın çekimde bir yüze değen ya da bir kişinin gövdesinin dörtte birinden çoğunu örten yerde balon açılmaz", () => {
    const face = { x: 1500, y: 300, w: 80, h: 80 };
    expect(calloutBlocked([1520, 330], [face], [], true)).toBe(true);
    // Geniş çekimde yüzün kenarına değmek bedeldir; faceMax'tan çoğunu örtmek engel (C s5-sh2: balon başı örtüyordu).
    expect(calloutBlocked([1520, 330], [face], [], false)).toBe(true);
    expect(calloutBlocked([1520, 330], [{ x: 1690, y: 300, w: 80, h: 80 }], [], false)).toBe(false);
    // İşaret çizgisi bir yüzü kesiyorsa ya da balon nesnenin üstüne biniyorsa engel; çizginin nesnenin kendi kutusunda
    // kalan ucu (yüzün yanındaki telefon) sayılmaz.
    const far = { x: 1000, y: 300, w: 80, h: 80 };
    expect(calloutBlocked([1520, 330], [far], [], false, { target: [700, 340] })).toBe(true);
    expect(calloutBlocked([1520, 330], [far], [], false, { target: [1040, 340], prop: { x: 990, y: 290, w: 100, h: 100 } })).toBe(false);
    expect(calloutBlocked([1520, 330], [], [], false, { target: [1520, 560] })).toBe(true);
    expect(calloutBlocked([1520, 330], [far], [], false, { target: [1520, 800] })).toBe(false);
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
