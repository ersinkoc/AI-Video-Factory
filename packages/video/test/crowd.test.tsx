// @vitest-environment happy-dom
import { depthToFloor, STAGE, VectorCrowd, VectorShot } from "@ys/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Crowd, CROWD, crowdCss, crowdFigures, crowdZ, figureAt, figureSvg, shade, type CrowdFigure } from "../src/crowd.tsx";
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
  const f: CrowdFigure = {
    x: 500,
    depth: 0.9,
    meters: 1.7,
    row: 0,
    skin: "#e3b08a",
    hair: "#2f2219",
    hairStyle: 0,
    top: "#3f5a7a",
    bottom: "#2e3440",
    phase: 0,
    tempo: 1,
    build: 1,
    turn: 0,
    pose: 0.5,
    beard: false,
  };

  it("giysi, başlık, saç ve sakal seçenekleri; parçaların kimliği önekli; kol dirsekte bükülen iki parça", () => {
    const casual = figureSvg(f, crowd(), "x-");
    for (const id of ["x-b", "x-al", "x-ar", "x-fl", "x-fr", "x-h", "x-ll", "x-lr"]) expect(casual).toContain(`id="${id}"`);
    // Ön kol üst kolun içinde (dirsekte onunla döner).
    expect(casual.indexOf('id="x-fl"')).toBeGreaterThan(casual.indexOf('id="x-al"'));
    expect(casual.indexOf('id="x-fl"')).toBeLessThan(casual.indexOf('id="x-ar"'));
    expect(figureSvg(f, crowd({ dress: "robes" }), "x-")).not.toContain('id="x-ll"');
    expect(figureSvg(f, crowd({ dress: "formal" }), "x-")).toContain("#eeeeea");
    // Üniformada kemer tokası, cübbede kuşak (giysinin koyusu).
    expect(figureSvg(f, crowd({ dress: "uniform" }), "x-")).toContain("#c9a94a");
    expect(figureSvg(f, crowd({ dress: "robes" }), "x-")).toContain(shade(f.top, 0.72));
    for (const headwear of ["cap", "helmet", "turban", "hat"]) expect(figureSvg(f, crowd({ headwear }), "x-")).not.toBe(casual);
    // Şapkanın siperi bakılan yana.
    expect(figureSvg({ ...f, turn: -1 }, crowd({ headwear: "cap" }), "x-")).toContain("L22 22");
    const styles = [0, 1, 2, 3, 4, 5].map((hairStyle) => figureSvg({ ...f, hairStyle }, crowd(), "x-"));
    expect(new Set(styles).size).toBe(6);
    expect(figureSvg({ ...f, beard: true }, crowd(), "x-")).not.toBe(casual);
  });

  it("yüz eyleme göre: protestoda açık ağız ve çatık kaş, sevinçte gülen ağız; bakış yönünde kayar", () => {
    expect(figureSvg(f, crowd({ action: "protest" }), "x-")).toContain('<ellipse cx="50.00" cy="43"');
    expect(figureSvg(f, crowd({ action: "cheer" }), "x-")).toContain("M44.50 40.5 Q50.00 48.5");
    expect(figureSvg(f, crowd(), "x-")).toContain('cx="43.00" cy="30.5"');
    expect(figureSvg({ ...f, turn: 1 }, crowd(), "x-")).toContain('cx="46.50" cy="30.5"');
  });

  it("gölge rengi: her kanal k katı, sınırda kalır", () => {
    expect(shade("#808080", 0.5)).toBe("#404040");
    expect(shade("#ff8000", 2)).toBe("#ffff00");
  });

  it("üniforma ve cübbe rengi yönetmenden; üniformada alt da aynı renk; yapı, bakış ve duruş kişiye göre", () => {
    const [u] = crowdFigures(crowd({ dress: "uniform", colour: "#224466" }), "s1", FLOOR, []);
    expect([u!.top, u!.bottom]).toEqual(["#224466", "#224466"]);
    const [r] = crowdFigures(crowd({ dress: "robes", colour: "#663322" }), "s1", FLOOR, []);
    expect(r!.top).toBe("#663322");
    expect(crowdFigures(crowd({ dress: "uniform" }), "s1", FLOOR, [])[0]!.top).toMatch(/^#/);
    const formal = crowdFigures(crowd({ dress: "formal" }), "s1", FLOOR, []);
    expect(formal.every((g) => g.top === g.bottom)).toBe(true);
    expect(crowdFigures(crowd({ dress: "robes" }), "s1", FLOOR, [])[0]!.top).toMatch(/^#/);
    const all = crowdFigures(crowd(), "s1", FLOOR, []);
    expect(all.every((g) => g.build >= CROWD.build[0] && g.build <= CROWD.build[1] && Math.abs(g.turn) <= 1)).toBe(true);
    // Uzun saçlıda ve topuzluda sakal yok; kalabalıkta sakallı da var.
    expect(all.some((g) => g.beard)).toBe(true);
    expect(all.filter((g) => g.hairStyle === 1 || g.hairStyle === 3).every((g) => !g.beard)).toBe(true);
    // Yapı genişliği değiştirir.
    expect(figureAt({ ...all[0]!, build: 1.1 }, crowd(), 0, FLOOR).w).toBeCloseTo(figureAt({ ...all[0]!, build: 1 }, crowd(), 0, FLOOR).w * 1.1, 6);
  });
});

