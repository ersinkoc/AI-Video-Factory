import type { VectorLayer, VectorSay } from "@ys/core";
import { overlap, type Box } from "./callout.ts";

/**
 * Konuşma ve düşünce balonları (5 Kas, inceleme: 2481 çekimin 51'inde balon notu; Yapay zeka ajanları bölümünde 13 not,
 * "konuşma balonu boş", "Air Canada'nın savunması görünmüyor"). Yönetmen konuşmayı göstermek için Commons'tan boş bir
 * balon simgesi istiyordu ve çizimin içine söz yazacak hiçbir şey yoktu. Artık sözü konuşan karaktere verir
 * (`VectorLayer.say`); kod balonu başın yanına çizer: kuyruğu ağza doğru, yazı karede okunur boyda, yüzleri, yazıları ve
 * altyazı bandını örtmeyen yanda. Saf fonksiyonlar: render, ses efektleri ve inceleme karesinin anı aynı pencereyi görür.
 */
export const BUBBLE = {
  /** Yazı boyu (tuval px, 1080p) ve satır sığmazsa inebileceği en küçük boy. */
  size: 36,
  min: 28,
  /** Ortalama harf genişliği (boyun katı) ve satırın en geniş yeri (px). */
  char: 0.56,
  width: 540,
  /** En çok satır; satır aralığı (boyun katı). */
  rows: 3,
  pitch: 1.22,
  /** İç boşluk (boyun katı: yatay, dikey); düşünce bulutu metni elips içinde taşısın diye bu kat büyür. */
  pad: [0.8, 0.55],
  cloud: 1.25,
  /** Balonla konuşanın yüz kutusu arası; kare kenarından pay (px). */
  gap: 26,
  margin: 24,
  /** Kuyruk tabanının yarı genişliği (kısa kenarın katı, en çok px); ucun yüze uzaklığı (px). */
  base: 0.22,
  baseMax: 22,
  stop: 10,
  /** Kuyruk bundan kısa (balon yüze değiyor) ya da uzunsa (kenara itildi) çizilmez (px). */
  tailMin: 8,
  tailMax: 420,
  /** Açılış (yaylanarak) ve kapanış süresi; en kısa görünme (sn). */
  pop: 0.28,
  out: 0.2,
  minSec: 1.5,
  stroke: 3,
  fill: "#ffffff",
  ink: "#1d1a24",
} as const;

/** Balonun kişinin yüzüne göre yeri: başın üstünde sağda/solda ya da yanında. */
export type BubbleSide = "above-right" | "above-left" | "right" | "left";
const SIDES: BubbleSide[] = ["above-right", "above-left", "right", "left"];

/** Balonun durabileceği alan (tuval px): dikey videoda görünen bant; üstte yazı sınırı, altta altyazı bandı. */
export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const FONT = "Inter, 'Noto Sans', 'Segoe UI', sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** Sözün satırları (sözcük sınırından; satıra sığmayan tek sözcük "…" ile kesilir). */
export function sayRows(text: string, size: number): string[] {
  const cap = Math.max(2, Math.floor(BUBBLE.width / (size * BUBBLE.char) + 1e-6));
  const rows: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = rows.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= cap) rows[rows.length - 1] = `${last} ${word}`;
    else rows.push(word.length > cap ? `${word.slice(0, cap - 1)}…` : word);
  }
  return rows;
}

/** Sözün yerleşimi: BUBBLE.rows satıra sığana kadar küçülür (en çok min'e); yine sığmazsa son satır "…" ile biter. */
export function sayText(text: string): { size: number; rows: string[] } {
  let size: number = BUBBLE.size;
  let rows = sayRows(text, size);
  while (rows.length > BUBBLE.rows && size > BUBBLE.min) {
    size = Math.max(BUBBLE.min, size - 2);
    rows = sayRows(text, size);
  }
  if (rows.length > BUBBLE.rows) {
    const cap = Math.floor(BUBBLE.width / (size * BUBBLE.char) + 1e-6);
    rows = rows.slice(0, BUBBLE.rows);
    rows[BUBBLE.rows - 1] = `${rows[BUBBLE.rows - 1]!.slice(0, cap - 1).trimEnd()}…`;
  }
  return { size, rows };
}

