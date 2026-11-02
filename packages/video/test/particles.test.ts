import { describe, expect, it } from "vitest";
import { CONFETTI_COLORS, drawShapes, particleFrame, type Pen, type Shape } from "../src/particles.ts";

const W = 1920;
const H = 1080;
const of = <S extends Shape["shape"]>(shapes: Shape[], kind: S) => shapes.filter((s): s is Extract<Shape, { shape: S }> => s.shape === kind);

describe("parçacık atmosferi (PixiJS kareleri)", () => {
  it("yağmur üç derinlik katmanında 550 eğik damla ve 70 sıçrama; yakın damla kalın ve parlak", () => {
    const f = particleFrame("rain", "a", 1, W, H);
    const drops = of(f.shapes, "streak");
    expect(drops).toHaveLength(550);
    expect(of(f.shapes, "ring")).toHaveLength(70);
    expect(f.blend).toBe("normal");
    for (const d of drops) expect((d.x2 - d.x) / (d.y2 - d.y)).toBeCloseTo(0.18);
    const far = drops[0]!;
    const near = drops[549]!;
    expect(near.width).toBeGreaterThan(far.width);
    expect(near.alpha).toBeGreaterThan(far.alpha);
    // Sıçramalar zemin bandında ve yassı.
    for (const r of of(f.shapes, "ring")) {
      expect(r.y).toBeGreaterThanOrEqual(H * 0.8);
      expect(r.ry).toBeCloseTo(r.rx * 0.3);
      expect(r.alpha).toBeLessThanOrEqual(0.5);
    }
  });

  it("damlalar zamanla düşer; aynı tohum aynı kareyi, başka tohum başka kareyi verir", () => {
    const a = particleFrame("rain", "a", 1, W, H).shapes;
    expect(particleFrame("rain", "a", 1, W, H).shapes).toEqual(a);
    expect(particleFrame("rain", "b", 1, W, H).shapes).not.toEqual(a);
    expect(particleFrame("rain", "a", 1.1, W, H).shapes[0]).not.toEqual(a[0]);
  });

  it("kar 420 tane; yalnız en yakın katman yumuşak haleli ve iri", () => {
    const dots = of(particleFrame("snow", "s", 2, W, H).shapes, "dot");
    expect(dots).toHaveLength(420);
    expect(dots.filter((d) => d.glow)).toHaveLength(60);
    expect(Math.max(...dots.filter((d) => !d.glow).map((d) => d.r))).toBeLessThan(Math.max(...dots.filter((d) => d.glow).map((d) => d.r)));
    for (const d of dots) expect(d.color).toBe(0xffffff);
  });

  it("toz ve kıvılcım ışık saçar (eklemeli karışım); kıvılcım yükseldikçe kızarır ve tepede söner", () => {
    const dust = particleFrame("dust", "d", 3, W, H);
    expect(dust.blend).toBe("add");
    expect(of(dust.shapes, "dot")).toHaveLength(240);
    const embers = particleFrame("embers", "e", 3, W, H);
    expect(embers.blend).toBe("add");
    const dots = of(embers.shapes, "dot");
    expect(dots).toHaveLength(170);
    for (const d of dots) {
      const heat = d.y / H;
      expect(d.color).toBe(heat > 0.66 ? 0xffd27a : heat > 0.33 ? 0xff9a3c : 0xff5a1e);
      expect(d.alpha).toBeLessThanOrEqual(Math.min(1, heat / 0.6) + 1e-9);
    }
    expect(new Set(dots.map((d) => d.color)).size).toBe(3);
  });

  it("konfeti 240 renkli kâğıt: paletten renk, döner ve takla atar", () => {
    const chips = of(particleFrame("confetti", "c", 1.5, W, H).shapes, "chip");
    expect(chips).toHaveLength(240);
    for (const c of chips) {
      expect(CONFETTI_COLORS).toContain(c.color);
      expect(Math.abs(c.flip)).toBeLessThanOrEqual(1);
    }
    const later = of(particleFrame("confetti", "c", 1.6, W, H).shapes, "chip");
    expect(later[0]!.angle).not.toBe(chips[0]!.angle);
  });

  it("çok sayıda tohumda önbellek temizlenir ama sonuç değişmez", () => {
    const first = particleFrame("dust", "k0", 0, W, H).shapes;
    for (let i = 1; i < 80; i++) particleFrame("dust", `k${i}`, 0, W, H);
    expect(particleFrame("dust", "k0", 0, W, H).shapes).toEqual(first);
  });

  it("şekiller kaleme çizilir: damla çizgi, haleli nokta iki daire, sıçrama elips, kâğıt dönmüş dörtgen", () => {
    const calls: [string, unknown[]][] = [];
    const pen = new Proxy({} as Pen, {
      get: (_, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, args]);
          return pen;
        },
    });
    drawShapes(pen, [
      { shape: "streak", x: 0, y: 0, x2: 2, y2: 10, width: 1, color: 1, alpha: 0.5 },
      { shape: "dot", x: 5, y: 5, r: 2, color: 2, alpha: 0.5, glow: true },
      { shape: "dot", x: 5, y: 5, r: 2, color: 2, alpha: 0.5, glow: false },
      { shape: "ring", x: 1, y: 1, rx: 4, ry: 1, width: 1, color: 3, alpha: 0.4 },
      { shape: "chip", x: 100, y: 100, w: 10, h: 6, angle: Math.PI / 2, flip: 1, color: 4, alpha: 1 },
    ]);
    const names = calls.map(([n]) => n);
    expect(names).toEqual(["clear", "moveTo", "lineTo", "stroke", "circle", "fill", "circle", "fill", "circle", "fill", "ellipse", "stroke", "poly", "fill"]);
    expect(calls[4]![1]).toEqual([5, 5, 5.2]);
    expect(calls[5]![1]).toEqual([{ color: 2, alpha: 0.5 * 0.18 }]);
    // 90° dönmüş 10×6 kâğıt: genişlik dikeye geçer.
    const pts = calls[12]![1][0] as number[];
    expect(pts.map((v) => Math.round(v))).toEqual([103, 95, 103, 105, 97, 105, 97, 95]);
  });
});
