import { resolveLayout, VectorShot, type VectorAsset } from "@ys/core";
import { describe, expect, it } from "vitest";
import { BURST, CLASH, IN_HAND, PORTABLE_M, stageAfter, stageBefore } from "../src/staging.ts";

const asset = (id: string, kind: VectorAsset["kind"], meta: VectorAsset["meta"] = {}, w = 400, h = 400): VectorAsset => ({ id, kind, svg: "<svg/>", width: w, height: h, meta });
const ASSETS = {
  hero: asset("hero", "character", {}, 400, 800),
  pal: asset("pal", "character", {}, 400, 800),
  horse: asset("horse", "character", { realHeight: 2.2 }, 800, 800),
  book: asset("book", "prop", { realHeight: 0.25 }),
  plate: asset("plate", "prop", { realHeight: 0.3 }),
  car: asset("car", "prop", { realHeight: 1.4 }),
  engine: asset("engine", "prop", { realHeight: 0.5, surface: 0.9, grounded: true }),
  thing: asset("thing", "prop"),
  desk: asset("desk", "prop", { realHeight: 0.75, surface: 1, grounded: true }, 1000, 500),
  // Ayaklı beyaz tahta (adından tanınır).
  "p-whiteboard": asset("p-whiteboard", "prop", { realHeight: 1.8, grounded: true }, 600, 900),
};
const shot = (layers: unknown[], texts: unknown[] = []) => VectorShot.parse({ layers, texts });
const types = (s: VectorShot, i: number) => s.layers[i]!.anims.map((a) => `${a.type}@${a.start}-${a.end}`);

