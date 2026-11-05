import type { Texture } from "@ys/core";
import { luminance } from "./screen.ts";

/**
 * Kâğıt zemini (5 Kas, Yapay zekâ ajanları bölümü, suluboya paketi: incelemenin %31'i "sisli, soluk, robot neredeyse
 * görünmüyor, tezgâh soluk bir cam kutu"; öteki paketlerde %8). Paket tasarımcıdan saydam boya katmanları istiyor
 * (opaklık 0,5–0,7): bölümün kişilerinde dolgulu şekillerin %26–47'si, nesnelerinde %65–83'ü yarı saydamdı ve arkadaki
 * oda kişinin, masanın içinden görünüyordu. Kalite kapısı çizimi beyaz zeminde görüp onaylıyor (rasterizeSvg); sahnede
 * aynı boya odanın üstüne biniyordu. Gerçek suluboyada boya kâğıdın üstündedir: kişi ve nesnenin altına opak, kâğıt
 * renginde bir silüet konur; lekeler birbirinin üstünde saydam kalır, arkası görünmez. İskelette her parçanın silüeti
 * kendi grubunda (kol dönerken silüeti de döner).
 * - faint: bundan soluk şekil (hale, cam) silüete girmez.
 * - translucent: bundan saydam dolgu yarı saydam sayılır.
 * - share: dolgulu şekillerin en az bu payı yarı saydamsa çizim zemin alır (opak çizime gereksiz şekil eklenmez).
 * - shadow: bundan koyu yarı saydam şekil gölgedir (odayı karartır; altına kâğıt konursa açık bir leke olurdu).
 * - textures: zemin alan paketlerin dokusu (suluboya ve masal kitabı); kâğıdın rengi paletin en açık rengi.
 * Degrade dolgu (parıltı, gölge geçişi) da silüete girmez.
 */
export const PAPER = { faint: 0.3, translucent: 0.9, share: 0.1, shadow: 0.2, textures: ["watercolor"] as readonly Texture[] } as const;

const SKIP = /^(defs|clipPath|mask|pattern|symbol|marker|linearGradient|radialGradient|filter|metadata|title|desc|style|text|image|use|foreignObject|switch)$/i;
const SHAPE = /^(path|rect|circle|ellipse|polygon|polyline)$/i;
const GEOMETRY = ["d", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "points", "transform", "fill-rule", "clip-path", "clip-rule", "mask"];
const TAG = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
const PLAIN = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)$/i;

