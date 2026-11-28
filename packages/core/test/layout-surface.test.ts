import { describe, expect, it } from "vitest";
import { FURNITURE, resolveLayout, STAGE, SURFACE_TOP, TALL_ON, tableTop, VectorShot, workTopOf, type VectorAsset } from "../src/index.ts";

const asset = (id: string, kind: VectorAsset["kind"], meta: VectorAsset["meta"] = {}, w = 400, h = 400): VectorAsset => ({ id, kind, svg: "<svg/>", width: w, height: h, meta });

// Verilen yüzey 0,3 (gövdenin ortası), çizimden ölçülen tabla 0,9 (render meta.top'u doldurur).
const assets = {
  a: asset("a", "character", {}, 400, 800),
  robot: asset("robot", "character", { realHeight: 1.1 }, 400, 800),
  desk: asset("desk", "prop", { realHeight: 0.75, surface: 0.3, top: 0.9, grounded: true }, 1000, 500),
  plain: asset("plain", "prop", { realHeight: 0.75, surface: 0.9, grounded: true }, 1000, 500),
  sofa: asset("sofa", "prop", { realHeight: 0.9, surface: 0.45, top: 0.95, grounded: true }, 1000, 500),
  counter: asset("counter", "prop", { realHeight: 1, surface: 0.4, top: 1, grounded: true }, 4000, 500),
  counter1: asset("counter1", "prop", { realHeight: 1, surface: 1, grounded: true }, 4000, 500),
  cart: asset("cart", "prop", { surface: 0.9, grounded: true }, 800, 500),
  cup: asset("cup", "prop", { realHeight: 0.3 }, 200, 300),
  terminal: asset("terminal", "prop", { realHeight: 1.1, grounded: true }, 400, 560),
  cabinet: asset("cabinet", "prop", { realHeight: 1.2, grounded: true }, 600, 1000),
  shelf: asset("shelf", "prop", { realHeight: 1.5, surface: 0.95, grounded: true }, 800, 1000),
  map: asset("map", "prop", { realHeight: 0.6, grounded: false }, 800, 500),
  wallshelf: asset("wallshelf", "prop", { realHeight: 0.3, surface: 0.9, grounded: false }, 800, 200),
};
const place = (layers: unknown[]) => resolveLayout(VectorShot.parse({ layers }), assets);
const by = (placed: ReturnType<typeof resolveLayout>, i: number) => placed.find((p) => p.index === i)!;

describe("masa tablası (tableTop)", () => {
  it("ölçülen tabla verilenden raise kadar yüksekse o, değilse verilen; yüzeysiz eşyada undefined", () => {
    expect(tableTop({})).toBeUndefined();
    expect(tableTop({ top: 0.9 })).toBeUndefined();
    expect(tableTop({ surface: 0.4 })).toBe(0.4);
    expect(tableTop({ surface: 0.4, top: 0.4 + SURFACE_TOP.raise })).toBe(0.4);
    expect(tableTop({ surface: 0.4, top: 0.9 })).toBe(0.9);
    // Yalnız yükseltir: alçak ölçüm (sandalyenin ayak tabanı) kullanılmaz.
    expect(tableTop({ surface: 0.5, top: 0.1 })).toBe(0.5);
  });

  it("iş yüzeyi ve üstüne konan eşya tablada; çekmecelerin önünde değil", () => {
    const pl = { index: 0, x: 0, y: 900, width: 400, height: 200, scale: 1, z: 0, sitting: false, grounded: true, fixes: [] };
    expect(workTopOf(pl, assets.desk)).toBeCloseTo(900 - 200 * 0.9, 6);
    const placed = place([{ asset: "desk", x: 960, depth: 0.3 }, { asset: "cup", x: 960, on: 0 }]);
    const [desk, cup] = [by(placed, 0), by(placed, 1)];
    expect(cup.y).toBeCloseTo(desk.y - desk.height * 0.9, 6);
    expect(cup.on).toBe(0);
  });

  it("üstünde biri oturuyorsa oturak: eşya verilen yüzeyde kalır (ölçülen üst arkalıktır)", () => {
    const placed = place([{ asset: "sofa", x: 960, depth: 0.3 }, { asset: "a", x: 900, on: 0 }, { asset: "cup", x: 1100, on: 0 }]);
    const sofa = by(placed, 0);
    expect(by(placed, 2).y).toBeCloseTo(sofa.y - sofa.height * 0.45, 6);
    // Kimse oturmuyorsa aynı kanepe masa gibi.
    const alone = place([{ asset: "sofa", x: 960, depth: 0.3 }, { asset: "cup", x: 1100, on: 0 }]);
    expect(by(alone, 1).y).toBeCloseTo(by(alone, 0).y - by(alone, 0).height * 0.95, 6);
  });

  it("tezgâhın ardındaki kişi tablaya göre yükselir: verilen değer yanlış olsa da doğru tezgâhla aynı", () => {
    const at = (counter: string) => resolveLayout(VectorShot.parse({ layers: [{ asset: counter, x: 960, depth: 0.3 }, { asset: "robot", x: 960, depth: 0.45 }] }), assets);
    const [wrong, right] = [at("counter"), at("counter1")];
    expect(by(wrong, 1).fixes).toContain(FURNITURE.lifted);
    expect(by(wrong, 1).y).toBeCloseTo(by(right, 1).y, 6);
  });
});