describe("sahneleme: yerleşimden önce", () => {
  it("boş elle okuma/gösterme yakındaki en yakın taşınabilir nesneyi ele alır", () => {
    expect(IN_HAND.has("reading") && IN_HAND.has("show")).toBe(true);
    const { spec, problems } = stageBefore(
      shot([
        { asset: "hero", x: 760, depth: 0.3, anims: [{ type: "reading" }] },
        { asset: "plate", x: 1500 },
        { asset: "book", x: 1180 },
      ]),
      ASSETS,
      10,
    );
    expect(spec.layers[2]!.heldBy).toBe(0);
    expect(spec.layers[1]!.heldBy).toBeUndefined();
    expect(problems).toEqual([{ layer: 0, code: "action_without_prop", detail: "reading without holding anything: now holds layer 2", replan: false }]);
  });

  it("elinde zaten bir şey varsa dokunulmaz; jestsiz ve nesne katmanı da", () => {
    const held = shot([{ asset: "hero", x: 760, anims: [{ type: "show" }] }, { asset: "book", x: 0, heldBy: 0 }, { asset: "plate", x: 800, anims: [{ type: "show" }] }]);
    const out = stageBefore(held, ASSETS, 10);
    expect(out.problems).toEqual([]);
    expect(out.spec.layers).toEqual(held.layers);
  });

  it("taşınamayan, yüzey olan, üstünde bir şey duran, başka yerde duran, uzak, boyu bilinmeyen nesne ele alınmaz: jest düşer", () => {
    const { spec, problems } = stageBefore(
      shot([
        { asset: "hero", x: 960, depth: 0.3, anims: [{ type: "show", start: 0.2, end: 0.8 }, { type: "talk" }] },
        { asset: "car", x: 1000 },
        { asset: "engine", x: 900, depth: 0.3 },
        { asset: "desk", x: 700, depth: 0.3 },
        { asset: "plate", x: 700, on: 3 },
        { asset: "book", x: 2100 },
        { asset: "thing", x: 1000 },
        { asset: "pal", x: 1100, depth: 0.3 },
        { asset: "book", x: 1000, heldBy: 7 },
        { asset: "yok", x: 1000 },
      ]),
      ASSETS,
      10,
    );
    expect(PORTABLE_M).toBeLessThan(1.4);
    expect(types(spec, 0)).toEqual(["talk@0-1"]);
    expect(spec.layers.slice(1, 7).every((l) => l.heldBy === undefined)).toBe(true);
    expect(problems).toEqual([{ layer: 0, code: "action_without_prop", detail: "show without holding anything and nothing small to hold nearby: gesture dropped", replan: true }]);
  });

  it("bir kişinin üstüne binen kişi (at sırtı) yeniden plan ister; sandalyede oturan istemez", () => {
    const { problems } = stageBefore(
      shot([
        { asset: "horse", x: 700, depth: 0.45 },
        { asset: "hero", x: 700, on: 0 },
        { asset: "desk", x: 1300, depth: 0.3 },
        { asset: "pal", x: 1300, on: 2 },
        { asset: "pal", x: 1300, on: 3 },
        { asset: "hero", x: 1500, on: 5 },
        { asset: "hero", x: 1700, on: 9 },
      ]),
      ASSETS,
      10,
    );
    expect(problems.map((p) => [p.code, p.layer, p.replan])).toEqual([
      ["unsupported_staging", 1, true],
      ["unsupported_staging", 4, true],
    ]);
  });

  it("çakışan kol jestleri sıraya girer: önceki sonrakinin başında biter, olmazsa sonraki öncekinin ardına kayar, o da olmazsa düşer", () => {
    const run = (anims: object[], dur = 10) => stageBefore(shot([{ asset: "hero", x: 960, anims }]), ASSETS, dur);
    // Düşünürken gösterir: düşünme gösterme başlayınca biter.
    let out = run([{ type: "think" }, { type: "point", start: 0.5 }]);
    expect(types(out.spec, 0)).toEqual(["think@0-0.5", "point@0.5-1"]);
    expect(out.problems).toEqual([{ layer: 0, code: "gesture_clash", detail: "think and point overlapped 5.0 s: think now ends when point starts", replan: false }]);
    // Aynı anda başlayan iki jest: ikincisi ilkinin ardına.
    out = run([{ type: "wave", end: 0.3 }, { type: "point" }]);
    expect(types(out.spec, 0)).toEqual(["wave@0-0.3", "point@0.3-1"]);
    expect(out.problems[0]!.detail).toBe("wave and point overlapped 3.0 s: point now starts after wave");
    // Tamamen öbürünün içinde kalan kısa jest düşer.
    out = run([{ type: "explain" }, { type: "shrug", start: 0.03, end: 0.9 }, { type: "nod" }]);
    expect(types(out.spec, 0)).toEqual(["explain@0-1", "nod@0-1"]);
    expect(out.problems[0]!.detail).toBe("shrug overlapped explain for its whole length: dropped");
    // Düşen jest sonrakilerle karşılaştırılmaz; kısa örtüşme (geçiş) çakışma değildir.
    out = run([{ type: "explain" }, { type: "shrug", start: 0.03, end: 0.9 }, { type: "wave", start: 0.97 }]);
    expect(types(out.spec, 0)).toEqual(["explain@0-1", "wave@0.97-1"]);
    expect(CLASH.sec).toBe(0.5);
    out = run([{ type: "explain", end: 0.52 }, { type: "wave", start: 0.5, end: 0.8 }]);
    expect(out.problems).toEqual([]);
  });

  it("patlama jesti (sevinç, el sallama, irkilme) en çok BURST saniye sürer; kısası ve öbür jestler değişmez", () => {
    const { spec, problems } = stageBefore(
      shot([{ asset: "hero", x: 960, anims: [{ type: "cheer" }, { type: "surprised", start: 0.5, end: 0.7 }, { type: "talk" }] }]),
      ASSETS,
      10,
    );
    expect(BURST.cheer).toBe(3.5);
    expect(types(spec, 0)).toEqual(["cheer@0-0.35", "surprised@0.5-0.7", "talk@0-1"]);
    expect(problems).toEqual([{ layer: 0, code: "gesture_too_long", detail: "cheer held for 10.0 s: shortened to 3.5 s", replan: false }]);
  });
});