/** Balonun ölçüsü (tuval px) ve yazısı; boş sözde balon yok (undefined). */
export function bubbleSize(say: Pick<VectorSay, "text" | "kind">): { w: number; h: number; size: number; rows: string[] } | undefined {
  const { size, rows } = sayText(say.text);
  if (!rows.length) return undefined;
  const k = say.kind === "thought" ? BUBBLE.cloud : 1;
  const tw = Math.max(...rows.map((r) => r.length)) * size * BUBBLE.char;
  const th = (rows.length * BUBBLE.pitch - (BUBBLE.pitch - 1)) * size;
  return { w: (tw + 2 * BUBBLE.pad[0] * size) * k, h: (th + 2 * BUBBLE.pad[1] * size) * k, size, rows };
}

/** Yanın balon kutusu (kenarlara sığdırılmış) ve sığdırmanın kaydırdığı yol. */
function placeAt(side: BubbleSide, face: Box, w: number, h: number, b: Bounds): { box: Box; drift: number } {
  const { gap, margin } = BUBBLE;
  const x = side === "right" ? face.x + face.w + gap : side === "left" ? face.x - gap - w : side === "above-right" ? face.x + face.w * 0.55 : face.x + face.w * 0.45 - w;
  // Yanda: balonun altı göz hizasında (yüzün %30'u); üstte: başın gap kadar üstünde.
  const y = side === "right" || side === "left" ? face.y + face.h * 0.3 - h : face.y - gap - h;
  const box = { x: clamp(x, b.left + margin, b.right - margin - w), y: clamp(y, b.top + margin, b.bottom - h), w, h };
  return { box, drift: Math.hypot(box.x - x, box.y - y) };
}

/** Balonun kutusu: yanın yerinde, kare sınırlarının içinde. */
export function bubbleAt(side: BubbleSide, face: Box, w: number, h: number, b: Bounds): Box {
  return placeAt(side, face, w, h, b).box;
}

/**
 * Balonun yanı: konuşanın yüzünü, öteki yüzleri, yazıları ve öteki kişilerin üst gövdesini (işaret eden kol) en az
 * örten; eşitlikte kenara en az itilen, sonra karenin ortasına bakan (kişi soldaysa balon sağında), sonra başın
 * üstündeki. Paylar örtülen şeyin alanına göre.
 */
export function bubbleSide(face: Box, w: number, h: number, avoid: { faces: Box[]; texts: Box[]; bodies?: Box[] }, b: Bounds): BubbleSide {
  const share = (box: Box, o: Box) => overlap(box, o) / Math.max(1, o.w * o.h);
  const inward: BubbleSide[] = face.x + face.w / 2 < (b.left + b.right) / 2 ? ["above-right", "right"] : ["above-left", "left"];
  const cost = (side: BubbleSide) => {
    const { box, drift } = placeAt(side, face, w, h, b);
    const covered =
      8 * share(box, face) +
      avoid.faces.reduce((n, f) => n + 4 * share(box, f), 0) +
      avoid.texts.reduce((n, t) => n + 2 * share(box, t), 0) +
      (avoid.bodies ?? []).reduce((n, o) => n + share(box, o), 0);
    return Math.round(covered * 100) / 100 + drift / 2000 + (inward.includes(side) ? 0 : 0.03) + (side.startsWith("above") ? 0 : 0.01);
  };
  return SIDES.map((side) => ({ side, cost: cost(side) })).sort((a, b2) => a.cost - b2.cost)[0]!.side;
}

/** a→b doğru parçasının kutuya girdiği yerin kesri (0: a içeride); b kutunun içindedir (ağız yüzün içinde). */
function entry([x0, y0]: readonly [number, number], [x1, y1]: readonly [number, number], f: Box): number {
  let t0 = 0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const [p, q] of [
    [-dx, x0 - f.x],
    [dx, f.x + f.w - x0],
    [-dy, y0 - f.y],
    [dy, f.y + f.h - y0],
  ] as const) {
    if (p < 0) t0 = Math.max(t0, q / p);
  }
  return t0;
}

/** Kuyruk: tabanın iki ucu (balon kenarının düz yerinde, kenarın biraz içinde) ve ucu (ağzın önünde, yüze değmeden). */
export interface Tail {
  base: [[number, number], [number, number]];
  tip: [number, number];
}

/**
 * Kuyruğun yeri: balonun ortasından ağza (yüz kutusunun %72'si) giden çizginin yüze BUBBLE.stop px kala bittiği yer uç;
 * çizginin balondan çıktığı kenar taban (köşenin yuvarlağına taşmasın diye kenarın düz yerine kayar). Balon yüze
 * değiyorsa ya da kuyruk çok uzun kalıyorsa (balon kenara itildi) kuyruk yok.
 */
