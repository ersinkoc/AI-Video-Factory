import { describe, expect, it } from "vitest";
import { atWork, FURNITURE, PASS, resolveLayout, STAGE, VectorShot, WORK, workZone, type VectorAsset } from "../src/index.ts";

const asset = (id: string, kind: VectorAsset["kind"], meta: VectorAsset["meta"] = {}, w = 400, h = 400): VectorAsset => ({ id, kind, svg: "<svg/>", width: w, height: h, meta });

const assets = {
  a: asset("a", "character", {}, 400, 800),
  b: asset("b", "character", {}, 400, 800),
  c: asset("c", "character", { realHeight: 1.8 }, 400, 800),
  desk: asset("desk", "prop", { realHeight: 0.75, surface: 1, grounded: true }, 1000, 500),
  board: asset("board", "prop", { realHeight: 0.8 }, 800, 500),
  chair: asset("chair", "prop", { realHeight: 0.9, surface: 0.5, grounded: true }, 400, 600),
  cabinet: asset("cabinet", "prop", { realHeight: 1.9, grounded: true }, 600, 1000),
  wall: asset("wall", "prop", { realHeight: 1.9, grounded: true }, 4000, 1000),
  bench: asset("bench", "prop", { realHeight: 1.5, surface: 1, grounded: true }, 800, 500),
  tall: asset("tall", "prop", { realHeight: 2, surface: 1, grounded: true }, 800, 500),
  lectern: asset("lectern", "prop", { realHeight: 1.5, grounded: true }, 800, 500),
  cup: asset("cup", "prop", { realHeight: 0.3 }, 200, 300),
};
const place = (layers: unknown[]) => resolveLayout(VectorShot.parse({ layers }), assets);
const by = (placed: ReturnType<typeof resolveLayout>, i: number) => placed.find((p) => p.index === i)!;
const typing = [{ type: "typing" }];

describe("sahne fiziği: iş başına geçme", () => {
  // Derinlik 0,3: ölçek 0,85, ayak y 951; kişi 578 px boy, 289 px genişlik. Masa 255 px boy, 510 px genişlik.
  it("ellerin bölgesi gövdenin ortasında, ayaktan boyun %38–%62'si; masaya değince iş başında", () => {
    const z = workZone({ x: 1000, y: 1000, width: 200, height: 500 });
    expect(z).toEqual({ l: 1000 - 200 * WORK.half, r: 1000 + 200 * WORK.half, t: 1000 - 500 * WORK.high, b: 1000 - 500 * WORK.low });
    const p = { x: 1000, y: 1000, width: 200, height: 500 };
    expect(atWork(p, [{ x: 1100, y: 1000, width: 200, height: 300 }])).toBe(true);
    // Yanda, baş hizasında ya da yerde (el hizasının altında) kalan eşya değmez.
    expect(atWork(p, [{ x: 1300, y: 1000, width: 200, height: 300 }])).toBe(false);
    expect(atWork(p, [{ x: 1000, y: 600, width: 200, height: 100 }])).toBe(false);
    expect(atWork(p, [{ x: 1000, y: 1000, width: 200, height: 100 }])).toBe(false);
  });

  it("masadan uzakta klavye/yazı jesti yapan kişi masanın yakın kenarına geçer", () => {
    const placed = place([
      { asset: "desk", x: 600, depth: 0.3 },
      { asset: "a", x: 1300, depth: 0.3, anims: [{ type: "writing" }] },
    ]);
    const desk = by(placed, 0);
    expect(by(placed, 1).x).toBeCloseTo(desk.x + desk.width / 2, 6);
    expect(by(placed, 1).fixes).toContain(WORK.note);
    expect(atWork(by(placed, 1), [desk])).toBe(true);
  });

  it("en yakın, el hizasına uzanan eşyayı seçer; duvardaki tahta da olur", () => {
    const placed = place([
      { asset: "desk", x: 600, depth: 0.3 },
      { asset: "board", x: 1500, y: 800, height: 300 },
      { asset: "a", x: 1150, depth: 0.3, anims: typing },
    ]);
    const board = by(placed, 1);
    expect(by(placed, 2).x).toBeCloseTo(board.x - board.width / 2, 6);
  });

  it("iş başındaysa, eşya uzaksa ya da yalnız baş hizasındaysa yerinde kalır; oturan ve giren kişiye dokunulmaz", () => {
    const at = place([{ asset: "desk", x: 600, depth: 0.3 }, { asset: "a", x: 700, depth: 0.3, anims: typing }]);
    expect(by(at, 1).x).toBe(700);
    expect(by(at, 1).fixes).not.toContain(WORK.note);
    const far = place([{ asset: "desk", x: 300, depth: 0.3 }, { asset: "a", x: 1700, depth: 0.3, anims: typing }]);
    expect(by(far, 1).x).toBe(1700);
    const high = place([{ asset: "board", x: 900, y: 300, height: 150 }, { asset: "a", x: 1300, depth: 0.3, anims: typing }]);
    expect(by(high, 1).x).toBe(1300);
    const walking = place([{ asset: "desk", x: 600, depth: 0.3 }, { asset: "a", x: 1300, depth: 0.3, anims: [...typing, { type: "walk", toX: 1400 }] }]);
    expect(by(walking, 1).fixes).not.toContain(WORK.note);
    const seated = place([{ asset: "desk", x: 300, depth: 0.3 }, { asset: "chair", x: 1300, depth: 0.3 }, { asset: "a", x: 1300, on: 1, anims: typing }]);
    expect(by(seated, 2).x).toBe(1300);
    // Jestsiz kişi ve tutulan nesne değişmez.
    const idle = place([{ asset: "desk", x: 600, depth: 0.3 }, { asset: "a", x: 1300, depth: 0.3 }]);
    expect(by(idle, 1).x).toBe(1300);
  });

  it("iş başındaki kişi konuşma mesafesi için yerinden çekilmez, öbürü yaklaşır", () => {
    const placed = place([
      { asset: "desk", x: 600, depth: 0.3 },
      { asset: "a", x: 855, depth: 0.3, anims: typing },
      { asset: "b", x: 1700, depth: 0.3 },
    ]);
    expect(by(placed, 1).x).toBe(855);
    expect(by(placed, 2).x).toBeCloseTo(855 + 1.5 * STAGE.pxPerMeter * 0.85, 6);
  });
});

