import { TimelineVisual, VectorAsset, VectorShot } from "@ys/core";
import { describe, expect, it } from "vitest";
import { SCENE_CUT } from "../src/cut.ts";
import { briskAnims, buildIn, ENTER, PACE, visualVector } from "../src/entrance.ts";

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

  it("giriş ve çıkış en çok PACE kadar sürer: girişin başı, çıkışın sonu yerinde; kısa olana ve draw_on'a dokunulmaz", () => {
    const vector = VectorShot.parse({
      layers: [
        {
          asset: "cup",
          x: 900,
          anims: [
            { type: "pop", start: 0, end: 1 },
            { type: "fade_out", start: 0.5, end: 0.9 },
          ],
        },
        {
          asset: "lamp",
          x: 300,
          anims: [
            { type: "slide_in", start: 0.2, end: 0.8 },
            { type: "fade_in", start: 0.1, end: 0.12 },
            { type: "draw_on", start: 0, end: 1 },
            { type: "explain", start: 0, end: 1 },
          ],
        },
      ],
      texts: [{ text: "Başlık", x: 0, y: 0, anims: [{ type: "fade_in", start: 0, end: 0.5 }, { type: "typewriter", start: 0, end: 1 }] }],
    });
    const visual = TimelineVisual.parse({ shotId: "s2-sh3", assetUrl: "", kind: "motion_graphic", fromFrame: 0, durationInFrames: 300, vector });
    const out = visualVector(visual, ASSETS, FPS)!;
    const spans = (anims: { type: string; start: number; end: number }[]) => anims.map((a) => [a.type, +a.start.toFixed(4), +a.end.toFixed(4)]);
    expect(out.layers.map((l) => spans(l.anims))).toEqual([
      [
        ["pop", 0, PACE.pop! / 10],
        ["fade_out", 0.82, 0.9],
      ],
      [
        ["slide_in", 0.2, 0.29],
        ["fade_in", 0.1, 0.12],
        ["draw_on", 0, 1],
        ["explain", 0, 1],
      ],
    ]);
    expect(spans(out.texts[0]!.anims)).toEqual([
      ["fade_in", 0, PACE.fade_in! / 10],
      ["typewriter", 0, 1],
    ]);
    // Kurulma girişleri de kısalmış tarifin üstüne eklenir.
    expect(briskAnims(vector, 10)).toEqual({ ...out, layers: out.layers });
  });

  it("set eşyası (dressing) odanın parçasıdır: odayla gelir, sıraya girmez", () => {
    const vector = VectorShot.parse({ layers: [{ asset: "hero", x: 900 }, { asset: "lamp", x: 300, depth: 0.9 }] });
    const visual = TimelineVisual.parse({ shotId: "s2-sh1", assetUrl: "", kind: "motion_graphic", fromFrame: 0, durationInFrames: 300, vector, enter: true, dressing: ["lamp"] });
    const out = visualVector(visual, ASSETS, FPS)!;
    expect(out.layers.map((l) => l.anims.map((a) => a.type))).toEqual([["fade_in"], []]);
    // Kişi ilk sırada belirir: eşya sıra tutmaz.
    expect(out.layers[0]!.anims[0]!.start).toBeCloseTo(after / 10);
  });
});