export function bubbleTail(box: Box, face: Box): Tail | undefined {
  const c = [box.x + box.w / 2, box.y + box.h / 2] as const;
  const mouth = [face.x + face.w / 2, face.y + face.h * 0.72] as const;
  const { stop, stroke } = BUBBLE;
  const t = entry(c, mouth, { x: face.x - stop, y: face.y - stop, w: face.w + 2 * stop, h: face.h + 2 * stop });
  // Balonun ortası yüzün üstünde: kuyruk nereye uzansa yüzün içinden geçer.
  if (t <= 0) return undefined;
  const tip: [number, number] = [c[0] + (mouth[0] - c[0]) * t, c[1] + (mouth[1] - c[1]) * t];
  const dx = tip[0] - c[0];
  const dy = tip[1] - c[1];
  // Çizginin çıktığı kenar: yanlardan mı, alttan/üstten mi.
  const sx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const half = Math.min(BUBBLE.baseMax, BUBBLE.base * Math.min(box.w, box.h));
  const r = radiusOf(box);
  const inset = stroke * 2.5;
  let base: Tail["base"];
  let edge: [number, number];
  if (sx < sy) {
    const x = dx > 0 ? box.x + box.w - inset : box.x + inset;
    const y = clampEdge(c[1] + dy * sx, box.y + r + half, box.y + box.h - r - half, box.y + box.h / 2);
    edge = [dx > 0 ? box.x + box.w : box.x, y];
    base = [
      [x, y - half],
      [x, y + half],
    ];
  } else {
    const y = dy > 0 ? box.y + box.h - inset : box.y + inset;
    const x = clampEdge(c[0] + dx * sy, box.x + r + half, box.x + box.w - r - half, box.x + box.w / 2);
    edge = [x, dy > 0 ? box.y + box.h : box.y];
    base = [
      [x - half, y],
      [x + half, y],
    ];
  }
  const length = Math.hypot(tip[0] - edge[0], tip[1] - edge[1]);
  return length < BUBBLE.tailMin || length > BUBBLE.tailMax ? undefined : { base, tip };
}

/** Kenar boyunca sınırla (düz yer boşsa kenarın ortası). */
const clampEdge = (v: number, lo: number, hi: number, mid: number) => (lo > hi ? mid : clamp(v, lo, hi));

/** Konuşma balonunun köşe yuvarlağı. */
const radiusOf = (box: Box) => Math.min(box.h / 2, box.w / 2, 34);

/** Balonun görünme penceresi (çekimin kesri): konuşan sahneye girdikten sonra açılır, en az BUBBLE.minSec görünür. */
export function sayWindow(layer: Pick<VectorLayer, "say" | "anims">, dur: number): { start: number; end: number } | undefined {
  if (!layer.say) return undefined;
  const entered = layer.anims.reduce((end, a) => (ENTERS.has(a.type) ? Math.max(end, a.end) : end), 0);
  const start = Math.max(layer.say.start, entered);
  if (start >= 1) return undefined;
  return { start, end: Math.min(1, Math.max(layer.say.end, start + BUBBLE.minSec / Math.max(dur, 1e-3))) };
}
const ENTERS = new Set<string>(["fade_in", "slide_in", "pop", "draw_on"]);

/** Karedeki balon: kutusu, kuyruğu, yazısı; q açılışın ilerlemesi (0–1), fade kapanışın (1 → 0). */
export interface BubbleView {
  box: Box;
  tail?: Tail | undefined;
  rows: string[];
  size: number;
  kind: VectorSay["kind"];
  q: number;
  fade: number;
}

/** Balonun bu andaki açılışı ve kapanışı (t: sn); pencerenin dışında undefined. */
export function bubbleTiming(win: { start: number; end: number }, t: number, dur: number): { q: number; fade: number } | undefined {
  const from = win.start * dur;
  const to = win.end * dur;
  if (t < from || t > to) return undefined;
  return { q: Math.min(1, (t - from) / BUBBLE.pop), fade: Math.min(1, (to - t) / BUBBLE.out) };
}

/** Yaylanarak açılma (biraz taşar, yerine oturur). */
function backOut(q: number): number {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (q - 1) ** 3 + c1 * (q - 1) ** 2;
}

