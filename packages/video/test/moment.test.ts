import { RIG, TimelineVisual, VectorAsset, VectorShot } from "@ys/core";
import { describe, expect, it, vi } from "vitest";

// 3D figür, küre ve atmosfer bu hesapta çizilmez (Vector.tsx onları içe aktarır).
vi.mock("../src/Globe3D.tsx", () => ({ Globe3D: () => null }));
vi.mock("../src/Ambience.tsx", () => ({ Ambience: () => null }));
vi.mock("../src/Figure3D.tsx", () => ({ Figure3D: () => null }));

const { STILL, stillMoment } = await import("../src/moment.ts");

const PARTS = Object.keys(RIG.pivots);
const ASSETS = {
  hero: VectorAsset.parse({ id: "hero", kind: "character", svg: `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10"/></g>`).join("")}</svg>`, width: 400, height: 800 }),
  pal: VectorAsset.parse({ id: "pal", kind: "character", svg: `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10"/></g>`).join("")}</svg>`, width: 400, height: 800 }),
  cup: VectorAsset.parse({ id: "cup", kind: "prop", svg: '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>', width: 100, height: 100, meta: { realHeight: 0.3 } }),
};
// 10 sn'lik çekim (30 fps).
const visual = (shot: object, extra: object = {}) =>
  TimelineVisual.parse({ shotId: "s1", assetUrl: "", kind: "motion_graphic", fromFrame: 0, durationInFrames: 300, vector: VectorShot.parse(shot), ...extra });
const hero = (anims: object[], extra: object = {}) => ({ asset: "hero", x: 900, depth: 0.3, anims, ...extra });
const at = (shot: object) => stillMoment(visual(shot), ASSETS, 30);

describe("inceleme karesinin anı", () => {
  it("vektör değilse, jest yoksa ya da jest bütün çekimi kaplıyorsa çekimin %80'i", () => {
    expect(stillMoment(TimelineVisual.parse({ shotId: "s1", assetUrl: "a.mp4", kind: "motion_graphic", fromFrame: 0, durationInFrames: 300 }), ASSETS, 30)).toBe(STILL.at);
    expect(at({ layers: [hero([{ type: "talk" }]), { asset: "cup", x: 1200, depth: 0.3, anims: [{ type: "point" }] }] })).toBe(STILL.at);
    expect(at({ layers: [hero([{ type: "explain", start: 0, end: 1 }])] })).toBe(STILL.at);
    // Çizilmemiş varlığı gösteren katman kişi sayılmaz.
    expect(at({ layers: [{ asset: "ghost", x: 500, depth: 0.3, anims: [{ type: "point", start: 0.1, end: 0.4 }] }] })).toBe(STILL.at);
  });

  it("jest %80'den önce bitiyorsa kare, kol yerine oturduktan sonraki ve bitişten hemen önceki en geç anda", () => {
    // İşaret 1–5 sn: 1,6 sn ile 4,7 sn arası görünür; %80'e en yakın uç 0,47.
    expect(at({ layers: [hero([{ type: "point", start: 0.1, end: 0.5 }])] })).toBeCloseTo(0.47);
    // Kısa baş sallama (4–4,5 sn) ızgara adımının arasına düşmez: penceresinin ucu aday.
    expect(at({ layers: [hero([{ type: "nod", start: 0.4, end: 0.45 }])] })).toBeCloseTo(0.425);
    // İki kişinin jesti: ikisinin de göründüğü an (sevinç 3,6–5,7 sn; el sallama 3,5 sn'ye kısalır, 4,6–7,2 sn) tekinkinden
    // önce gelir; onların içinde %80'e en yakın uç.
    const two = at({ layers: [hero([{ type: "cheer", start: 0.3, end: 0.6 }]), { ...hero([{ type: "wave", start: 0.4, end: 0.95 }], { x: 1300 }), asset: "pal" }] });
    expect(two).toBeCloseTo(0.57);
  });

  it("yazı açılmadan, giriş bitmeden ve çıkış başladıktan sonra kare alınmaz", () => {
    // Nesne 0–6 sn arasında çizilerek beliriyor: o bitmeden kare yok; jest daha önce bittiyse %80 kalır.
    expect(at({ layers: [hero([{ type: "point", start: 0.1, end: 0.5 }]), { asset: "cup", x: 1200, depth: 0.3, anims: [{ type: "draw_on", start: 0, end: 0.6 }] }] })).toBe(STILL.at);
    // 64 harflik daktilo 4 sn sürer: işaret açılmış yazıyla birlikte görünür (0,4'ten sonra).
    const typed = at({ layers: [hero([{ type: "point", start: 0.1, end: 0.5 }])], texts: [{ text: "x".repeat(64), style: "title", x: 0, y: 0, anims: [{ type: "typewriter", start: 0, end: 1 }] }] });
    expect(typed).toBeCloseTo(0.47);
    // Kişi 7. sn'de kararıyor: kare ondan önce, %80'e en yakın.
    expect(at({ layers: [hero([{ type: "explain", start: 0, end: 1 }, { type: "fade_out", start: 0.7, end: 1 }])] })).toBeCloseTo(0.7);
    // Giriş çıkıştan sonra bitiyorsa (çelişkili plan) %80.
    expect(at({ layers: [hero([{ type: "point", start: 0.1, end: 0.5 }, { type: "slide_in", start: 0, end: 0.9 }, { type: "fade_out", start: 0.5, end: 1 }])] })).toBe(STILL.at);
  });
});

describe("inceleme karesinin anı: konuşma balonu", () => {
  it("balon açılıp yerine oturduktan sonra, kapanmadan önce; boş söz balon sayılmaz", () => {
    // Pencere 0,1–0,5: görünür 0,16–0,47; hazır olunan 0,3 sonrasında %80'e en yakını.
    expect(at({ layers: [hero([], { say: { text: "Bu bizim hatamız değil", start: 0.1, end: 0.5 } })] })).toBeCloseTo(0.47);
    expect(at({ layers: [hero([], { say: { text: "  ", start: 0.1, end: 0.5 } })] })).toBe(STILL.at);
    // Çekim bitmeden açılamayan balon (kişi sonda giriyor) sayılmaz.
    expect(at({ layers: [hero([{ type: "fade_in", start: 0.9, end: 1 }], { say: { text: "Geç kaldım" } })] })).toBe(STILL.at);
  });
});
