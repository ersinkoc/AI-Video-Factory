import { random } from "remotion";

/** PixiJS ile çizilen parçacıklı atmosferler (sis, titreme, huzme CSS'te kalır). */
export type ParticleKind = "rain" | "snow" | "dust" | "embers" | "confetti";

/** Bir karede çizilecek tek şekil: çizgi (damla), nokta (kar, toz; glow ile yumuşak), halka (sıçrama), kâğıt (konfeti). */
export type Shape =
  | { shape: "streak"; x: number; y: number; x2: number; y2: number; width: number; color: number; alpha: number }
  | { shape: "dot"; x: number; y: number; r: number; color: number; alpha: number; glow: boolean }
  | { shape: "ring"; x: number; y: number; rx: number; ry: number; width: number; color: number; alpha: number }
  | { shape: "chip"; x: number; y: number; w: number; h: number; angle: number; flip: number; color: number; alpha: number };

export interface ParticleFrame {
  shapes: Shape[];
  /** Işık saçanlar (toz, kıvılcım) ekleyerek karışır. */
  blend: "normal" | "add";
}

/** 0..1 aralığında sarmalayan konum. */
const wrap = (v: number) => ((v % 1) + 1) % 1;

/** Derinlik katmanları: uzaktaki parçacık çok, ince, soluk ve yavaş; yakındaki az, iri, parlak ve hızlı (paralaks). */
const LAYERS: Record<"rain" | "snow", { n: number; depth: number }[]> = {
  rain: [
    { n: 260, depth: 0.35 },
    { n: 200, depth: 0.65 },
    { n: 90, depth: 1 },
  ],
  snow: [
    { n: 220, depth: 0.3 },
    { n: 140, depth: 0.6 },
    { n: 60, depth: 1 },
  ],
};

export const CONFETTI_COLORS = [0xff5a5f, 0xffd84d, 0x3ec1d3, 0x7bd389, 0xa78bfa, 0xff9f43];

/** Parçacık başına sabit rastgele sayılar (tohumdan): her karede yeniden hash'lenmesin diye önbellekte. */
const cache = new Map<string, number[][]>();
function seeds(seed: string, n: number): number[][] {
  const key = `${seed}|${n}`;
  let s = cache.get(key);
  if (!s) {
    if (cache.size > 64) cache.clear();
    s = Array.from({ length: n }, (_, i) => Array.from({ length: 6 }, (_, k) => random(`${seed}-${k}-${i}`)));
    cache.set(key, s);
  }
  return s;
}

/**
 * Atmosferin t anındaki karesi: her parçacığın yeri tohum ve zamandan hesaplanır (durum tutulmaz), böylece paralel
 * render sekmeleri ve tekrar render aynı kareyi verir. Eski SVG sürümü 90–140 parçacıkla sınırlıydı ve bulanıklık
 * filtresi yavaştı; WebGL'de derinlik katmanlı yüzlerce parçacık ve yere çarpan damla sıçramaları çizilir.
 */