describe("sahne fiziği: önünden geçme", () => {
  const z = (d: number) => 100 * (1 - d);

  it("aynı derinlikte birinin durduğu yerden yürüyen kişi öne alınır; kameranın dibindeyse arkadan geçer", () => {
    const placed = place([
      { asset: "a", x: 640, depth: 0.3 },
      { asset: "b", x: 300, depth: 0.3, anims: [{ type: "walk", toX: 950 }] },
    ]);
    expect(by(placed, 1).z).toBeCloseTo(z(0.3 - PASS.depth), 6);
    expect(by(placed, 1).fixes).toContain(PASS.note);
    expect(by(placed, 0).z).toBeCloseTo(z(0.3), 6);
    const near = place([
      { asset: "a", x: 640, depth: 0.05 },
      { asset: "b", x: 300, depth: 0.05, anims: [{ type: "move", toX: 950 }] },
    ]);
    expect(by(near, 1).z).toBeCloseTo(z(0.05 + PASS.depth), 6);
  });

  it("kayarak giren kişi de: soldan, sağdan; yerinde verilen y'den ya da varsayılandan derinlik", () => {
    const left = place([
      { asset: "a", x: 400 },
      { asset: "c", x: 800, y: 951, anims: [{ type: "slide_in" }] },
    ]);
    expect(by(left, 1).fixes).toContain(PASS.note);
    const right = place([
      { asset: "a", x: 1500, depth: 0.3 },
      { asset: "b", x: 1000, depth: 0.3, anims: [{ type: "slide_in", from: "right" }] },
    ]);
    expect(by(right, 1).fixes).toContain(PASS.note);
  });

  it("öne alınan da sayılır: ikinci yürüyen, öne alınmış olanın durduğu yerden geçiyorsa o da öne gelir", () => {
    const placed = place([
      { asset: "a", x: 640, depth: 0.3 },
      { asset: "b", x: 300, depth: 0.3, anims: [{ type: "walk", toX: 950 }] },
      { asset: "c", x: 1500, depth: 0.18, anims: [{ type: "walk", toX: 200 }] },
    ]);
    expect(by(placed, 1).z).toBeCloseTo(z(0.18), 6);
    expect(by(placed, 2).z).toBeCloseTo(z(0.06), 6);
  });

  it("farklı derinlikte, yolun ucunda duran, yerinde yürüyen, oturan ve nesne kişiye dokunulmaz", () => {
    const untouched = (layers: unknown[], i: number) => expect(by(place(layers), i).fixes).not.toContain(PASS.note);
    untouched([{ asset: "a", x: 640, depth: 0.6 }, { asset: "b", x: 300, depth: 0.3, anims: [{ type: "walk", toX: 950 }] }], 1);
    untouched([{ asset: "a", x: 900, depth: 0.3 }, { asset: "b", x: 300, depth: 0.3, anims: [{ type: "walk", toX: 950 }] }], 1);
    untouched([{ asset: "a", x: 640, depth: 0.3 }, { asset: "b", x: 300, depth: 0.3, anims: [{ type: "walk" }, { type: "slide_in", from: "top" }] }], 1);
    untouched([{ asset: "chair", x: 640, depth: 0.3 }, { asset: "a", x: 640, on: 0 }, { asset: "b", x: 300, depth: 0.3, anims: [{ type: "walk", toX: 950 }] }], 2);
    untouched([{ asset: "a", x: 640, depth: 0.3 }, { asset: "cup", x: 300, depth: 0.3, anims: [{ type: "move", toX: 950 }] }], 1);
    untouched([{ asset: "a", x: 640, depth: 0.3 }, { asset: "yok", x: 300, depth: 0.3, anims: [{ type: "move", toX: 950 }] }, { asset: "b", x: 1500, depth: 0.3 }], 0);
  });
});