describe("masaya konan zemin makinesi (TALL_ON)", () => {
  it("tabanından uzun, en az min m eşya masanın yanına, yönetmenin koyduğu yanda zemine iner; aynı derinlikte, kenarı değerek", () => {
    const placed = place([{ asset: "plain", x: 960, depth: 0.3 }, { asset: "terminal", x: 1100, on: 0 }]);
    const [desk, terminal] = [by(placed, 0), by(placed, 1)];
    expect(terminal.on).toBeUndefined();
    expect(terminal.y).toBe(desk.y);
    expect(terminal.z).toBe(desk.z);
    expect(terminal.grounded).toBe(true);
    expect(terminal.height).toBeCloseTo(1.1 * STAGE.pxPerMeter * desk.scale, 6);
    expect(terminal.x - terminal.width / 2).toBeCloseTo(desk.x + desk.width / 2, 6);
    expect(terminal.fixes).toContain(TALL_ON.note);
    // Solda koyduysa solda.
    const left = place([{ asset: "plain", x: 960, depth: 0.3 }, { asset: "terminal", x: 900, on: 0 }]);
    expect(by(left, 1).x + by(left, 1).width / 2).toBeCloseTo(by(left, 0).x - by(left, 0).width / 2, 6);
  });

  it("o yanda sahneye sığmazsa öbür yana, ikisinde de sığmazsa masanın hemen arkasına iner", () => {
    const edge = place([{ asset: "plain", x: 1650, depth: 0.3 }, { asset: "terminal", x: 1800, on: 0 }]);
    expect(by(edge, 1).x).toBeLessThan(by(edge, 0).x);
    // Sahne kadar geniş masa: iki yan da dışarıda.
    const wide = { ...assets, long: asset("long", "prop", { realHeight: 0.75, surface: 0.9, grounded: true }, 6000, 500) };
    const placed = resolveLayout(VectorShot.parse({ layers: [{ asset: "long", x: 960, depth: 0.3 }, { asset: "terminal", x: 1200, on: 0 }] }), wide);
    const [desk, terminal] = [by(placed, 0), by(placed, 1)];
    expect(terminal.x).toBe(desk.x);
    expect(terminal.z).toBeCloseTo(desk.z - 0.05, 6);
    expect(placed.indexOf(terminal)).toBeLessThan(placed.indexOf(desk));
  });

  it("tabanından kısa, min'den kısa ya da tabanı mobilya olmayan eşya yüzeyde kalır; boyu bilinmeyen taban türünün varsayılanıyla ölçülür", () => {
    // 1,2 m'lik dolap 1,5 m'lik rafın üstünde (taban daha uzun).
    const shelf = place([{ asset: "shelf", x: 960, depth: 0.3 }, { asset: "cabinet", x: 960, on: 0 }]);
    expect(by(shelf, 1).on).toBe(0);
    expect(by(shelf, 1).fixes).not.toContain(TALL_ON.note);
    // 0,3 m'lik bardak masada.
    expect(by(place([{ asset: "plain", x: 960, depth: 0.3 }, { asset: "cup", x: 960, on: 0 }]), 1).on).toBe(0);
    // Haritanın (üstü yok, yerde değil) üstündeki gemi simgesi yerinde.
    expect(by(place([{ asset: "map", x: 960, depth: 0.3 }, { asset: "terminal", x: 960, on: 0 }]), 1).on).toBe(0);
    // Yerde durmayan, üstü olan taban (duvar rafı) da.
    expect(by(place([{ asset: "wallshelf", x: 960, y: 400 }, { asset: "terminal", x: 960, on: 0 }]), 1).on).toBe(0);
    // Boyu verilmemiş araba: nesnenin varsayılan boyu (1 m'den kısa) sayılır, terminal yanına iner.
    expect(by(place([{ asset: "cart", x: 960, depth: 0.3 }, { asset: "terminal", x: 960, on: 0 }]), 1).fixes).toContain(TALL_ON.note);
  });
});
