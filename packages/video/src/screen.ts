import { prefixSvgIds, type VectorAsset, type VectorScreen } from "@ys/core";
import type paper from "paper/dist/paper-core";
import { attrsOf, geometry, transformOf, type Bounds } from "./rigGeometry.ts";

/**
 * Ekranlı nesnede çekim başına ekran içeriği (4 Kas, inceleme: ekranlı nesne bulunan 131 çekimin 54'ünde ekranla ilgili not:
 * "ekran boş", "kod yok", "arama sayfası boş", "Gates'in yüzü dev ekranda değil"). Tasarımcı monitörü bir kez çizer; ekranı
 * düz renk (CRT, iMac, dev ekran) ya da sabit bir içerikle (kod çubukları, sohbet) kalıyordu, aynı monitör her çekimde başka
 * şey göstermeli. Yönetmen katmana `screen` verir; ekran çizimin içinden bulunur (screenOf) ve içerik onun üstüne kodla
 * çizilir (screenSvg), nesneyle birlikte döner, ölçeklenir, yürür.
 */

/** Ekran: viewBox koordinatında dikdörtgen; düz renkliyse rengi ve köşe yuvarlaması. */
export interface ScreenRect extends Bounds {
  fill?: string;
  rx: number;
}

/**
 * Ekran adayı: alanı sınır kutusunun en az rect'i olan (dikdörtgensi), çizimin en az area'sı kadar, eni boyunun aspect
 * aralığında, kendinden en az frame kat büyük ve önce çizilmiş bir şeklin (kasa, çerçeve) içinde duran en büyük şekil.
 * 70 ekranlı/tahtalı nesnenin 63'ünde ekranı buldu (monitör, CRT, dizüstü, televizyon, telefon, tahta).
 */
export const SCREEN = { rect: 0.85, area: 0.04, aspect: [0.4, 3.2], frame: 1.05 } as const;

const SKIP = /^(defs|clipPath|mask|pattern|symbol|marker|linearGradient|radialGradient|filter|metadata|title|desc|style)$/i;
const SHAPE = /^(path|rect|circle|ellipse|polyline|polygon)$/i;
const SCREEN_ID = /(^|[-_])screen($|[-_])/i;
const num = (v: string | undefined) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
};
const PLAIN = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i;

interface Shape extends Bounds {
  i: number;
  area: number;
  fill?: string;
  rx: number;
  named: boolean;
}

