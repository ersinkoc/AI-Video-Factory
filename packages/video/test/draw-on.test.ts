import { describe, expect, it } from "vitest";
import { drawCss, drawPlan, shapeLength } from "../src/drawOn.ts";

/** CSS'teki bir öğenin kuralları (yoksa undefined: öğe olduğu gibi görünür). */
function rule(css: string, key: string): Record<string, string> | undefined {
  const m = new RegExp(`\\[data-draw="${key}"\\]\\{([^}]*)\\}`).exec(css);
  return m ? Object.fromEntries(m[1]!.split(";").map((d) => d.split(":") as [string, string])) : undefined;
}

describe("elle çizim (paper.js uzunlukları)", () => {
  it("şekillerin çevre uzunluğu", () => {
    expect(shapeLength("path", { d: "M0 0L30 40" })).toBeCloseTo(50);
    // İki parçalı yol: iki üçgenin çevresi.
    expect(shapeLength("path", { d: "M0 0h10v10zM20 20h10v10z" })).toBeCloseTo(2 * (20 + Math.SQRT2 * 10));
    expect(shapeLength("path", { d: "M0 0A10 10 0 0 1 20 0" })).toBeCloseTo(Math.PI * 10);
    expect(shapeLength("rect", { x: "5", y: "5", width: "10", height: "20" })).toBeCloseTo(60);
    // Yuvarlatılmış köşe çevreyi kısaltır; ry verilmezse rx'e eşittir.
    expect(shapeLength("rect", { width: "10", height: "20", rx: "2" })).toBeCloseTo(60 - 8 * 2 + 2 * Math.PI * 2, 1);
    expect(shapeLength("rect", { width: "10", height: "20", ry: "2" })).toBeCloseTo(60 - 8 * 2 + 2 * Math.PI * 2, 1);
    expect(shapeLength("circle", { r: "10" })).toBeCloseTo(20 * Math.PI);
    expect(shapeLength("ellipse", { rx: "10", ry: "10" })).toBeCloseTo(20 * Math.PI, 1);
    expect(shapeLength("line", { x1: "0", y1: "0", x2: "3", y2: "4" })).toBe(5);
    expect(shapeLength("polyline", { points: "0,0 10,0 10,10" })).toBeCloseTo(20);
    expect(shapeLength("polygon", { points: "0 0 10 0 10 10" })).toBeCloseTo(20 + Math.SQRT2 * 10);
    expect(shapeLength("polygon", {})).toBe(0);
  });

  it("bozuk şekil verisi çizimi düşürmez: uzunluk 0", () => {
    // paper "moveTo yok" diye hata fırlatır, kısmi eğri NaN verir.
    expect(shapeLength("path", { d: "L 10 10" })).toBe(0);
    expect(shapeLength("path", { d: "M0 0C1" })).toBe(0);
    expect(shapeLength("circle", { r: "yok" })).toBe(0);
    expect(shapeLength("path", {})).toBe(0);
    // Tek tırnaklı öznitelikler de okunur.
    expect(drawPlan("<svg><path d='M0 0H40' stroke='#000'/></svg>", "q").strokes[0]).toMatchObject({ length: 40, ink: false });
  });

  it("çizilebilir öğeler işaretlenir; tanım, kırpma ve maske içindekiler çizilmez", () => {
    const svg =
      '<svg viewBox="0 0 520 260"><defs><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><rect width="5" height="5"/></clipPath></defs>' +
      "<clipPath id='e'/>" +
      '<g stroke="#000"><path d="M0 0L30 40" stroke="#123"></path><rect width="10" height="10" fill-opacity="0.5"/><circle r="1" style="fill:red;stroke:#fff"/><line x2="1" stroke="none"/></g></svg>';
    const plan = drawPlan(svg, "s1-0-d");
    expect(plan.strokes.map((s) => [s.key, s.ink, s.fillOpacity])).toEqual([
      ["s1-0-d0", false, 1],
      ["s1-0-d1", true, 0.5],
      ["s1-0-d2", false, 1],
      ["s1-0-d3", true, 1],
    ]);
    expect(plan.svg).toContain('<path d="M0 0L30 40" stroke="#123" data-draw="s1-0-d0"></path>');
    expect(plan.svg).toContain('<rect width="10" height="10" fill-opacity="0.5" data-draw="s1-0-d1"/>');
    expect(plan.svg).toContain('<clipPath id="c"><rect width="5" height="5"/></clipPath>');
    // Mürekkep görüntü kutusuyla orantılı (520 birimlik çizimde 2).
    expect(plan.inkWidth).toBe(2);
    expect(drawPlan('<svg><path d="M0 0L1 1"/></svg>', "x").inkWidth).toBeCloseTo(100 / 260);
  });

  it("konturlar sırayla, uzunlukla orantılı sürede çizilir; çok kısa öğe de kısa bir an alır", () => {
    const plan = drawPlan('<svg><path d="M0 0H300"/><path d="M0 0H100"/><path d="M0 0H0.001"/></svg>', "k");
    const [a, b, c] = plan.strokes;
    expect(a!.from).toBe(0);
    expect(b!.from).toBe(a!.to);
    expect(a!.to - a!.from).toBeCloseTo(3 * (b!.to - b!.from));
    expect(c!.to - c!.from).toBeGreaterThan(0.0005);
    expect(c!.to).toBeCloseTo(0.8);
  });

  it("çizim başında hiçbir şey görünmez, kontur ilerler, dolgu arkadan gelir, bitince kural kalmaz", () => {
    const plan = drawPlan('<svg><path d="M0 0H100" stroke="#000"/><rect width="50" height="50" fill-opacity="0.5"/></svg>', "k");
    const start = drawCss(plan, 0);
    // Başlamamış kontur görünmez (yuvarlak uçlu sıfır tire nokta gibi kalmasın).
    expect(rule(start, "k0")).toEqual({ "fill-opacity": "0.000", "stroke-dasharray": "100.00 100.00", "stroke-dashoffset": "100.00", "stroke-opacity": "0" });
    expect(rule(start, "k1")!["stroke-opacity"]).toBe("0");

    // İlk yolun yarısı çizilmiş; kendi konturu olduğu için mürekkep yok.
    const half = drawCss(plan, plan.strokes[0]!.to / 2);
    expect(rule(half, "k0")).toEqual({ "fill-opacity": "0.000", "stroke-dasharray": "100.00 100.00", "stroke-dashoffset": "50.00" });

    // Dolgusuz kare mürekkeple çizilir; dolgusu kendi saydamlığına kadar gelir, mürekkep söner.
    const filling = drawCss(plan, 0.9);
    expect(rule(filling, "k1")).toMatchObject({ "fill-opacity": "0.250", "stroke-dashoffset": "0.00", stroke: "#1d1a24", "stroke-width": "0.38", "stroke-opacity": "0.500" });
    expect(rule(filling, "k0")).toBeUndefined();
    expect(drawCss(plan, 1)).toBe("");
  });

  it("uzunluğu ölçülemeyen öğe sırası gelince bütünüyle belirir", () => {
    const plan = drawPlan('<svg><path d="L 10 10"/></svg>', "z");
    expect(rule(drawCss(plan, 0), "z0")).toEqual({ opacity: "0.000" });
    expect(rule(drawCss(plan, 0.9), "z0")).toEqual({ opacity: "0.500" });
  });
});