describe("sahneleme: yerleşimden sonra", () => {
  const after = (s: VectorShot, aims: (i: number) => boolean = () => false) => stageAfter(s, resolveLayout(s, ASSETS), ASSETS, aims);

  it("gösterecek bir şeyi olmayan işaret anlatmaya döner (hedefi silinir); hedefi olan kalır", () => {
    const { spec, problems } = after(shot([{ asset: "hero", x: 960, anims: [{ type: "point", target: 4, start: 0.2 }, { type: "talk" }] }]));
    expect(spec.layers[0]!.anims).toEqual([
      { type: "explain", start: 0.2, end: 1 },
      { type: "talk", start: 0, end: 1 },
    ]);
    expect(problems).toEqual([{ layer: 0, code: "point_at_nothing", detail: "points with nothing beside it and no label to point at: explains instead", replan: false }]);
    const kept = shot([{ asset: "hero", x: 960, anims: [{ type: "point" }] }]);
    expect(after(kept, () => true)).toEqual({ spec: kept, problems: [] });
  });

  it("elleri hiçbir eşyaya değmeyen klavye/yazı jesti düşer ve yeniden plan ister; masadaki kalır", () => {
    const far = after(shot([{ asset: "hero", x: 960, depth: 0.3, anims: [{ type: "typing" }, { type: "nod" }] }]));
    expect(types(far.spec, 0)).toEqual(["nod@0-1"]);
    expect(far.problems).toEqual([{ layer: 0, code: "action_without_prop", detail: "typing with no desk within reach: gesture dropped", replan: true }]);
    const atDesk = shot([{ asset: "desk", x: 960, depth: 0.3 }, { asset: "hero", x: 960, depth: 0.3, anims: [{ type: "writing" }] }]);
    expect(after(atDesk).problems).toEqual([]);
    // Ellerin önündeki eşyanın üstü yoksa (araba, duvardaki laptop) masa sayılmaz: kişi havaya yazıyordu (4 Kas).
    for (const thing of ["car", "thing"]) {
      const air = after(shot([{ asset: thing, x: 960, depth: 0.3 }, { asset: "hero", x: 960, depth: 0.3, anims: [{ type: "writing" }] }]));
      expect(air.problems.map((p) => p.code)).toEqual(["action_without_prop"]);
    }
  });

  it("yazı jesti kolunun yettiği panoyla da kalır, klavye kalmaz; ikisi birden varsa yalnız klavye düşer", () => {
    const board = (anims: object[]) => after(shot([{ asset: "p-whiteboard", x: 1200, depth: 0.3 }, { asset: "hero", x: 900, depth: 0.3, anims }]));
    const writes = board([{ type: "writing" }]);
    expect(writes.problems).toEqual([]);
    expect(types(writes.spec, 1)).toEqual(["writing@0-1"]);
    const both = board([{ type: "typing", end: 0.5 }, { type: "writing", start: 0.5 }]);
    expect(types(both.spec, 1)).toEqual(["writing@0.5-1"]);
    expect(both.problems).toEqual([{ layer: 1, code: "action_without_prop", detail: "typing with no desk within reach: gesture dropped", replan: true }]);
    const none = after(shot([{ asset: "hero", x: 900, depth: 0.3, anims: [{ type: "writing" }] }]));
    expect(none.problems[0]!.detail).toBe("writing with no desk or board within reach: gesture dropped");
  });

  it("nesneye ve yerleşmemiş katmana dokunulmaz", () => {
    const s = shot([{ asset: "thing", x: 960, anims: [{ type: "point" }] }, { asset: "yok", x: 300, anims: [{ type: "point" }] }]);
    expect(after(s)).toEqual({ spec: s, problems: [] });
  });
});