/** Çizimin ekranı (viewBox koordinatında): id'si "screen" olan öğe, yoksa çerçevesinin içindeki en büyük dikdörtgensi şekil. */
export function screenOf(svg: string): ScreenRect | undefined {
  const vb = (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? "").split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || !(vb[2]! > 0 && vb[3]! > 0)) return undefined;
  const g = geometry();
  const stack: { matrix: paper.Matrix; fill?: string; named: boolean }[] = [{ matrix: new g.Matrix(), named: false }];
  const shapes: Shape[] = [];
  let skip = 0;
  for (const [, close, name, raw, self] of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    if (SKIP.test(name!)) {
      if (close) skip = Math.max(0, skip - 1);
      else if (!self) skip++;
      continue;
    }
    if (skip) continue;
    if (close) {
      if (name === "g" || name === "svg") stack.length = Math.max(1, stack.length - 1);
      continue;
    }
    const a = attrsOf(raw!);
    const top = stack.at(-1)!;
    const fill = (a.fill ?? /(?:^|;)\s*fill\s*:\s*([^;]+)/.exec(a.style ?? "")?.[1])?.trim() ?? top.fill;
    const named = top.named || SCREEN_ID.test(a.id ?? "");
    if (name === "g" || name === "svg") {
      if (!self) stack.push({ matrix: name === "svg" ? top.matrix : top.matrix.appended(transformOf(a.transform)), fill, named });
      continue;
    }
    if (!SHAPE.test(name!)) continue;
    let item: paper.Path | paper.CompoundPath;
    try {
      const tag = name!.toLowerCase();
      if (tag === "path") item = new g.CompoundPath({ pathData: a.d ?? "", insert: false });
      else if (tag === "rect") item = new g.Path.Rectangle({ point: [num(a.x), num(a.y)], size: [num(a.width), num(a.height)], radius: num(a.rx), insert: false });
      else if (tag === "circle") item = new g.Path.Circle({ center: [num(a.cx), num(a.cy)], radius: num(a.r), insert: false });
      else if (tag === "ellipse") item = new g.Path.Ellipse({ center: [num(a.cx), num(a.cy)], radius: [num(a.rx), num(a.ry)], insert: false });
      else {
        const p = (a.points ?? "").match(/-?[\d.]+(?:e-?\d+)?/gi)?.map(Number) ?? [];
        item = new g.Path({ segments: Array.from({ length: Math.floor(p.length / 2) }, (_, k) => [p[2 * k]!, p[2 * k + 1]!]), closed: true, insert: false });
      }
      item.transform(top.matrix.appended(transformOf(a.transform)));
    } catch {
      continue;
    }
    const b = item.bounds;
    if (!(b.width > 0 && b.height > 0)) continue;
    shapes.push({ i: shapes.length, x: b.x, y: b.y, w: b.width, h: b.height, area: Math.abs(item.area), fill, rx: num(a.rx), named });
  }
  const plain = (s: Shape) => (s.fill && PLAIN.test(s.fill) ? { fill: s.fill } : {});
  // Tasarımcı ekranı adlandırdıysa o (grup ise şekillerinin birleşimi).
  const own = shapes.filter((s) => s.named);
  if (own.length) {
    const x = Math.min(...own.map((s) => s.x));
    const y = Math.min(...own.map((s) => s.y));
    return { x, y, w: Math.max(...own.map((s) => s.x + s.w)) - x, h: Math.max(...own.map((s) => s.y + s.h)) - y, rx: own[0]!.rx, ...plain(own[0]!) };
  }
  const total = vb[2]! * vb[3]!;
  const inside = (c: Shape, d: Shape) => c.x >= d.x - 0.5 && c.y >= d.y - 0.5 && c.x + c.w <= d.x + d.w + 0.5 && c.y + c.h <= d.y + d.h + 0.5;
  const best = shapes
    .filter((c) => {
      const box = c.w * c.h;
      const aspect = c.w / c.h;
      return c.area >= box * SCREEN.rect && box >= total * SCREEN.area && aspect >= SCREEN.aspect[0] && aspect <= SCREEN.aspect[1] && c.fill !== undefined && c.fill !== "none";
    })
    .filter((c) => shapes.some((d) => d.i < c.i && d.w * d.h >= c.w * c.h * SCREEN.frame && inside(c, d)))
    .sort((a, b) => b.w * b.h - a.w * a.h)[0];
  return best && { x: best.x, y: best.y, w: best.w, h: best.h, rx: best.rx, ...plain(best) };
}

const screens = new WeakMap<VectorAsset, ScreenRect | null>();

/** Varlığın ekranı (varlık başına bir kez ölçülür); bulunamazsa undefined. */
export function screenFor(asset: VectorAsset): ScreenRect | undefined {
  let s = screens.get(asset);
  if (s === undefined) screens.set(asset, (s = screenOf(asset.svg) ?? null));
  return s ?? undefined;
}

/** Ekranın katman kutusundaki yeri (px): çizim kutuya oranı korunarak ortalanır (render'ın "meet"i). */
export function screenBox(svg: string, screen: ScreenRect, w: number, h: number): Bounds & { k: number } {
  // Ekran bulunduysa viewBox vardır (screenOf onsuz bulmaz).
  const [vx, vy, vw, vh] = /viewBox="([^"]*)"/.exec(svg)![1]!.split(/[\s,]+/).map(Number) as [number, number, number, number];
  const k = Math.min(w / vw, h / vh);
  return { x: (w - vw * k) / 2 + (screen.x - vx) * k, y: (h - vh * k) / 2 + (screen.y - vy) * k, w: screen.w * k, h: screen.h * k, k };
}

/** Ekranda en çok bu kadar satır; daha uzunu kesilir. */
export const SCREEN_LINES = 6;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SANS = "Inter, 'Noto Sans', 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace";

/** Rengin parlaklığı (0–1); okunamayan renk açık sayılır. */
export function luminance(color: string): number {
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i.exec(color)?.[1];
  const rgb = hex
    ? (hex.length === 3 ? [...hex].map((c) => c + c) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]).map((c) => parseInt(c, 16))
    : (/rgba?\(([^)]*)\)/i.exec(color)?.[1]!.split(",").slice(0, 3).map((c) => parseFloat(c)) ?? [255, 255, 255]);
  return (0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!) / 255;
}