export function particleFrame(kind: ParticleKind, seed: string, t: number, width: number, height: number): ParticleFrame {
  const shapes: Shape[] = [];
  switch (kind) {
    case "rain": {
      const slant = 0.18;
      for (const [li, layer] of LAYERS.rain.entries()) {
        for (const [rx, ry, rs, rz] of seeds(`${seed}-rain${li}`, layer.n) as [number, number, number, number][]) {
          const d = layer.depth;
          const len = (18 + 40 * d) * (0.8 + 0.4 * rz);
          const speed = (1400 + 1000 * d) * (0.85 + 0.3 * rs);
          const travel = height + len;
          const y = wrap(ry + (t * speed) / travel) * travel - len;
          const x = wrap(rx + (slant * y) / width) * width;
          shapes.push({ shape: "streak", x, y, x2: x + len * slant, y2: y + len, width: 0.8 + 2.2 * d, color: 0xd2e1ff, alpha: 0.18 + 0.35 * d });
        }
      }
      // Yere çarpan damlalar: zemin bandında genişleyip sönen yassı halkalar (her döngüde başka yerde).
      const period = 0.45;
      for (const [i, [phase, rw]] of (seeds(`${seed}-splash`, 70) as [number, number][]).entries()) {
        const cycle = t / period + phase;
        const age = wrap(cycle);
        const c = Math.floor(cycle);
        const x = random(`${seed}-sx-${i}-${c}`) * width;
        const y = height * (0.8 + 0.18 * random(`${seed}-sy-${i}-${c}`));
        const r = (2 + 12 * age) * (0.7 + 0.6 * rw);
        shapes.push({ shape: "ring", x, y, rx: r, ry: r * 0.3, width: 1.2, color: 0xdce8ff, alpha: (1 - age) * 0.5 });
      }
      return { shapes, blend: "normal" };
    }
    case "snow": {
      for (const [li, layer] of LAYERS.snow.entries()) {
        for (const [rx, ry, rs, rz, rp] of seeds(`${seed}-snow${li}`, layer.n) as [number, number, number, number, number][]) {
          const d = layer.depth;
          const r = (1.2 + 4.5 * d) * (0.7 + 0.6 * rz);
          const speed = (30 + 90 * d) * (0.7 + 0.6 * rs);
          const travel = height + 4 * r;
          const y = wrap(ry + (t * speed) / travel) * travel - 2 * r;
          const sway = Math.sin(t * (0.4 + 0.8 * rs) + rp * Math.PI * 2) * (10 + 30 * d);
          const x = wrap(rx + (sway + t * 15 * d) / width) * width;
          shapes.push({ shape: "dot", x, y, r, color: 0xffffff, alpha: 0.35 + 0.55 * d, glow: d === 1 });
        }
      }
      return { shapes, blend: "normal" };
    }
    case "dust": {
      for (const [rx, ry, rs, rz, rp] of seeds(`${seed}-dust`, 240) as [number, number, number, number, number][]) {
        const ph = rp * Math.PI * 2;
        const x = wrap(rx + t * 0.004 * (rs - 0.5) + Math.sin(t * (0.3 + rs * 0.5) + ph) * 0.02) * width;
        const y = wrap(ry - t * (0.004 + rs * 0.01) + Math.cos(t * (0.25 + rz * 0.4) + ph) * 0.01) * height;
        const twinkle = 0.5 + 0.5 * Math.sin(t * (1.5 + rs * 2) + ph);
        shapes.push({ shape: "dot", x, y, r: 1.2 + rz * 3.2, color: 0xffe2af, alpha: 0.25 + twinkle * 0.55, glow: true });
      }
      return { shapes, blend: "add" };
    }
    case "embers": {
      for (const [rx, ry, rs, rz, rp] of seeds(`${seed}-embers`, 170) as [number, number, number, number, number][]) {
        const ph = rp * Math.PI * 2;
        const y = (1 - wrap(ry + (t * (60 + 120 * rs)) / height)) * height;
        // Sıcak hava türbülansı: iki frekanslı yana savrulma.
        const x = rx * width + Math.sin(t * 1.7 + ph) * 25 + Math.sin(t * 4.3 + ph * 2) * 8;
        // Alttayken sarı-beyaz, yükseldikçe kızıla döner ve söner.
        const heat = y / height;
        const color = heat > 0.66 ? 0xffd27a : heat > 0.33 ? 0xff9a3c : 0xff5a1e;
        const flicker = 0.6 + 0.4 * Math.sin(t * (6 + rs * 8) + ph);
        shapes.push({ shape: "dot", x, y, r: 1.5 + rz * 3, color, alpha: Math.min(1, heat / 0.6) * flicker, glow: true });
      }
      return { shapes, blend: "add" };
    }
    case "confetti": {
      for (const [rx, ry, rs, rz, rp, rc] of seeds(`${seed}-confetti`, 240) as [number, number, number, number, number, number][]) {
        const ph = rp * Math.PI * 2;
        const travel = height + 40;
        const y = wrap(ry + (t * (120 + 140 * rs)) / travel) * travel - 20;
        const x = wrap(rx + Math.sin(t * (0.8 + rs) + ph) * 0.02) * width;
        const color = CONFETTI_COLORS[Math.floor(rc * CONFETTI_COLORS.length)]!;
        // Kâğıt düşerken döner ve takla atar (dikey ölçek kosinüsle daralıp açılır).
        shapes.push({ shape: "chip", x, y, w: 16 + 10 * rz, h: 9 + 5 * rs, angle: ph + t * (2 + 4 * rs), flip: Math.cos(t * (5 + 6 * rz) + ph), color, alpha: 0.95 });
      }
      return { shapes, blend: "normal" };
    }
  }
}

/** Pixi Graphics'in kullanılan kısmı (testte sahte nesne). */
export interface Pen {
  clear(): Pen;
  moveTo(x: number, y: number): Pen;
  lineTo(x: number, y: number): Pen;
  circle(x: number, y: number, r: number): Pen;
  ellipse(x: number, y: number, rx: number, ry: number): Pen;
  poly(points: number[]): Pen;
  fill(style: { color: number; alpha: number }): Pen;
  stroke(style: { width: number; color: number; alpha: number; cap?: "round" }): Pen;
}

/** Karenin şekillerini çizer: yumuşak noktada önce geniş soluk hale, sonra çekirdek. */
export function drawShapes(pen: Pen, shapes: Shape[]): void {
  pen.clear();
  for (const s of shapes) {
    switch (s.shape) {
      case "streak":
        pen.moveTo(s.x, s.y).lineTo(s.x2, s.y2).stroke({ width: s.width, color: s.color, alpha: s.alpha, cap: "round" });
        break;
      case "dot":
        if (s.glow) pen.circle(s.x, s.y, s.r * 2.6).fill({ color: s.color, alpha: s.alpha * 0.18 });
        pen.circle(s.x, s.y, s.r).fill({ color: s.color, alpha: s.alpha });
        break;
      case "ring":
        pen.ellipse(s.x, s.y, s.rx, s.ry).stroke({ width: s.width, color: s.color, alpha: s.alpha });
        break;
      case "chip": {
        const c = Math.cos(s.angle);
        const n = Math.sin(s.angle);
        const hw = s.w / 2;
        const hh = (s.h / 2) * s.flip;
        const pts = [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ].flatMap(([px, py]) => [s.x + px! * c - py! * n, s.y + px! * n + py! * c]);
        pen.poly(pts).fill({ color: s.color, alpha: s.alpha });
        break;
      }
    }
  }
}
