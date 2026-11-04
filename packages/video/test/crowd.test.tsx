// @vitest-environment happy-dom
import { depthToFloor, STAGE, VectorCrowd, VectorShot } from "@ys/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Crowd, CROWD, crowdCss, crowdFigures, crowdZ, figureAt, figureSvg, type CrowdFigure } from "../src/crowd.tsx";
import { chantTimes, crowdBeat, crowdVoices, stepTimes } from "../src/crowd-timing.ts";

afterEach(cleanup);

const crowd = (extra: object = {}) => VectorCrowd.parse(extra);
const FLOOR = 700;
const rot = (css: string, id: string) => Number(new RegExp(`#${id}\\{transform:rotate\\((-?[\\d.]+)deg\\)`).exec(css)![1]);

describe("figüranlar: tarif", () => {
  it("yönetmenin tarifi: boşsa kalabalık, ayakta, gündelik giysili, başlıksız, tam genişlik; renk yalnız #rrggbb", () => {
    expect(VectorShot.parse({ crowd: {} }).crowd).toEqual({ size: "crowd", action: "stand", dress: "casual", headwear: "none", side: "full" });
    expect(VectorShot.parse({}).crowd).toBeUndefined();
    expect(VectorShot.safeParse({ crowd: { dress: "uniform", colour: "red" } }).success).toBe(false);
    expect(VectorShot.parse({ crowd: { dress: "uniform", colour: "#224466" } }).crowd!.colour).toBe("#224466");
  });
});

describe("figüranlar: kim nerede", () => {
  it("küme iki, kalabalık üç sıra; sıralar arkadan öne, kararlı (aynı tohum aynı kalabalık)", () => {
    const group = crowdFigures(crowd({ size: "group" }), "s1", FLOOR, []);
    expect(group).toHaveLength(CROWD.perRow.group * 2 + 1);
    const many = crowdFigures(crowd(), "s1", FLOOR, []);
    expect(many).toHaveLength(CROWD.perRow.crowd * 3 + 1);
    expect(many.map((f) => f.depth)).toEqual([...many.map((f) => f.depth)].sort((a, b) => b - a));
    expect(crowdFigures(crowd(), "s1", FLOOR, [])).toEqual(many);
    expect(crowdFigures(crowd(), "s2", FLOOR, [])).not.toEqual(many);
    for (const f of many) {
      expect(f.meters).toBeGreaterThanOrEqual(CROWD.height[0]);
      expect(f.meters).toBeLessThanOrEqual(CROWD.height[1]);
    }
  });

  it("side yalnız bir yarıyı doldurur; arkada kalan katmanın üstüne figüran çizilmez", () => {
    expect(crowdFigures(crowd({ side: "left" }), "s1", FLOOR, []).every((f) => f.x <= STAGE.width / 2)).toBe(true);
    expect(crowdFigures(crowd({ side: "right" }), "s1", FLOOR, []).every((f) => f.x >= STAGE.width / 2)).toBe(true);
    const board = { l: 800, r: 1100, t: 300, b: 700 };
    const kept = crowdFigures(crowd(), "s1", FLOOR, [board]);
    expect(kept.length).toBeLessThan(crowdFigures(crowd(), "s1", FLOOR, []).length);
    for (const f of kept) {
      const a = figureAt(f, crowd(), 0, FLOOR);
      expect(a.x + a.w / 2 <= board.l - CROWD.margin || a.x - a.w / 2 >= board.r + CROWD.margin).toBe(true);
    }
  });

  it("ileri yürüyen kalabalık çekim boyunca öne gelir, büyür; son yeri de arkadakini örtmez", () => {
    const march = crowd({ action: "advance" });
    const [f] = crowdFigures(march, "s1", FLOOR, []);
    const a0 = figureAt(f!, march, 0, FLOOR);
    const a1 = figureAt(f!, march, 1, FLOOR);
    expect(a1.y).toBeGreaterThan(a0.y);
    expect(a1.h).toBeGreaterThan(a0.h);
    expect(a0.y).toBeCloseTo(depthToFloor(f!.depth, FLOOR).y, 6);
    // Durağan kalabalık yerinde kalır.
    expect(figureAt(f!, crowd(), 1, FLOOR)).toEqual(figureAt(f!, crowd(), 0, FLOOR));
    // Çizim sırası ön sıranın derinliği; yürüyende çekim sonundaki yeri (daha önde, z büyük).
    expect(crowdZ(crowd())).toBeCloseTo(100 * (1 - CROWD.rows.crowd.at(-1)!), 6);
    expect(crowdZ(march)).toBeCloseTo(100 * (1 - CROWD.rows.crowd.at(-1)! + CROWD.advance), 6);
    expect(crowdZ(crowd({ size: "group" }))).toBeCloseTo(100 * (1 - CROWD.rows.group.at(-1)!), 6);
    // Yalnız son yerinde örten figüran da atılır.
    const end = { l: a1.x - 2, r: a1.x + 2, t: a1.y - 5, b: a1.y };
    expect(crowdFigures(march, "s1", FLOOR, [end]).some((g) => g.x === f!.x && g.depth === f!.depth)).toBe(false);
  });
});

