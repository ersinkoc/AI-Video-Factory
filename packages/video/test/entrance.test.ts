import { TimelineVisual, VectorAsset, VectorShot } from "@ys/core";
import { describe, expect, it } from "vitest";
import { SCENE_CUT } from "../src/cut.ts";
import { buildIn, ENTER, visualVector } from "../src/entrance.ts";

const asset = (id: string, kind: "character" | "prop") => VectorAsset.parse({ id, kind, svg: "<svg/>", width: 100, height: 100 });
const ASSETS = { hero: asset("hero", "character"), pal: asset("pal", "character"), desk: asset("desk", "prop"), cup: asset("cup", "prop"), lamp: asset("lamp", "prop") };
const FPS = 30;
const after = SCENE_CUT.frames / FPS + ENTER.pause;
const enters = (spec: VectorShot) => spec.layers.map((l) => l.anims.filter((a) => a.type === "fade_in" || a.type === "pop").map((a) => [a.type, +a.start.toFixed(4), +a.end.toFixed(4)]));

describe("sahnenin parça parça kurulması", () => {
  it("önce üstünde bir şey duran eşya, sonra nesneler (arkadan öne), en son kişiler; elde tutulan tutanla birlikte", () => {
    const spec = VectorShot.parse({
      layers: [
        { asset: "hero", x: 900, depth: 0.3 },
        { asset: "cup", x: 950, on: 2 },
        { asset: "desk", x: 1000, depth: 0.4 },
        { asset: "lamp", x: 400, depth: 0.8 },
        { asset: "pal", x: 1400, depth: 0.5 },
        { asset: "cup", x: 1450, heldBy: 4 },
      ],
    });
    const dur = 10;
    const at = (n: number) => +((after + n * ENTER.gap) / dur).toFixed(4);
    const end = (n: number) => +((after + n * ENTER.gap + ENTER.length) / dur).toFixed(4);
    expect(enters(buildIn(spec, ASSETS, dur, FPS))).toEqual([
      [["fade_in", at(4), end(4)]],
      [["pop", at(2), end(2)]],
      [["pop", at(0), end(0)]],
      [["pop", at(1), end(1)]],
      [["fade_in", at(3), end(3)]],
      [["fade_in", at(3), end(3)]],
    ]);
  });

  it("kendi girişi olan, sahneye yürüyerek giren ve çizilmemiş katmana dokunulmaz; tutanı kendi girişiyle gelen nesne de", () => {
    const spec = VectorShot.parse({
      layers: [
        { asset: "hero", x: 900, anims: [{ type: "walk", toX: 1200 }] },
        { asset: "cup", x: 950, heldBy: 0 },
        { asset: "desk", x: 1000, anims: [{ type: "draw_on" }] },
        { asset: "ghost", x: 400 },
        { asset: "lamp", x: 300, heldBy: 5, anims: [{ type: "pop" }] },
        { asset: "pal", x: 1400 },
      ],
    });
    const out = buildIn(spec, ASSETS, 10, FPS);
    expect(out.layers.slice(0, 4)).toEqual(spec.layers.slice(0, 4));
    expect(out.layers[4]).toEqual(spec.layers[4]);
    expect(enters(out)[5]).toEqual([["fade_in", +(after / 10).toFixed(4), +((after + ENTER.length) / 10).toFixed(4)]]);
    // Girecek katman yoksa tarif aynen döner.
    const none = VectorShot.parse({ layers: [{ asset: "ghost", x: 1 }] });
    expect(buildIn(none, ASSETS, 10, FPS)).toBe(none);
  });

  it("büyük nesne (uçak, makine) büyüyerek değil solarak gelir", () => {
    const plane = VectorAsset.parse({ id: "plane", kind: "prop", svg: "<svg/>", width: 400, height: 200, meta: { realHeight: ENTER.big + 1 } });
    const spec = VectorShot.parse({ layers: [{ asset: "plane", x: 900 }, { asset: "cup", x: 300 }] });
    expect(buildIn(spec, { ...ASSETS, plane }, 10, FPS).layers.map((l) => l.anims[0]!.type)).toEqual(["fade_in", "pop"]);
    // Eski zaman çizelgesinde meta'sız varlık küçük sayılır, render çökmez.
    const old = { id: "cup", kind: "prop", svg: "<svg/>", width: 10, height: 10 } as unknown as VectorAsset;
    expect(buildIn(spec, { ...ASSETS, plane, cup: old }, 10, FPS).layers[1]!.anims[0]!.type).toBe("pop");
  });

  it("kısa çekimde aralar sıkışır: kurulma çekimin ENTER.within kesrinde biter", () => {
    const spec = VectorShot.parse({ layers: ["desk", "cup", "lamp", "hero", "pal"].map((asset, i) => ({ asset, x: 200 * i })) });
    const ends = buildIn(spec, ASSETS, 2, FPS).layers.flatMap((l) => l.anims.map((a) => a.end));
    expect(Math.max(...ends)).toBeCloseTo(ENTER.within, 6);
  });

  it("çizilen tarif: yalnız sahnenin ilk çekiminde (enter) kurulma girişleriyle", () => {
    const vector = VectorShot.parse({ layers: [{ asset: "hero", x: 900 }] });
    const visual = (extra: object) => TimelineVisual.parse({ shotId: "s2-sh1", assetUrl: "", kind: "motion_graphic", fromFrame: 0, durationInFrames: 300, ...extra });
    expect(visualVector(visual({ vector }), ASSETS, FPS)).toEqual(vector);
    expect(visualVector(visual({}), ASSETS, FPS)).toBeUndefined();
    expect(visualVector(visual({ vector, enter: true }), ASSETS, FPS)!.layers[0]!.anims.map((a) => a.type)).toEqual(["fade_in"]);
  });
});