const pt = ([x, y]: readonly [number, number]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/** Düşünce bulutu: kutunun elipsinde dışa doğru tümsekler. */
function cloudPath(box: Box, size: number): string {
  const bump = size * 0.42;
  const a = box.w / 2 - bump * 0.6;
  const b = box.h / 2 - bump * 0.6;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const n = Math.max(8, Math.round((Math.PI * (a + b)) / (size * 1.5)));
  const at = (k: number) => [cx + a * Math.cos((2 * Math.PI * k) / n), cy + b * Math.sin((2 * Math.PI * k) / n)] as const;
  let d = `M ${pt(at(0))}`;
  for (let k = 0; k < n; k++) {
    const [p, q] = [at(k), at(k + 1)];
    d += ` A ${(Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.62).toFixed(1)} ${(Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.62).toFixed(1)} 0 0 1 ${pt(q)}`;
  }
  return `${d} Z`;
}

/**
 * Balonun SVG'si (tuval koordinatında, tam kare bir <svg> içine): önce kuyruk (dolgu + kontur), sonra gövde, sonra
 * kuyruğun konturu olmayan dolgusu (gövdenin konturunu kuyruğun dibinde örter), en üstte yazı. Düşünce bulutunda kuyruk
 * yerine ağza doğru küçülen üç daire. Açılırken kuyruğun ucundan yaylanarak büyür.
 */
export function bubbleSvg(v: BubbleView): string {
  const { box, tail, rows, size, kind } = v;
  const { stroke, fill, ink } = BUBBLE;
  const line = `fill="${fill}" stroke="${ink}" stroke-width="${stroke}" stroke-linejoin="round"`;
  const parts: string[] = [];
  const tip = tail?.tip ?? [box.x + box.w / 2, box.y + box.h];
  if (kind === "thought") {
    parts.push(`<path d="${cloudPath(box, size)}" ${line}/>`);
    if (tail) {
      const mid: [number, number] = [(tail.base[0][0] + tail.base[1][0]) / 2, (tail.base[0][1] + tail.base[1][1]) / 2];
      const k = size / BUBBLE.size;
      for (const [f, r] of [
        [0.3, 11],
        [0.62, 7.5],
        [0.9, 4.5],
      ] as const) {
        parts.push(`<circle cx="${(mid[0] + (tail.tip[0] - mid[0]) * f).toFixed(1)}" cy="${(mid[1] + (tail.tip[1] - mid[1]) * f).toFixed(1)}" r="${(r * k).toFixed(1)}" ${line}/>`);
      }
    }
  } else {
    const tri = (s: number) => {
      // s: tabanın ortasına doğru daralma (konturu olmayan iç dolgu kuyruğun kendi kenar çizgisini örtmesin).
      const mid: [number, number] = [(tail!.base[0][0] + tail!.base[1][0]) / 2, (tail!.base[0][1] + tail!.base[1][1]) / 2];
      const toward = (p: readonly [number, number], k: number) => [p[0] + (mid[0] - p[0]) * k, p[1] + (mid[1] - p[1]) * k] as const;
      return `M ${pt(toward(tail!.base[0], s))} L ${pt(toward(tail!.tip, s * 0.4))} L ${pt(toward(tail!.base[1], s))} Z`;
    };
    if (tail) parts.push(`<path d="${tri(0)}" ${line}/>`);
    parts.push(`<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" rx="${radiusOf(box).toFixed(1)}" ${line}/>`);
    if (tail) parts.push(`<path d="${tri(0.18)}" fill="${fill}"/>`);
  }
  const top = box.y + box.h / 2 - ((rows.length * BUBBLE.pitch - (BUBBLE.pitch - 1)) * size) / 2;
  rows.forEach((row, k) =>
    parts.push(
      `<text x="${(box.x + box.w / 2).toFixed(1)}" y="${(top + size * 0.8 + k * BUBBLE.pitch * size).toFixed(1)}" font-size="${size.toFixed(1)}" font-family="${FONT}" font-weight="600" fill="${ink}" text-anchor="middle">${esc(row)}</text>`,
    ),
  );
  const s = 0.4 + 0.6 * backOut(v.q);
  const opacity = Math.min(1, v.q * 3) * v.fade;
  return `<g data-bubble opacity="${opacity.toFixed(3)}" transform="translate(${pt(tip)}) scale(${s.toFixed(4)}) translate(${(-tip[0]).toFixed(1)} ${(-tip[1]).toFixed(1)})" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.25))">${parts.join("")}</g>`;
}