/** Uzun satırda yazı önce bu kata kadar küçülür, sonra kesilir. */
export const SCREEN_SHRINK = 0.55;

/** Satırların hepsinin sığdığı ortak yazı boyu: en çok size, en az size × SCREEN_SHRINK (karakter genişliği ~ boyun char katı). */
function shared(texts: string[], width: number, size: number, char: number): number {
  const longest = Math.max(1, ...texts.map((t) => t.length));
  return Math.max(size * SCREEN_SHRINK, Math.min(size, width / (longest * char)));
}

/** Satır genişliğe sığmıyorsa sonu "…" ile kesilir (karakter genişliği yaklaşık: yazı boyunun char katı). */
function fit(text: string, width: number, size: number, char: number): string {
  const max = Math.max(1, Math.floor(width / (size * char)));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Kod satırının renklendirilmesi: dize, sayı, yorum, anahtar sözcük. */
const KEYWORDS = new Set(
  "function return if else elif for while do var let const class def import from export new this print println echo public private static void int float double char string bool boolean true false null nil none end begin then goto gosub rem dim program procedure var record struct include using namespace try catch async await yield lambda fn match case switch break continue module require package interface type extends implements".split(" "),
);
const COLORS = { text: "#e6e6e6", keyword: "#c792ea", string: "#c3e88d", number: "#f78c6c", comment: "#7f848e", gutter: "#5c6370" };
function codeLine(line: string): string {
  const parts: string[] = [];
  for (const [t] of line.matchAll(/"[^"]*"?|'[^']*'?|\/\/.*$|#.*$|--.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|\s+|[^\sA-Za-z_\d"']+/g)) {
    const color = /^["']/.test(t)
      ? COLORS.string
      : /^(\/\/|#|--)/.test(t)
        ? COLORS.comment
        : /^\d/.test(t)
          ? COLORS.number
          : KEYWORDS.has(t.toLowerCase())
            ? COLORS.keyword
            : COLORS.text;
    parts.push(color === COLORS.text ? esc(t) : `<tspan fill="${color}">${esc(t)}</tspan>`);
  }
  return parts.join("");
}

/** Ekranda gösterilecek kişi: çizimi, iskelet tuvalindeki baş kutusu (faceFor). */
export interface ScreenPerson {
  svg: string;
  head: Bounds;
}

/**
 * Ekranın içeriği, ekranın kendi boyunda (w × h px) bir SVG: zemin, başlık ve satırlar türüne göre (kod koyu zeminde
 * renkli eş aralıklı, terminal yeşil, web sayfası tarayıcı çubuğuyla, arama kutusu ve sonuçlar, sohbet balonları, düz
 * yazı tahtanın ya da ekranın kendi renginde). Kişi verilirse başı ve omuzları ekranı doldurur, başlık alt bantta.
 */
export function screenSvg(screen: VectorScreen, w: number, h: number, o: { fill?: string | undefined; rx?: number; person?: ScreenPerson | undefined; prefix: string }): string {
  const lines = screen.lines.slice(0, SCREEN_LINES);
  const pad = Math.min(w, h) * 0.07;
  const rx = Math.min(o.rx ?? 0, Math.min(w, h) / 4);
  const out: string[] = [];
  const text = (x: number, y: number, size: number, body: string, attrs = "") =>
    out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size.toFixed(1)}"${attrs}>${body}</text>`);
  const kind = screen.kind;
  if (o.person) {
    // Baş ve omuzlar: baş kutusunun genişliğinin ~2,8 katı, baştan biraz yukarıdan (iskelet tuvali 400×800).
    const { head } = o.person;
    const cw = head.w * 2.8;
    const ch = (cw * h) / w;
    const inner = o.person.svg.replace(/^<svg\b([^>]*)>/i, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height|x|y|preserveAspectRatio)="[^"]*"/g, "")} x="0" y="0" width="400" height="800">`);
    out.push(`<rect width="${w}" height="${h}" fill="#24324a"/>`);
    out.push(`<svg width="${w}" height="${h}" viewBox="${(head.x + head.w / 2 - cw / 2).toFixed(1)} ${(head.y - head.h * 0.25).toFixed(1)} ${cw.toFixed(1)} ${ch.toFixed(1)}" preserveAspectRatio="xMidYMin slice">${prefixSvgIds(inner, `${o.prefix}p-`)}</svg>`);
    if (screen.title) {
      const size = shared([screen.title], w - 2 * pad, h * 0.09, 0.56);
      out.push(`<rect y="${(h * 0.8).toFixed(1)}" width="${w}" height="${(h * 0.14).toFixed(1)}" fill="#c62828" opacity="0.92"/>`);
      text(pad, h * 0.8 + h * 0.07 + size * 0.36, size, esc(fit(screen.title, w - 2 * pad, size, 0.56)), ` fill="#fff" font-weight="700" font-family="${SANS}"`);
    }
  } else if (kind === "code" || kind === "terminal") {
    const bg = kind === "code" ? "#1e2130" : "#0c0f0c";
    out.push(`<rect width="${w}" height="${h}" fill="${bg}"/>`);
    let top = pad;
    if (screen.title) {
      // Dosya sekmesi.
      const size = h * 0.075;
      out.push(`<rect width="${w}" height="${(size * 1.9).toFixed(1)}" fill="${kind === "code" ? "#2a2e3f" : "#1a1f1a"}"/>`);
      text(pad, size * 1.3, size, esc(fit(screen.title, w - 2 * pad, size, 0.6)), ` fill="#aab" font-family="${MONO}"`);
      top = size * 1.9 + pad * 0.7;
    }
    const pitch = Math.min((h - top - pad) / (Math.max(lines.length, 4) * 1.45), h * 0.1);
    const gutter = kind === "code" ? pitch * 2.2 : 0;
    const size = shared(lines, w - 2 * pad - gutter, pitch, 0.6);
    lines.forEach((line, k) => {
      const y = top + pitch * 1.45 * k + pitch;
      if (kind === "code") text(pad, y, size * 0.85, String(k + 1), ` fill="${COLORS.gutter}" font-family="${MONO}"`);
      const body = fit(line, w - 2 * pad - gutter, size, 0.6);
      text(pad + gutter, y, size, kind === "code" ? codeLine(body) : esc(body), ` fill="${kind === "code" ? COLORS.text : "#7cfc7c"}" font-family="${MONO}" xml:space="preserve"`);
    });
  } else if (kind === "chat") {
    out.push(`<rect width="${w}" height="${h}" fill="#eef1f5"/>`);
    let top = pad;
    if (screen.title) {
      const size = h * 0.08;
      out.push(`<rect width="${w}" height="${(size * 2).toFixed(1)}" fill="#3b5b8c"/>`);
      text(pad, size * 1.35, size, esc(fit(screen.title, w - 2 * pad, size, 0.56)), ` fill="#fff" font-weight="700" font-family="${SANS}"`);
      top = size * 2 + pad * 0.6;
    }
    const slot = (h - top - pad * 0.5) / Math.max(lines.length, 3);
    const size = shared(lines, w * 0.7, Math.min(slot * 0.42, h * 0.085), 0.55);
    lines.forEach((line, k) => {
      const right = k % 2 === 1;
      const body = fit(line, w * 0.7 - size, size, 0.55);
      const bw = Math.min(w * 0.72, body.length * size * 0.55 + size * 1.2);
      const x = right ? w - pad - bw : pad;
      const y = top + slot * k;
      out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(slot * 0.8).toFixed(1)}" rx="${(slot * 0.3).toFixed(1)}" fill="${right ? "#d6f5d1" : "#ffffff"}" stroke="#c9cfd8" stroke-width="${(size * 0.06).toFixed(2)}"/>`);
      text(x + size * 0.6, y + slot * 0.4 + size * 0.36, size, esc(body), ` fill="#1d1a24" font-family="${SANS}"`);
    });
  } else if (kind === "web" || kind === "search") {
    out.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`);
    // Tarayıcı çubuğu: üç nokta ve adres kutusu.
    const bar = h * 0.13;
    out.push(`<rect width="${w}" height="${bar.toFixed(1)}" fill="#e3e5ea"/>`);
    for (const [k, c] of ["#ff5f57", "#febc2e", "#28c840"].entries()) out.push(`<circle cx="${(bar * (0.5 + k * 0.45)).toFixed(1)}" cy="${(bar / 2).toFixed(1)}" r="${(bar * 0.15).toFixed(1)}" fill="${c}"/>`);
    out.push(`<rect x="${(bar * 1.8).toFixed(1)}" y="${(bar * 0.22).toFixed(1)}" width="${(w - bar * 2.2).toFixed(1)}" height="${(bar * 0.56).toFixed(1)}" rx="${(bar * 0.28).toFixed(1)}" fill="#ffffff"/>`);
    let top = bar + pad;
    if (kind === "search") {
      // Ortada arama kutusu (sorgu), altında sonuçlar.
      const size = h * 0.075;
      const bh = size * 2.1;
      out.push(`<rect x="${(w * 0.12).toFixed(1)}" y="${top.toFixed(1)}" width="${(w * 0.76).toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh / 2).toFixed(1)}" fill="#fff" stroke="#b9bec8" stroke-width="${(size * 0.12).toFixed(2)}"/>`);
      out.push(`<circle cx="${(w * 0.12 + bh * 0.5).toFixed(1)}" cy="${(top + bh * 0.47).toFixed(1)}" r="${(bh * 0.2).toFixed(1)}" fill="none" stroke="#7a808c" stroke-width="${(size * 0.14).toFixed(2)}"/>`);
      if (screen.title) text(w * 0.12 + bh, top + bh / 2 + size * 0.36, size, esc(fit(screen.title, w * 0.76 - bh * 1.3, size, 0.55)), ` fill="#1d1a24" font-family="${SANS}"`);
      top += bh + pad;
    } else if (screen.title) {
      const size = shared([screen.title], w - 2 * pad, h * 0.1, 0.58);
      text(pad, top + h * 0.085, size, esc(fit(screen.title, w - 2 * pad, size, 0.58)), ` fill="#1d1a24" font-weight="700" font-family="${SANS}"`);
      top += h * 0.15;
    }
    const pitch = Math.min((h - top - pad * 0.5) / (Math.max(lines.length, 3) * 1.5), h * 0.075);
    const size = shared(lines, w - 2 * pad, pitch, 0.55);
    lines.forEach((line, k) =>
      text(pad, top + pitch * 1.5 * k + pitch, size, esc(fit(line, w - 2 * pad, size, 0.55)), ` fill="${kind === "search" ? "#1a0dab" : "#3d4250"}" font-family="${SANS}"`),
    );
  } else {
    // Düz yazı: ekranın (tahtanın) kendi renginde; koyu zeminde açık, açık zeminde koyu mürekkep.
    const bg = o.fill ?? "#f5f3ee";
    const ink = luminance(bg) < 0.5 ? "#f5f3ee" : "#1d1a24";
    out.push(`<rect width="${w}" height="${h}" fill="${esc(bg)}"/>`);
    const rows = lines.length + (screen.title ? 1.6 : 0);
    const pitch = Math.min((h - 2 * pad) / (Math.max(rows, 2.5) * 1.3), h * 0.16);
    let y = pad + pitch;
    if (screen.title) {
      const big = shared([screen.title], w - 2 * pad, pitch * 1.35, 0.58);
      text(w / 2, y + pitch * 0.27, big, esc(fit(screen.title, w - 2 * pad, big, 0.58)), ` fill="${ink}" font-weight="800" text-anchor="middle" font-family="${SANS}"`);
      y += pitch * 1.95;
    }
    const size = shared(lines, w - 2 * pad, pitch, 0.55);
    lines.forEach((line, k) => text(w / 2, y + pitch * 1.3 * k, size, esc(fit(line, w - 2 * pad, size, 0.55)), ` fill="${ink}" text-anchor="middle" font-family="${SANS}"`));
  }
  // Cam: sol üstten hafif parlama; köşeler ekranın kendi yuvarlamasıyla kırpılır.
  const defs = `<defs><linearGradient id="${o.prefix}glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.14"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="${o.prefix}clip"><rect width="${w}" height="${h}" rx="${rx.toFixed(1)}"/></clipPath></defs>`;
  out.push(`<rect width="${w}" height="${h}" fill="url(#${o.prefix}glare)"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">${defs}<g clip-path="url(#${o.prefix}clip)">${out.join("")}</g></svg>`;
}