const attr = (raw: string, name: string) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(raw)?.[1];
const styled = (raw: string, name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(attr(raw, "style") ?? "")?.[1]?.trim();
const prop = (raw: string, name: string) => styled(raw, name) ?? attr(raw, name);
const share = (v: string | undefined) => {
  const n = v === undefined ? 1 : parseFloat(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
};
const copy = (raw: string, keys: readonly string[]) => keys.flatMap((k) => (attr(raw, k) === undefined ? [] : [` ${k}="${attr(raw, k)}"`])).join("");

/** Gruptan miras alınan boya: dolgu rengi, opaklık (çarpılır) ve dolgu saydamlığı. */
interface Paint {
  fill: string;
  opacity: number;
  fillOpacity: number;
}

const paintOf = (raw: string, top: Paint): Paint => ({
  fill: prop(raw, "fill") ?? top.fill,
  opacity: top.opacity * share(prop(raw, "opacity")),
  fillOpacity: prop(raw, "fill-opacity") === undefined ? top.fillOpacity : share(prop(raw, "fill-opacity")),
});

/**
 * from–to aralığının kâğıt silüeti ve dolgulu şekillerin saydamlık sayımı. Tanımlar ve yazılar atlanır; skip'teki
 * aralıklar (iç içe parçalar) silüete girmez. Silüette grupların yalnız dönüşümü, kırpması ve maskesi kalır.
 */
function walk(svg: string, from: number, to: number, paper: string, skip: readonly (readonly [number, number])[], inherited: Paint): { out: string; filled: number; translucent: number } {
  const stack: Paint[] = [inherited];
  let out = "";
  let filled = 0;
  let translucent = 0;
  let hide = 0;
  const tags = new RegExp(TAG.source, "g");
  tags.lastIndex = from;
  for (let m = tags.exec(svg); m && m.index < to; m = tags.exec(svg)) {
    const at = m.index;
    const span = skip.find(([a, b]) => at >= a && at < b);
    if (span) {
      tags.lastIndex = span[1];
      continue;
    }
    const [, close, name, raw, self] = m as unknown as [string, string, string, string, string];
    if (SKIP.test(name)) {
      if (close) hide = Math.max(0, hide - 1);
      else if (!self) hide++;
      continue;
    }
    if (hide) continue;
    if (close) {
      if (name === "g" && stack.length > 1) {
        stack.pop();
        out += "</g>";
      }
      continue;
    }
    const paint = paintOf(raw, stack.at(-1)!);
    if (name === "g") {
      if (!self) {
        stack.push(paint);
        out += `<g${copy(raw, ["transform", "clip-path", "mask"])}>`;
      }
      continue;
    }
    const { fill } = paint;
    if (!SHAPE.test(name) || fill === "none" || fill === "transparent" || prop(raw, "display") === "none" || prop(raw, "visibility") === "hidden") continue;
    const shown = paint.opacity * paint.fillOpacity;
    filled++;
    if (shown >= PAPER.translucent) {
      if (!PLAIN.test(fill)) continue;
    } else {
      translucent++;
      // Soluk şekil (hale, cam), koyu yarı saydam şekil (gölge) ve degrade (parıltı) silüete girmez.
      if (shown < PAPER.faint || !PLAIN.test(fill) || fill.toLowerCase() === "black" || luminance(fill) < PAPER.shadow) continue;
    }
    out += `<${name}${copy(raw, GEOMETRY)} fill="${paper}" stroke="none"/>`;
  }
  return { out, filled, translucent };
}

interface Span {
  /** Açılış etiketinin başı, içeriğin başı, kapanış etiketinin başı ve sonu. */
  open: number;
  inner: number;
  close: number;
  end: number;
  paint: Paint;
}

/** id'li grupların aralıkları ve içeriklerinin miras aldığı boya. */
function groups(svg: string, root: Paint): Map<string, Span> {
  const spans = new Map<string, Span>();
  const open: { at: number; inner: number; id: string | undefined; paint: Paint }[] = [];
  for (const m of svg.matchAll(/<(\/?)g\b([^>]*?)(\/?)>/g)) {
    if (m[1]) {
      const g = open.pop();
      if (g?.id) spans.set(g.id, { open: g.at, inner: g.inner, close: m.index, end: m.index + m[0].length, paint: g.paint });
    } else if (!m[3]) {
      open.push({ at: m.index, inner: m.index + m[0].length, id: attr(m[2]!, "id"), paint: paintOf(m[2]!, open.at(-1)?.paint ?? root) });
    }
  }
  return spans;
}

/** Kök etiketin boyası (SVG'nin varsayılanı siyah dolgu, tam opak). */
const rootPaint = (tag: string): Paint => paintOf(tag, { fill: "#000", opacity: 1, fillOpacity: 1 });

/** Çizimin dolgulu şekillerinden yarı saydam olanların payı (kişi ve nesnede kâğıt zemini gerekiyor mu). */
export function translucentShare(svg: string): number {
  const root = /<svg\b[^>]*>/.exec(svg);
  if (!root) return 0;
  const { filled, translucent } = walk(svg, root.index + root[0].length, svg.length, "#fff", [], rootPaint(root[0]));
  return filled ? translucent / filled : 0;
}

/**
 * Çizime kâğıt zemini: parts verilmezse (nesne) bütün içeriğin silüeti en başa; verilirse (iskelet) her parçanın kendi
 * içeriğinin (iç içe parçalar hariç) silüeti o parçanın başına; parçalara girmeyen içerik (yer gölgesi) silüetsiz.
 * Silüet grubu `data-paper` ile işaretli, kimliği yok; çizimin kendisi değişmez.
 */
export function withPaper(svg: string, paper: string, parts?: readonly string[]): string {
  const root = /<svg\b[^>]*>/.exec(svg);
  if (!root) return svg;
  const base = rootPaint(root[0]);
  const start = root.index + root[0].length;
  const wrap = (markup: string) => `<g data-paper="">${markup}</g>`;
  if (!parts) {
    const { out } = walk(svg, start, svg.length, paper, [], base);
    return out ? `${svg.slice(0, start)}${wrap(out)}${svg.slice(start)}` : svg;
  }
  const spans = groups(svg, base);
  const moving = parts.flatMap((p) => (spans.has(p) ? [spans.get(p)!] : []));
  // Sondan başa eklenir: önceki konumlar kaymaz.
  const inserts = moving
    .map((s) => {
      const nested = moving.filter((o) => o.open > s.open && o.end <= s.close).map((o) => [o.open, o.end] as const);
      return { at: s.inner, markup: walk(svg, s.inner, s.close, paper, nested, s.paint).out };
    })
    .filter((i) => i.markup)
    .sort((a, b) => b.at - a.at);
  let out = svg;
  for (const i of inserts) out = `${out.slice(0, i.at)}${wrap(i.markup)}${out.slice(i.at)}`;
  return out;
}

/** Paketin kâğıt rengi: zemin alan dokuda paletin en açık rengi; öteki paketlerde yok. */
export function paperOf(texture: Texture | undefined, palette: readonly string[]): string | undefined {
  if (!texture || !PAPER.textures.includes(texture)) return undefined;
  return [...palette].sort((a, b) => luminance(b) - luminance(a))[0] ?? "#fdf6ec";
}
