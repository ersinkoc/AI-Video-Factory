import { describe, expect, it } from "vitest";
import { ARC, BOARD, CONVERSE, EDGE, FURNITURE, isWritable, LOW_FURNITURE, PASS, resolveLayout, STAGE, VectorShot, WORK, workBoard, workSurface, workTopOf, workZone, type VectorAsset } from "../src/index.ts";

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
  // Ayaklı beyaz tahta (çizimin işaretiyle) ve duvardaki kara tahta (adından).
  wb: asset("wb", "prop", { realHeight: 1.8, grounded: true, writable: true }, 600, 900),
  chalkboard: asset("chalkboard", "prop", {}, 1200, 400),
};
const place = (layers: unknown[]) => resolveLayout(VectorShot.parse({ layers }), assets);
const by = (placed: ReturnType<typeof resolveLayout>, i: number) => placed.find((p) => p.index === i)!;
const typing = [{ type: "typing" }];

describe("sahne fiziği: iş başına geçme", () => {
  // Derinlik 0,3: ölçek 0,85, ayak y 951; kişi 578 px boy, 289 px genişlik. Masa 255 px boy, 510 px genişlik.
  it("ellerin bölgesi gövdenin ortasında, ayaktan boyun %38–%62'si; iş yüzeyi üstü el hizasında bir masa", () => {
    const z = workZone({ x: 1000, y: 1000, width: 200, height: 500 });
    expect(z).toEqual({ l: 1000 - 200 * WORK.half, r: 1000 + 200 * WORK.half, t: 1000 - 500 * WORK.high, b: 1000 - 500 * WORK.low });
    const pl = (index: number, x: number, extra: object = {}) => ({ index, x, y: 1000, width: 200, height: 300, scale: 1, z: 0, sitting: false, grounded: true, fixes: [], ...extra });
    const p = pl(9, 1000, { height: 500 });
    const surface = (index: number, x: number, top: number) => ({ pl: pl(index, x), top });
    // Masa üstü bölgenin içinde ya da en çok below × boy altında; birden çoksa ellere en yakını.
    expect(workSurface(p, [surface(1, 1100, 700), surface(2, 1000, 805)])!.pl.index).toBe(2);
    expect(workSurface(p, [surface(1, 1100, z.b + 500 * WORK.below + 1)])).toBeUndefined();
    // Yanda, baş hizasında kalan masa değmez.
    expect(workSurface(p, [surface(1, 1300, 760)])).toBeUndefined();
    expect(workSurface(p, [surface(1, 1000, 600)])).toBeUndefined();
    // Oturan: gövde indiği için pay daha geniş; oturduğu sandalye sayılmaz.
    const seated = pl(9, 1000, { height: 500, sitting: true, on: 3 });
    expect(workSurface(seated, [surface(1, 1000, 700 + 500 * WORK.seated)])!.pl.index).toBe(1);
    expect(workSurface(seated, [surface(3, 1000, 760)])).toBeUndefined();
    // İş yüzeyi: üstü olan mobilya; kişi, tutulan ve üstsüz eşya değil.
    expect(workTopOf(pl(1, 0, { y: 900, height: 200 }), assets.chair)).toBe(800);
    expect(workTopOf(pl(1, 0), assets.board)).toBeUndefined();
    expect(workTopOf(pl(1, 0), assets.a)).toBeUndefined();
    expect(workTopOf(pl(1, 0, { heldBy: 2 }), assets.desk)).toBeUndefined();
    expect(workTopOf(pl(1, 0), undefined)).toBeUndefined();
  });

  it("masadan uzakta klavye/yazı jesti yapan kişi masanın arkasına geçer: gövde masanın ortasında, masa önde", () => {
    const placed = place([
      { asset: "desk", x: 600, depth: 0.3 },
      { asset: "a", x: 1300, depth: 0.3, anims: [{ type: "writing" }] },
    ]);
    const desk = by(placed, 0);
    const span = (desk.width / 2) * (1 - 2 * WORK.behind);
    expect(by(placed, 1).x).toBeCloseTo(desk.x + span, 6);
    expect(by(placed, 1).z).toBeLessThan(desk.z);
    expect(by(placed, 1).fixes).toContain(WORK.note);
    expect(workSurface(by(placed, 1), [{ pl: desk, top: workTopOf(desk, assets.desk)! }])).toBeDefined();
  });

  it("duvardaki tahta ve el hizasında olmayan eşya iş yüzeyi değil: en yakın masaya geçer", () => {
    const placed = place([
      { asset: "desk", x: 600, depth: 0.3 },
      { asset: "board", x: 1500, y: 800, height: 300 },
      { asset: "a", x: 1150, depth: 0.3, anims: typing },
    ]);
    const desk = by(placed, 0);
    expect(by(placed, 2).x).toBeCloseTo(desk.x + (desk.width / 2) * (1 - 2 * WORK.behind), 6);
    const board = place([{ asset: "board", x: 1500, y: 800, height: 300 }, { asset: "a", x: 1150, depth: 0.3, anims: typing }]);
    expect(by(board, 1).x).toBe(1150);
    // İki masa da erimde: kenarı yakın olanın arkasına geçer.
    const two = place([{ asset: "desk", x: 500, depth: 0.3 }, { asset: "desk", x: 1700, depth: 0.3 }, { asset: "a", x: 1150, depth: 0.3, anims: typing }]);
    const near = by(two, 1);
    expect(by(two, 2).x).toBeCloseTo(near.x - (near.width / 2) * (1 - 2 * WORK.behind), 6);
  });

  it("masanın ortasındaysa yerinde kalıp masanın arkasına geçer; masa uzaksa ya da yalnız baş hizasındaysa kalır; oturan ve giren kişiye dokunulmaz", () => {
    const at = place([{ asset: "desk", x: 600, depth: 0.3 }, { asset: "a", x: 650, depth: 0.3, anims: typing }]);
    expect(by(at, 1).x).toBe(650);
    expect(by(at, 1).z).toBeLessThan(by(at, 0).z);
    // Zaten arkasında: hiçbir şey değişmez.
    const behind = place([{ asset: "desk", x: 600, depth: 0.3 }, { asset: "a", x: 650, depth: 0.4, anims: typing }]);
    expect(by(behind, 1).fixes).not.toContain(WORK.note);
    const far = place([{ asset: "desk", x: 300, depth: 0.3 }, { asset: "a", x: 1700, depth: 0.3, anims: typing }]);
    expect(by(far, 1).x).toBe(1700);
    const high = place([{ asset: "tall", x: 900, depth: 0.3 }, { asset: "a", x: 1300, depth: 0.3, anims: typing }]);
    expect(by(high, 1).x).toBe(1300);
    const walking = place([{ asset: "desk", x: 600, depth: 0.3 }, { asset: "a", x: 1300, depth: 0.3, anims: [...typing, { type: "walk", toX: 1400 }] }]);
    expect(by(walking, 1).fixes).not.toContain(WORK.note);
    const seated = place([{ asset: "desk", x: 300, depth: 0.3 }, { asset: "chair", x: 1300, depth: 0.3 }, { asset: "a", x: 1300, on: 1, anims: typing }]);
    expect(by(seated, 2).x).toBe(1300);
    // Jestsiz kişi ve tutulan nesne değişmez.
    const idle = place([{ asset: "desk", x: 600, depth: 0.3 }, { asset: "a", x: 1300, depth: 0.3 }]);
    expect(by(idle, 1).x).toBe(1300);
  });

  it("masanın yanındaki sandalyede oturan iş jestli kişi sandalyesiyle masanın arkasına kayar; masa önde olmalı, oturak paylaşılmamalı", () => {
    // PHP s1-sh1: sandalye masanın yanında, masanın arkasında (derinlik 0,45 > 0,3).
    const beside = place([{ asset: "desk", x: 700, depth: 0.3 }, { asset: "chair", x: 1250, depth: 0.45 }, { asset: "a", x: 1250, on: 1, anims: typing }]);
    const desk = by(beside, 0);
    const at = desk.x + (desk.width / 2) * (1 - 2 * WORK.behind);
    expect(by(beside, 2).x).toBeCloseTo(at, 6);
    expect(by(beside, 1).x).toBeCloseTo(at, 6);
    expect(by(beside, 2).fixes).toContain(WORK.note);
    expect(workSurface(by(beside, 2), [{ pl: desk, top: workTopOf(desk, assets.desk)! }])).toBeDefined();
    // Zaten masa başında: kıpırdamaz.
    const atDesk = place([{ asset: "desk", x: 700, depth: 0.3 }, { asset: "chair", x: 700, depth: 0.45 }, { asset: "a", x: 700, on: 1, anims: typing }]);
    expect(by(atDesk, 2).x).toBe(700);
    expect(by(atDesk, 2).fixes).not.toContain(WORK.note);
    // Sandalye masanın önünde: kayarsa masayı örter; kalır.
    const front = place([{ asset: "desk", x: 700, depth: 0.45 }, { asset: "chair", x: 1250, depth: 0.3 }, { asset: "a", x: 1250, on: 1, anims: typing }]);
    expect(by(front, 2).x).toBe(1250);
    // Oturağı başkasıyla paylaşıyor: kaymaz.
    const seat = [{ asset: "desk", x: 700, depth: 0.3 }, { asset: "chair", x: 1250, depth: 0.45 }, { asset: "a", x: 1250, on: 1, anims: typing }];
    expect(by(place([...seat, { asset: "cup", x: 1250, on: 1 }]), 2).fixes).not.toContain(WORK.note);
    expect(by(place([...seat, { asset: "b", x: 1250, on: 1 }]), 2).fixes).not.toContain(WORK.note);
  });

  it("pano: çizimin işareti, yoksa adı; kalem yakın kenardan içeride, yazma hizasında; arkada çizilen, uzanılan, bandı kesen pano", () => {
    expect(["p-whiteboard", "p-black-board", "chalk", "p-flipchart", "p-flip-chart", "easel", "kara-tahta"].every((id) => isWritable(id, asset(id, "prop")))).toBe(true);
    expect(isWritable("p-desk", asset("p-desk", "prop"))).toBe(false);
    expect(isWritable("p-whiteboard", asset("x", "prop", { writable: false }))).toBe(false);
    expect(isWritable("p-panel", asset("x", "prop", { writable: true }))).toBe(true);
    expect(isWritable("whiteboard", asset("x", "character"))).toBe(false);
    expect(isWritable("whiteboard", undefined)).toBe(false);
    const pl = (index: number, x: number, extra: object = {}) => ({ index, x, y: 1000, width: 200, height: 600, scale: 1, z: 0, sitting: false, grounded: true, fixes: [], ...extra });
    // Kişi: 500 boy, 200 en; yazma bandı y 600–690, kolu 140 px'e yeter, kalem yakın kenardan 50 px içeride, y 650.
    const p = pl(9, 1000, { height: 500, z: 5 });
    expect(workBoard(p, [pl(1, 1200)])).toEqual({ pl: pl(1, 1200), at: [1150, 650] });
    expect(workBoard(p, [pl(1, 800)])!.at).toEqual([850, 650]);
    // En yakını; uzak, önde çizilen ya da bandı kesmeyen pano olmaz.
    expect(workBoard(p, [pl(1, 800), pl(2, 1150)])!.pl.index).toBe(2);
    expect(workBoard(p, [pl(1, 1300)])).toBeUndefined();
    expect(workBoard(p, [pl(1, 1200, { z: 6 })])).toBeUndefined();
    expect(workBoard(p, [pl(1, 1200, { height: 300, y: 590 })])).toBeUndefined();
    expect(workBoard(p, [pl(1, 1200, { heldBy: 3 })])).toBeUndefined();
    // Kişi panonun önündeyse gövdesinin yanına yazar; dar ya da kısa panoda kalem ortaya gelir.
    expect(workBoard(p, [pl(1, 1000, { width: 600 })])!.at).toEqual([1000 + 200 * BOARD.shoulder + 500 * BOARD.inset, 650]);
    expect(workBoard(p, [pl(1, 1120, { width: 60 })])!.at[0]).toBe(1120);
    expect(workBoard(p, [pl(1, 1200, { height: 80, y: 700 })])!.at[1]).toBe(660);
  });

  it("panoya yazan kişi panonun kenarına geçer ve önüne çizilir; masa yakınsa masaya, klavye panoya gitmez; önündeki de kenara geçer", () => {
    const writing = [{ type: "writing" }];
    const far = place([{ asset: "wb", x: 1200, depth: 0.3 }, { asset: "a", x: 600, depth: 0.3, anims: writing }]);
    const board = by(far, 0);
    const p = by(far, 1);
    expect(p.x).toBeCloseTo(board.x - board.width / 2 - p.width * BOARD.stand, 6);
    expect(p.z).toBeGreaterThan(board.z);
    expect(p.fixes).toContain(BOARD.note);
    expect(workBoard(p, [board])).toBeDefined();
    // Panonun önünde: yakın kenarına; tam ortasındaysa sahnede yeri olan yana.
    const front = place([{ asset: "wb", x: 1200, depth: 0.3 }, { asset: "a", x: 1150, depth: 0.3, anims: writing }]);
    expect(by(front, 1).x).toBeCloseTo(board.x - board.width / 2 - p.width * BOARD.stand, 6);
    const left = place([{ asset: "wb", x: 600, depth: 0.3 }, { asset: "a", x: 600, depth: 0.3, anims: writing }]);
    expect(by(left, 1).x).toBeCloseTo(by(left, 0).x + by(left, 0).width / 2 + p.width * BOARD.stand, 6);
    // Duvar boyu kara tahtanın kenarı yürünemeyecek kadar uzak: önünde kalır, yalnız önüne çizilir (zaten önde).
    const wall = place([{ asset: "chalkboard", x: 960, y: 700, height: 500 }, { asset: "a", x: 960, depth: 0.6, anims: writing }]);
    expect(by(wall, 1).x).toBe(960);
    expect(by(wall, 1).fixes).not.toContain(BOARD.note);
    expect(workBoard(by(wall, 1), [by(wall, 0)])!.at[0]).toBeGreaterThan(960);
    // Masa panodan yakınsa masanın arkasına; pano yakınsa panoya.
    const desk = place([{ asset: "desk", x: 300, depth: 0.3 }, { asset: "wb", x: 1200, depth: 0.3 }, { asset: "a", x: 600, depth: 0.3, anims: writing }]);
    expect(by(desk, 2).fixes).toEqual([WORK.note]);
    const nearBoard = place([{ asset: "desk", x: 1650, depth: 0.3 }, { asset: "wb", x: 1200, depth: 0.3 }, { asset: "a", x: 600, depth: 0.3, anims: writing }]);
    expect(by(nearBoard, 2).fixes).toEqual([BOARD.note]);
    // Klavye panoya gitmez.
    const typingAt = place([{ asset: "wb", x: 1200, depth: 0.3 }, { asset: "a", x: 600, depth: 0.3, anims: typing }]);
    expect(by(typingAt, 1).x).toBe(600);
  });

  it("iş başındaki kişi konuşma mesafesi için yerinden çekilmez, öbürü yaklaşır", () => {
    const placed = place([
      { asset: "desk", x: 600, depth: 0.3 },
      { asset: "a", x: 855, depth: 0.3, anims: typing },
      { asset: "b", x: 1700, depth: 0.3 },
    ]);
    // Masanın arkasına geçti (kenardan içeri), sonra yerinde kaldı; öbürü ona yaklaştı.
    const at = 600 + 255 * (1 - 2 * WORK.behind);
    expect(by(placed, 1).x).toBeCloseTo(at, 6);
    expect(by(placed, 2).x).toBeCloseTo(at + CONVERSE.max * STAGE.pxPerMeter * 0.85, 6);
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

  it("tezgâhın ardındaki kısa kişi göğsü tezgâhın üstüne gelene dek yükselir (ayakları tezgâhın ardında); yerinden oynamaz", () => {
    // 1,1 m'lik robot, önünde 1 m'lik geniş tezgâh: yakında olduğu için tezgâhın üstü robotun yüzünü örter.
    const shop = { ...assets, robot: asset("robot", "character", { realHeight: 1.1 }, 400, 800), counter: asset("counter", "prop", { realHeight: 1, surface: 1, grounded: true }, 4000, 500) };
    const at = (layers: unknown[]) => resolveLayout(VectorShot.parse({ layers }), shop);
    const placed = at([{ asset: "counter", x: 960, depth: 0.3 }, { asset: "robot", x: 960, depth: 0.45 }]);
    const [counter, robot] = [by(placed, 0), by(placed, 1)];
    expect(robot.x).toBe(960);
    expect(robot.fixes).toContain(FURNITURE.lifted);
    expect(robot.y).toBeCloseTo(counter.y - counter.height + robot.height * FURNITURE.chest, 6);
    // Ayakları tezgâhın ardında kalır.
    expect(robot.y).toBeGreaterThan(counter.y - counter.height);
    // Tezgâhın kenarında duran (ayakları görünür) yükselmez, kenara çekilir.
    const edge = at([{ asset: "counter", x: 400, depth: 0.3 }, { asset: "robot", x: 1750, depth: 0.45 }]);
    expect(by(edge, 1).fixes).not.toContain(FURNITURE.lifted);
    // Gereken yükselme boyunun FURNITURE.lift kesrinden fazlaysa (çok yüksek tezgâh) yükselmez.
    const high = at([{ asset: "tall", x: 960, depth: 0.3 }, { asset: "robot", x: 960, depth: 0.45 }]);
    expect(by(high, 1).fixes).not.toContain(FURNITURE.lifted);
    // Üstü olmayan eşyanın (dolap) ardında kenara çekilir.
    expect(by(at([{ asset: "cabinet", x: 960, depth: 0.3 }, { asset: "robot", x: 960, depth: 0.45 }]), 1).fixes).toContain(FURNITURE.aside);
  });
});

describe("sahne fiziği: sıra hâlinde dizilenler yay kurar", () => {
  const row = (extra: object[] = [{}, {}, {}], camera?: object) =>
    resolveLayout(
      VectorShot.parse({ layers: extra.map((e, i) => ({ asset: i % 2 ? "b" : "a", x: 500 + i * 450, depth: 0.4, ...e })), ...(camera ? { camera } : {}) }),
      assets,
    );
  const zs = (placed: ReturnType<typeof resolveLayout>, n: number) => Array.from({ length: n }, (_, i) => by(placed, i).z);

  it("aynı derinlikteki üç kişide uçlar öne, orta geriye; boy ve ayak çizgisi yeni derinlikten", () => {
    const placed = row();
    const [a, b, c] = zs(placed, 3);
    expect(a).toBeCloseTo(60 + 100 * ARC.depth * 0.5, 6);
    expect(b).toBeCloseTo(60 - 100 * ARC.depth * 0.5, 6);
    expect(c).toBeCloseTo(a!, 6);
    // Öndeki daha büyük ve ayağı daha aşağıda.
    expect(by(placed, 0).height).toBeGreaterThan(by(placed, 1).height);
    expect(by(placed, 0).y).toBeGreaterThan(by(placed, 1).y);
    expect(by(placed, 1).fixes).toContain(ARC.note);
    // Dört kişide içtekiler uçlarla orta arasında.
    const four = zs(row([{}, {}, {}, {}]), 4);
    expect(four[1]).toBeLessThan(four[0]!);
    expect(four[1]).toBeCloseTo(four[2]!, 6);
  });

  it("iki kişi, yakın çekim, Manim tahtası ve yürüyen, oturan, tutan, çalışan ya da z'si verilmiş kişi yay kurmaz", () => {
    const flat = (placed: ReturnType<typeof resolveLayout>, n: number) => expect(zs(placed, n).every((z) => Math.abs(z - 60) < 1e-6)).toBe(true);
    flat(row([{}, {}]), 2);
    flat(row(undefined, { zoomFrom: 1.6, zoomTo: 1.6 }), 3);
    flat(resolveLayout(VectorShot.parse({ layers: [0, 1, 2].map((i) => ({ asset: "a", x: 500 + i * 450, depth: 0.4 })), math: { steps: ["a=b"] } }), assets), 3);
    flat(row([{}, { anims: [{ type: "walk", toX: 900 }] }, {}]), 1);
    flat(row([{}, {}, { z: 60 }]), 2);
    flat(row([{}, { anims: [{ type: "typing" }] }, {}]), 1);
    // Elinde bardak olan sayılmaz: geriye iki kişi kalır.
    flat(resolveLayout(VectorShot.parse({ layers: [{ asset: "a", x: 500, depth: 0.4 }, { asset: "b", x: 950, depth: 0.4 }, { asset: "a", x: 1400, depth: 0.4 }, { asset: "cup", x: 0, heldBy: 1 }] }), assets), 1);
  });
});

describe("sahne fiziği: alçak eşyanın ardında duran", () => {
  // 0,35 m'lik katip masası (Antik Mısır s6-sh4): üstü ardındaki kişinin dizinin altında, ayaklarını örter.
  const low = { ...assets, lowtable: asset("lowtable", "prop", { realHeight: 0.35, surface: 0.8, grounded: true }, 800, 400), lowwall: asset("lowwall", "prop", { realHeight: 0.35, grounded: true }, 8000, 400) };
  const at = (layers: unknown[]) => resolveLayout(VectorShot.parse({ layers }), low);
  const feetHidden = (placed: ReturnType<typeof resolveLayout>, table: number, person: number) => {
    const [o, q] = [by(placed, table), by(placed, person)];
    return o.z > q.z && o.y - o.height < q.y && o.y - o.height > q.y - q.height * LOW_FURNITURE.knee && Math.abs(o.x - q.x) < o.width / 2 + q.width * LOW_FURNITURE.feet;
  };

  it("ayakları masanın ardında kalan kişi ayaklarını açan en yakın yere çekilir; kalça boyundaki masanın ardındaki kalır", () => {
    const placed = at([{ asset: "lowtable", x: 960, depth: 0.3 }, { asset: "a", x: 960, depth: 0.45 }]);
    expect(by(placed, 1).fixes).toContain(LOW_FURNITURE.aside);
    expect(by(placed, 1).x).not.toBe(960);
    expect(feetHidden(placed, 0, 1)).toBe(false);
    const desk = at([{ asset: "desk", x: 960, depth: 0.3 }, { asset: "a", x: 960, depth: 0.45 }]);
    expect(by(desk, 1).fixes).not.toContain(LOW_FURNITURE.aside);
    // Masanın önünde duran, oturan ve sahneye giren kişiye dokunulmaz.
    const front = at([{ asset: "lowtable", x: 960, depth: 0.45 }, { asset: "a", x: 960, depth: 0.3 }]);
    expect(by(front, 1).x).toBe(960);
    const seated = at([{ asset: "chair", x: 960, depth: 0.5 }, { asset: "a", x: 960, on: 0 }, { asset: "lowtable", x: 960, depth: 0.3 }]);
    expect(by(seated, 1).fixes).not.toContain(LOW_FURNITURE.aside);
    const entering = at([{ asset: "lowtable", x: 960, depth: 0.3 }, { asset: "a", x: 960, depth: 0.45, anims: [{ type: "walk", toX: 980 }] }]);
    expect(by(entering, 1).fixes).not.toContain(LOW_FURNITURE.aside);
  });

  it("çekileceği yerde biri duruyorsa (hangi derinlikte olursa olsun) öbür yana; hiç yer yoksa eşyanın önüne geçer", () => {
    const alone = by(at([{ asset: "lowtable", x: 960, depth: 0.3 }, { asset: "a", x: 960, depth: 0.45 }]), 1).x;
    // İlk seçtiği yanda öndeki bir kişi.
    const busy = at([{ asset: "lowtable", x: 960, depth: 0.3 }, { asset: "a", x: 960, depth: 0.45 }, { asset: "b", x: alone, depth: 0.2 }]);
    expect(Math.sign(by(busy, 1).x - 960)).toBe(-Math.sign(alone - 960));
    const wall = at([{ asset: "lowwall", x: 960, depth: 0.3 }, { asset: "a", x: 960, depth: 0.45 }]);
    expect(by(wall, 1).fixes).toContain(LOW_FURNITURE.front);
    expect(by(wall, 1).z).toBeGreaterThan(by(wall, 0).z);
  });
});

describe("sahne fiziği: sahnenin kenarı", () => {
  it("yanından taşan yerdeki eşya içeri alınır; üstündekiler, oturan ve onun tuttuğu onunla kayar", () => {
    const placed = place([
      { asset: "desk", x: 1900, depth: 0.3 },
      { asset: "cup", x: 1900, on: 0 },
      { asset: "chair", x: 30, depth: 0.3 },
      { asset: "a", x: 30, on: 2 },
      { asset: "cup", x: 30, heldBy: 3 },
    ]);
    const desk = by(placed, 0);
    expect(desk.x + desk.width / 2).toBeCloseTo(STAGE.width - EDGE.margin, 6);
    expect(desk.fixes).toContain(EDGE.note);
    expect(by(placed, 1).x).toBeCloseTo(desk.x, 6);
    const chair = by(placed, 2);
    expect(chair.x - chair.width / 2).toBeCloseTo(EDGE.margin, 6);
    expect(by(placed, 3).x).toBeCloseTo(chair.x, 6);
    expect(by(placed, 4).x).toBeCloseTo(chair.x, 6);
    // İçerideki eşyaya dokunulmaz.
    expect(by(place([{ asset: "desk", x: 960, depth: 0.3 }]), 0).fixes).not.toContain(EDGE.note);
  });

  it("sahne genişliğindeki, sahneye giren ve kaydığı yerde yanındaki eşyaya değecek olan eşya yerinde kalır", () => {
    expect(by(place([{ asset: "wall", x: 0, depth: 0.3 }]), 0).x).toBe(0);
    expect(by(place([{ asset: "desk", x: 1900, depth: 0.3, anims: [{ type: "slide_in", from: "right" }] }]), 0).x).toBe(1900);
    // Dolap 388 px genişliğinde: sağdaki içeri alınsa soldakine (1206–1594) değerdi.
    const pair = place([
      { asset: "cabinet", x: 1900, depth: 0.3 },
      { asset: "cabinet", x: 1400, depth: 0.3 },
    ]);
    expect(by(pair, 0).x).toBe(1900);
    // Zaten değdiği eşyanın yanında kayabilir.
    const touching = place([
      { asset: "cabinet", x: 1900, depth: 0.3 },
      { asset: "cabinet", x: 1600, depth: 0.3 },
    ]);
    expect(by(touching, 0).fixes).toContain(EDGE.note);
  });
});
