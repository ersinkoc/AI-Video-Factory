import { describe, expect, it } from "vitest";
import { SceneThree } from "@ys/core";
import { contentBox, placeThree, spotFits, THREE_SPOT, type Box, type SpotScene } from "../src/threeSpot.ts";

const FULL: Box = { x: 0, y: 0, w: 1920, h: 1080 };
const scene = (over: Partial<SpotScene> = {}): SpotScene => ({ faces: [], bodies: [], covers: [], views: [FULL, FULL], scale: 1, height: 1080, ...over });
const item = (over: Partial<SceneThree> = {}) => SceneThree.parse({ preset: "network", x: 600, y: 400, size: 520, ...over });

describe("contentBox", () => {
  it("kutunun ortasındaki content payı", () => {
    expect(contentBox({ x: 1000, y: 500, size: 400 })).toEqual({ x: 850, y: 350, w: 300, h: 300 });
  });
});

describe("spotFits", () => {
  const box = contentBox(item());
  it("boş sahnede uygun", () => expect(spotFits(box, scene())).toBe(true));
  it("yüze (payıyla) ya da alınmış yere değen uygun değil", () => {
    // Yüz içeriğin sağ kenarının 20 px sağında: pay (0.35 × 60 = 21 px) değdirir.
    expect(spotFits(box, scene({ faces: [{ x: box.x + box.w + 20, y: 300, w: 50, h: 60 }] }))).toBe(false);
    expect(spotFits(box, scene({ faces: [{ x: box.x + box.w + 30, y: 300, w: 50, h: 60 }] }))).toBe(true);
    expect(spotFits(box, scene(), [{ x: box.x, y: box.y, w: 10, h: 10 }])).toBe(false);
  });
  it("gövdelerin altında body payından çoğu kalırsa uygun değil", () => {
    const share = (s: number) => ({ x: box.x, y: box.y, w: box.w * s, h: box.h });
    expect(spotFits(box, scene({ bodies: [share(THREE_SPOT.body - 0.01)] }))).toBe(true);
    expect(spotFits(box, scene({ bodies: [share(THREE_SPOT.body + 0.01)] }))).toBe(false);
  });
  it("önde çizilen nesne cover payından çoğunu örterse uygun değil", () => {
    expect(spotFits(box, scene({ covers: [() => 0.1] }))).toBe(true);
    expect(spotFits(box, scene({ covers: [() => 0.3] }))).toBe(false);
  });
  it("kamera uçlarından birinde kadrajdan taşarsa uygun değil; altyazı çizgisinin altına inerse yalnız caption ile", () => {
    expect(spotFits(box, scene({ views: [FULL, { x: 0, y: 0, w: box.x + box.w * 0.9, h: 1080 }] }))).toBe(false);
    const low = contentBox(item({ y: 900, size: 300 }));
    expect(spotFits(low, scene())).toBe(false);
    expect(spotFits(low, scene(), [], false)).toBe(true);
  });
});

describe("placeThree", () => {
  it("uygun yerdeki yerinde kalır", () => {
    expect(placeThree([item()], scene())).toEqual({ items: [item()], moved: [] });
  });

  it("küçük olan okunur boya büyür; büyüyünce sığmıyorsa eski boyunda kalır", () => {
    const small = item({ size: 300 });
    const grown = placeThree([small], scene());
    expect(grown.items[0]!.size).toBeCloseTo((THREE_SPOT.minSide * 1080) / THREE_SPOT.content);
    expect(grown.moved).toEqual([0]);
    // Büyümüş içerik yanındaki yüze değerdi; eski boyu değmez.
    const b = contentBox(small);
    const face = { x: b.x + b.w + 40, y: b.y, w: 40, h: 40 };
    expect(placeThree([small], scene({ faces: [face] })).items[0]).toEqual(small);
    // Yakınlaşan kamerada (ölçek 2) okunur boy daha küçüktür.
    expect(placeThree([small], scene({ scale: 2 })).items[0]!.size).toBe(300);
  });

  it("yüze değen en yakın uygun yere kayar; ikinci illüstrasyon ilkinin yerine konmaz", () => {
    const face = { x: 560, y: 360, w: 80, h: 80 };
    const { items, moved } = placeThree([item(), item({ x: 640 })], scene({ faces: [face] }));
    expect(moved).toEqual([0, 1]);
    for (const t of items) expect(spotFits(contentBox(t), scene({ faces: [face] }))).toBe(true);
    const [a, b] = items.map(contentBox);
    expect(a!.x + a!.w <= b!.x || b!.x + b!.w <= a!.x || a!.y + a!.h <= b!.y || b!.y + b!.h <= a!.y).toBe(true);
    // Yönetmenin yerine yakın kalır.
    expect(Math.hypot(items[0]!.x - 600, items[0]!.y - 400)).toBeLessThan(400);
  });

  it("tam boyda yer yoksa shrink'e kadar küçülür", () => {
    // Görüş, içeriğin ancak küçülünce sığdığı dar bir bant.
    const views = [{ x: 0, y: 200, w: 1920, h: 360 }];
    const { items } = placeThree([item({ y: 390 })], scene({ views }));
    expect(items[0]!.size).toBeLessThan(520);
    expect(items[0]!.size).toBeGreaterThanOrEqual(520 * THREE_SPOT.shrink);
  });

  it("altyazının üstünde yer yoksa altyazı şartı olmadan yer arar; hiç yer yoksa yerinde kalır", () => {
    // Görüşün yalnız alt kısmı serbest: üstü yüzle dolu.
    const top = { x: 0, y: 0, w: 1920, h: 700 };
    const low = placeThree([item({ y: 860, size: 300 })], scene({ bodies: [top] }));
    expect(low.items[0]!.y + (low.items[0]!.size * THREE_SPOT.content) / 2).toBeGreaterThan(1080 * THREE_SPOT.bottom);
    const blocked = placeThree([item()], scene({ covers: [() => 1] }));
    expect(blocked).toEqual({ items: [item()], moved: [] });
  });
});
