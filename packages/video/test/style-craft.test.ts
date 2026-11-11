import { describe, expect, it } from "vitest";
import { TimelineVisual, VectorAsset, VectorShot, carriedObjects, styleCraftOf, stylePackOf } from "@ys/core";
import { visualVector } from "../src/entrance.ts";
import { inkPlates, plateOpacity, printProgress } from "../src/style-material.ts";
import { cutsOf } from "../src/cut.ts";

const assets = { object: VectorAsset.parse({ id: "object", kind: "prop", width: 100, height: 100, svg: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#d32619"/></svg>' }) };
const shot = () => VectorShot.parse({ background: "room", camera: { zoomFrom: 1, zoomTo: 1, panX: 0 }, layers: [{ asset: "object", x: 960, y: 750, height: 400 }] });
const visual = (extra = {}) => TimelineVisual.parse({ shotId: "s2-sh1", assetUrl: "", kind: "motion_graphic", fromFrame: 120, durationInFrames: 120, vector: shot(), enter: true, ...extra });

describe("pilot material rendering", () => {
  it.each([["paper-cutout", "slide_in"], ["risograph", "fade_in"], ["isometric", "draw_on"]])("%s establishes an object with %s and settles within the first 40 percent", (pack, type) => {
    expect(stylePackOf(pack)!.craft).toBe(styleCraftOf(pack));
    const out = visualVector(visual({ stylePack: pack }), assets, 30)!;
    expect(out.layers[0]!.anims[0]!.type).toBe(type);
    expect(out.layers[0]!.anims[0]!.end).toBeLessThanOrEqual(0.4);
    expect(shot().layers[0]!.anims).toEqual([]);
  });
  it("keeps old timelines, authored entrances, fixed dressing and carried props unchanged", () => {
    expect(visualVector(visual(), assets, 30)!.layers[0]!.anims[0]!.type).toBe("pop");
    for (const fixed of [{ dressing: ["object"] }, { carried: ["object"] }]) {
      expect(visualVector(visual({ stylePack: "isometric", ...fixed }), assets, 30)!.layers[0]!.anims).toEqual([]);
    }
    const authored = shot(); authored.layers[0]!.anims = [{ type: "draw_on", start: 0.3, end: 0.8 }];
    expect(visualVector(visual({ vector: authored, stylePack: "paper-cutout" }), assets, 30)!.layers).toEqual(authored.layers);
  });
  it("splits spot colours into independent plates with unique ids and stable offsets", () => {
    const svg = '<svg viewBox="0 0 100 100" fill="#f00"><g id="shape"><rect width="50" height="100"/><circle cx="50" cy="50" r="40" fill="#00f" stroke="#000"/></g></svg>';
    const plates = inkPlates(svg, "a-")!;
    expect(plates).toHaveLength(3);
    expect(plates[0]!.svg).toContain('fill="#f00"');
    expect(plates[0]!.svg).toContain('fill="none" stroke="none"');
    expect(plates[0]!.svg.match(/<svg[^>]+>/)![0].match(/ fill=/g)).toHaveLength(1);
    expect(plates[1]!.svg).toContain('id="a-1-shape"');
    expect(plates[2]!.svg).toContain('stroke="#000"');
    expect(plates.map((p) => [p.x, p.y])).toEqual([[0, 0], [1.25, 0.65], [-1.25, 0.65]]);
    expect(inkPlates(svg, "a-")).toEqual(plates);
    const defaults = inkPlates('<svg><path d="M0 0L10 10" fill="#ABCDEF"/><rect width="5" height="5"/></svg>', "b-")!;
    expect(defaults[1]!.svg).toContain('<svg fill="#000000">');
    const four = inkPlates('<svg><rect fill="#111"/><rect fill="#222"/><rect fill="#333"/></svg>', "d-")!;
    expect(four[3]!.y).toBe(-0.65);
  });
  it.each([
    '<svg><rect fill="url(#paint)"/></svg>', '<svg><mask id="m"/></svg>', '<svg><filter/></svg>',
    '<svg><linearGradient/></svg>', '<svg><radialGradient/></svg>', '<svg><rect style="fill:#f00"/></svg>',
    '<svg><rect fill="red"/></svg>', '<svg><rect fill="none"/></svg>',
    '<svg>' + Array.from({ length: 9 }, (_, i) => '<rect fill="#' + String(i).repeat(6) + '"/>').join("") + '</svg>',
  ])("preserves the original drawing for unsupported paint instead of corrupting it: %s", (svg) => {
    expect(inkPlates(svg, "f-")).toBeUndefined();
  });
  it("print timing supports backwards seeks, overlaps plates, and holds an opaque result", () => {
    const anims = [{ type: "fade_in" as const, start: 0.2, end: 0.4 }];
    const mid = printProgress(anims, 0.3);
    expect(printProgress([], 0)).toBe(1);
    expect(printProgress(anims, 0.1)).toBe(0);
    expect(printProgress(anims, 0.9)).toBe(1);
    expect(printProgress(anims, 0.3)).toBe(mid);
    expect(plateOpacity(mid, 0, 3)).toBeGreaterThan(plateOpacity(mid, 2, 3));
    expect(plateOpacity(0, 0, 1)).toBe(0);
    expect(plateOpacity(1, 2, 3)).toBe(1);
    expect(plateOpacity(-1, 0, 3)).toBe(0);
    expect(printProgress([{ ...anims[0]!, end: 0.2 }], 0.3)).toBe(1);
  });
});

describe("conservative object continuity", () => {
  it("carries a settled object into the next identical static stage and avoids a scene wipe", () => {
    const previous = shot(); previous.layers[0]!.anims = [{ type: "draw_on", start: 0, end: 0.2 }];
    const carried = carriedObjects(previous, shot());
    expect(carried).toEqual(["object"]);
    expect(cutsOf([{ shotId: "s1-sh1" }, { shotId: "s2-sh1", carried }], "a")[1]!.kind).toBe("dissolve");
  });
  it("refuses unmatched settings, geometry, moving cameras, held objects and animated handoffs", () => {
    expect(carriedObjects(undefined, shot())).toEqual([]);
    const changes = [
      (s: VectorShot) => { s.key = 0; },
      (s: VectorShot) => { s.callout = 0; },
      (s: VectorShot) => { s.background = undefined; },
      (s: VectorShot) => { s.background = "other"; },
      (s: VectorShot) => { s.mood = "warm"; },
      (s: VectorShot) => { s.camera.zoomTo = 1.5; },
      (s: VectorShot) => { s.camera.panX = 0.5; },
      (s: VectorShot) => { s.layers[0]!.x += 10; },
      (s: VectorShot) => { s.layers[0]!.heldBy = 1; },
      (s: VectorShot) => { s.layers[0]!.anims = [{ type: "move", start: 0, end: 1, toX: 100 }]; },
    ];
    for (const change of changes) { const other = shot(); change(other); expect(carriedObjects(other, shot())).toEqual([]); expect(carriedObjects(shot(), other)).toEqual([]); }
    const entrance = shot(); entrance.layers[0]!.anims = [{ type: "fade_in", start: 0, end: 0.2 }];
    expect(carriedObjects(shot(), entrance)).toEqual([]);
    const held = shot(); held.layers[0]!.heldBy = 1;
    expect(carriedObjects(held, held)).toEqual([]);
  });
});

it("Paper Poster uses calm direct cuts while other materials retain their transitions", () => {
 expect(cutsOf([{ shotId: "s1-sh1", stylePack: "paper-poster" }, { shotId: "s2-sh1", stylePack: "paper-poster" }], "poster")).toEqual([undefined, undefined]);
 expect(cutsOf([{ shotId: "s1-sh1" }, { shotId: "s2-sh1" }], "poster")[1]).toBeDefined();
 expect(visualVector(visual({ stylePack: "paper-poster" }), assets, 30)!.layers[0]!.anims[0]!.type).toBe("fade_in");
});