describe("figüranlar: kılık", () => {
  const f: CrowdFigure = { x: 500, depth: 0.9, meters: 1.7, row: 0, skin: "#e3b08a", hair: "#2f2219", hairStyle: 0, top: "#3f5a7a", bottom: "#2e3440", phase: 0, tempo: 1 };

  it("giysi, başlık ve saç seçenekleri; parçaların kimliği önekli", () => {
    const casual = figureSvg(f, crowd(), "x-");
    for (const id of ["x-b", "x-al", "x-ar", "x-h", "x-ll", "x-lr"]) expect(casual).toContain(`id="${id}"`);
    expect(figureSvg(f, crowd({ dress: "robes" }), "x-")).not.toContain('id="x-ll"');
    expect(figureSvg(f, crowd({ dress: "formal" }), "x-")).toContain("#eeeeea");
    for (const headwear of ["cap", "helmet", "turban", "hat"]) expect(figureSvg(f, crowd({ headwear }), "x-")).not.toBe(casual);
    const styles = [0, 1, 2, 3].map((hairStyle) => figureSvg({ ...f, hairStyle }, crowd(), "x-"));
    expect(new Set(styles).size).toBe(4);
  });

  it("üniforma ve cübbe rengi yönetmenden; üniformada alt da aynı renk", () => {
    const [u] = crowdFigures(crowd({ dress: "uniform", colour: "#224466" }), "s1", FLOOR, []);
    expect([u!.top, u!.bottom]).toEqual(["#224466", "#224466"]);
    const [r] = crowdFigures(crowd({ dress: "robes", colour: "#663322" }), "s1", FLOOR, []);
    expect(r!.top).toBe("#663322");
    expect(crowdFigures(crowd({ dress: "uniform" }), "s1", FLOOR, [])[0]!.top).toMatch(/^#/);
    const formal = crowdFigures(crowd({ dress: "formal" }), "s1", FLOOR, []);
    expect(formal.every((g) => g.top === g.bottom)).toBe(true);
    expect(crowdFigures(crowd({ dress: "robes" }), "s1", FLOOR, [])[0]!.top).toMatch(/^#/);
  });
});

describe("figüranlar: ne yapıyor", () => {
  const figs = crowdFigures(crowd(), "s1", FLOOR, []).slice(0, 4);
  const css = (action: string, t = 1.3) => crowdCss(figs, crowd({ action }), t, "c-");

  it("sevinçte kollar havada, alkışta öne içe, protestoda sağ yumruk havada, dinlerken baş ortaya döner", () => {
    expect(rot(css("cheer"), "c-0-al")).toBeGreaterThan(130);
    expect(rot(css("cheer"), "c-0-ar")).toBeLessThan(-130);
    expect(css("cheer")).toContain("#c-0-b{transform:translate(0px, -");
    expect(rot(css("applaud"), "c-0-al")).toBeLessThan(0);
    expect(rot(css("applaud"), "c-0-ar")).toBeGreaterThan(0);
    expect(rot(css("protest"), "c-0-ar")).toBeLessThan(-150);
    const left = figs.findIndex((g) => g.x < STAGE.width / 2);
    expect(rot(css("listen"), `c-${left}-h`)).toBeGreaterThan(0);
    // Durağan: kollar yanda, bacaklar düz.
    expect(Math.abs(rot(css("stand"), "c-0-al"))).toBeLessThanOrEqual(2);
    expect(rot(css("stand"), "c-0-ll")).toBe(0);
  });

  it("protestoda yumruklar, yürüyüşte adımlar ortak vuruşta (ses de o anda); kişiye özgü kayma küçük", () => {
    const [t] = chantTimes(2);
    for (const f of figs) expect(rot(css("protest", t), `c-${figs.indexOf(f)}-ar`)).toBeLessThan(-175);
    const [step] = stepTimes(2);
    for (let i = 0; i < figs.length; i++) expect(Math.abs(rot(css("advance", step), `c-${i}-ll`))).toBeGreaterThan(11.5);
    // Ortadaki kişi tam vuruşta; en uçtaki en çok ~0,25 rad kayar.
    expect(crowdBeat(CROWD.chantHz, t!, Math.PI)).toBeCloseTo(-1, 9);
    expect(Math.abs(crowdBeat(CROWD.chantHz, t!, 0) + 1)).toBeLessThan(0.04);
    expect(crowdVoices("crowd")).toBe(crowdFigures(crowd(), "s1", FLOOR, []).length);
  });

  it("yürüyüşte bacaklar karşılıklı salınır; herkes kendi ritminde", () => {
    const c = css("advance", 0.2);
    expect(rot(c, "c-0-ll")).toBeCloseTo(-rot(c, "c-0-lr"), 6);
    expect(rot(c, "c-0-ll")).not.toBe(0);
    expect(rot(css("cheer"), "c-0-al")).not.toBe(rot(css("cheer"), "c-1-al"));
  });

  it("katman: her figüran kendi kutusunda, çizgi stili paketin, CSS kare başına", () => {
    const c = crowd({ action: "cheer" });
    const { container } = render(<Crowd crowd={c} figures={figs} p={0.5} t={1} prefix="c-" lineStyle="flat" floorY={FLOOR} />);
    const root = container.querySelector("[data-crowd]") as HTMLElement;
    expect(root.dataset.crowd).toBe("cheer");
    expect(root.style.filter).toBe(CROWD.filter);
    expect(root.querySelectorAll("svg")).toHaveLength(figs.length);
    // Düz stil koyu konturu siler.
    expect(root.innerHTML).not.toContain('stroke="#2b2b33"');
    expect(container.querySelector("style")!.textContent).toContain("#c-0-al{");
  });
});