describe("sahne fiziği: yüzü örten eşya", () => {
  it("ayaktaki kişi önündeki dolabın arkasından yüzünü açan en yakın yere çekilir; öndeki kişinin arkasına girmez", () => {
    const placed = place([
      { asset: "cabinet", x: 960, depth: 0.3 },
      { asset: "a", x: 960, depth: 0.5 },
    ]);
    expect(by(placed, 1).x).toBe(720);
    expect(by(placed, 1).fixes).toContain(FURNITURE.aside);
    const blocked = place([
      { asset: "cabinet", x: 960, depth: 0.3 },
      { asset: "a", x: 960, depth: 0.5 },
      { asset: "b", x: 720, depth: 0.3 },
    ]);
    expect(by(blocked, 1).x).toBe(1200);
  });

  it("yer yoksa ya da kişi sahneye giriyorsa yerinde kalır", () => {
    const wall = place([{ asset: "wall", x: 960, depth: 0.3 }, { asset: "a", x: 960, depth: 0.5 }]);
    expect(by(wall, 1).x).toBe(960);
    expect(by(wall, 1).fixes).not.toContain(FURNITURE.aside);
    const entering = place([{ asset: "cabinet", x: 960, depth: 0.3 }, { asset: "a", x: 960, depth: 0.5, anims: [{ type: "walk", toX: 980 }] }]);
    expect(by(entering, 1).fixes).not.toContain(FURNITURE.aside);
  });

  it("oturanın önündeki kürsü yüzün altına alçalır (en çok %35), üstündekiler onunla iner; oturan kişi inmez", () => {
    const placed = place([
      { asset: "chair", x: 960, depth: 0.62 },
      { asset: "a", x: 960, on: 0 },
      { asset: "bench", x: 960, depth: 0.5 },
      { asset: "cup", x: 1000, on: 2 },
      { asset: "b", x: 700, on: 2 },
    ]);
    const judge = by(placed, 1);
    const bench = by(placed, 2);
    const full = 1.5 * STAGE.pxPerMeter * 0.75;
    // Üstü oturanın yüz bandının altına (oturan render da boyunun ~%9u kadar iner).
    expect(bench.height).toBeCloseTo(bench.y - (judge.y - judge.height * 0.65 + judge.height * 0.09), 6);
    expect(bench.height).toBeGreaterThanOrEqual(full * (1 - FURNITURE.lower));
    expect(bench.width).toBeCloseTo((800 / 500) * bench.height, 6);
    expect(bench.fixes).toContain(FURNITURE.lowered);
    // Kürsünün üstündeki bardak yeni yüzeyde; kürsüde oturan kişi yerinde.
    expect(by(placed, 3).y).toBeCloseTo(bench.y - bench.height, 6);
    expect(by(placed, 4).y).toBeCloseTo(bench.y + 2, 6);
    // Üstü yüzey olmayan eşya da alçalır.
    const lectern = place([{ asset: "chair", x: 960, depth: 0.62 }, { asset: "a", x: 960, on: 0 }, { asset: "lectern", x: 960, depth: 0.5 }]);
    expect(by(lectern, 2).fixes).toContain(FURNITURE.lowered);
    // Çok yüksek kürsü (%35'ten fazla alçalmalı) olduğu gibi kalır.
    const tall = place([{ asset: "chair", x: 960, depth: 0.62 }, { asset: "a", x: 960, on: 0 }, { asset: "tall", x: 960, depth: 0.5 }]);
    expect(by(tall, 2).height).toBeCloseTo(2 * STAGE.pxPerMeter * 0.75, 6);
    expect(by(tall, 2).fixes).not.toContain(FURNITURE.lowered);
  });
});