describe("figüranlar: ne yapıyor", () => {
  // Duruşları seçilmiş dört kişi: iki solda, iki sağda.
  const [base] = crowdFigures(crowd(), "s1", FLOOR, []);
  const poses = [0.1, 0.5, 0.8, 0.95];
  const figs = poses.map((pose, i) => ({ ...base!, x: i < 2 ? 300 + i * 100 : 1500 + i * 100, pose, phase: i, tempo: 0.9 + i * 0.05, turn: 0 }));
  const css = (action: string, t = 1.3) => crowdCss(figs, crowd({ action }), t, "c-");

  it("sevinçte kollar havada (kimi tek kolla), alkışta dirsekler dışa açık eller göğüste, dinlerken baş ortaya döner", () => {
    expect(rot(css("cheer"), "c-1-al")).toBeGreaterThan(130);
    expect(rot(css("cheer"), "c-1-ar")).toBeLessThan(-130);
    // pose 0,1: tek kol (sağ) havada, sol aşağıda.
    expect(rot(css("cheer"), "c-0-al")).toBeLessThan(20);
    expect(rot(css("cheer"), "c-0-ar")).toBeLessThan(-130);
    expect(css("cheer")).toContain("#c-0-b{transform:translate(0px, -");
    expect(rot(css("applaud"), "c-0-al")).toBeGreaterThan(0);
    expect(rot(css("applaud"), "c-0-fl")).toBeLessThan(-100);
    expect(rot(css("applaud"), "c-0-fr")).toBeGreaterThan(100);
    expect(rot(css("listen"), "c-1-h")).toBeGreaterThan(0);
    expect(rot(css("listen"), "c-3-h")).toBeLessThan(0);
    // pose 0,1 dinlerken kollarını kavuşturur; 0,5 kollar yanda.
    expect(rot(css("listen"), "c-0-fl")).toBeLessThan(-100);
    expect(Math.abs(rot(css("listen"), "c-1-fl"))).toBeLessThan(10);
    // Durağan: kollar yanda, bacaklar düz; pose 0,1 elleri belde.
    expect(Math.abs(rot(css("stand"), "c-1-al"))).toBeLessThanOrEqual(2);
    expect(rot(css("stand"), "c-1-ll")).toBe(0);
    expect(rot(css("stand"), "c-0-al")).toBeGreaterThan(30);
  });

  it("protestoda kimi sağ, kimi sol, kimi iki yumruk; yumruklar ortak vuruşta (ses de o anda), kişiye özgü kayma küçük", () => {
    const [t] = chantTimes(2);
    const at = css("protest", t);
    // pose 0,1 sağ; 0,5 sol; 0,8 iki yumruk; 0,95 kollar aşağıda.
    expect(rot(at, "c-0-ar")).toBeLessThan(-175);
    expect(Math.abs(rot(at, "c-0-al"))).toBeLessThan(5);
    expect(rot(at, "c-1-al")).toBeGreaterThan(175);
    expect(rot(at, "c-2-al")).toBeGreaterThan(175);
    expect(rot(at, "c-2-ar")).toBeLessThan(-175);
    expect(Math.abs(rot(at, "c-3-ar"))).toBeLessThan(5);
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
    expect(rot(css("cheer"), "c-1-al")).not.toBe(rot(css("cheer"), "c-2-al"));
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
    expect(container.querySelector("style")!.textContent).toContain("#c-0-fl{");
  });
});
