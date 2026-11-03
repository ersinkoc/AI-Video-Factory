import paper from "paper/dist/paper-core";
import { attrsOf, shapeBounds, transformOf, unionBounds, type Bounds } from "./rigGeometry.ts";

/**
 * Kaşların ayrılması (3 Kas, kare denetçisi: 955 çekimin onlarcasında "yüz endişeli görünmüyor", "kızgın değil, sakin",
 * "nötr, hafif gülümsüyor"): kaşlar tek grup ("brows") olarak yalnız aşağı yukarı kayabiliyordu; endişe, öfke ve
 * şüphe ise kaşın eğiminden okunur (iç uçlar kalkar / iner ve çatılır, tek kaş kalkar). Çizimin kendi kaşları sol ve
 * sağ diye iki gruba ayrılır ("brow-l" ekranın solundaki, "brow-r" sağdaki), her biri kendi ortasında döner; çizim,
 * renk ve kalınlık aynı kalır. Kütüphanedeki 149 karakterin 82'sinde kaşlar iki ayrı şekil, 64'ünde iki alt yollu tek
 * yol: alt yollar ayrı yollara bölünür. Ayrılamayan (tek kaşlı yan çizim, boş grup) kaş eskisi gibi bütün kayar.
 */

export const BROWS = ["brow-l", "brow-r"] as const;
export type BrowPart = (typeof BROWS)[number];

export interface SplitBrows {
  svg: string;
  /** Her kaşın ortası (kaş grubunun koordinatında, SVG birimi): dönme noktası. */
  centres: Record<BrowPart, [number, number]>;
}

const SHAPE = /^(path|rect|circle|ellipse|line|polyline|polygon)$/i;
const TAG = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;

let scope: paper.PaperScope | undefined;
function geometry(): paper.PaperScope {
  if (!scope) {
    scope = new paper.PaperScope();
    scope.setup(new scope.Size(1, 1));
  }
  return scope;
}

/** Bir parçanın (şekil ya da grup) sınırları: içindeki şekillerin birleşimi, dönüşümleriyle; çizim yoksa undefined. */
function measure(fragment: string): Bounds | undefined {
  const g = geometry();
  const stack = [new g.Matrix()];
  let out: Bounds | undefined;
  for (const [, close, name, raw, self] of fragment.matchAll(TAG)) {
    if (close) {
      if (name === "g") stack.pop();
      continue;
    }
    const a = attrsOf(raw!);
    const top = stack.at(-1)!;
    if (name === "g") {
      if (!self) stack.push(top.appended(transformOf(a.transform)));
      continue;
    }
    if (!SHAPE.test(name!)) continue;
    const b = shapeBounds(name!, a, top);
    if (b) out = unionBounds(out, b);
  }
  return out;
}

/** Konumdan başlayan öğenin bittiği yer (kendini kapatan etikette etiketin sonu); kapanmamışsa undefined. */
function endOf(svg: string, start: number): number | undefined {
  let depth = 0;
  for (const m of svg.slice(start).matchAll(TAG)) {
    if (m[1]) depth--;
    else if (!m[4]) depth++;
    if (depth === 0) return start + m.index + m[0].length;
  }
  return undefined;
}

/** Alt yolları ayrı yollara böler (aynı öznitelikler; kimlik iki kez geçmesin diye düşer); tek alt yolluysa olduğu gibi. */
function subpaths(element: string, a: Record<string, string>): string[] {
  const g = geometry();
  let item: paper.CompoundPath;
  try {
    item = new g.CompoundPath({ pathData: a.d ?? "", insert: false });
  } catch {
    return [element];
  }
  const parts = item.children.filter((c) => (c as paper.Path).segments.length > 0) as paper.Path[];
  if (parts.length < 2) return [element];
  const bare = element.replace(/\sid\s*=\s*(?:"[^"]*"|'[^']*')/, "");
  return parts.map((p) => bare.replace(/\sd\s*=\s*(?:"[^"]*"|'[^']*')/, () => ` d="${p.pathData}"`));
}

const centre = (b: Bounds): [number, number] => [Math.round((b.x + b.w / 2) * 100) / 100, Math.round((b.y + b.h / 2) * 100) / 100];

/**
 * Çizimin "brows" grubunu sol ve sağ kaş gruplarına ayırır (önek eklenmeden önceki SVG). Grubun doğrudan çocukları
 * (ya da tek yolun alt yolları) ortalarına göre ikiye bölünür: kaşların toplam kutusunun ortasının solundaki "brow-l",
 * sağındaki "brow-r". Grup yoksa, bir yanı boş kalıyorsa ya da ölçülemiyorsa undefined.
 */
export function splitBrows(svg: string): SplitBrows | undefined {
  const at = svg.search(/\sid\s*=\s*"brows"/);
  if (at < 0) return undefined;
  const start = svg.lastIndexOf("<", at);
  const open = /^<g\b[^>]*>/.exec(svg.slice(start));
  const end = endOf(svg, start);
  if (!open || end === undefined || open[0].endsWith("/>")) return undefined;
  const close = svg.lastIndexOf("</", end - 1);
  const inner = svg.slice(start + open[0].length, close);
  // Doğrudan çocuklar: çizim (şekil ya da grup) kaş parçasıdır, ötekiler (başlık, açıklama) yerinde kalır.
  const units: string[] = [];
  const rest: string[] = [];
  let depth = 0;
  let from = 0;
  const child = (stop: number) => {
    const element = inner.slice(from, stop);
    const name = /^<([\w:-]+)/.exec(element)![1]!;
    (name === "g" || SHAPE.test(name) ? units : rest).push(element);
  };
  for (const m of inner.matchAll(TAG)) {
    if (m[1]) {
      if (--depth === 0) child(m.index + m[0].length);
      continue;
    }
    if (depth === 0) from = m.index;
    if (!m[4]) depth++;
    else if (depth === 0) child(m.index + m[0].length);
  }
  // Tek yol iki kaşı alt yol olarak taşıyabilir.
  const pieces = units.length === 1 && /^<path\b/i.test(units[0]!) ? subpaths(units[0]!, attrsOf(/^<path([^>]*)/i.exec(units[0]!)![1]!)) : units;
  const measured = pieces.map((p) => ({ p, b: measure(p) }));
  if (measured.length < 2 || measured.some((m) => !m.b)) return undefined;
  const all = measured.reduce<Bounds | undefined>((u, m) => unionBounds(u, m.b!), undefined)!;
  const mid = all.x + all.w / 2;
  const left = measured.filter((m) => m.b!.x + m.b!.w / 2 < mid);
  const right = measured.filter((m) => m.b!.x + m.b!.w / 2 >= mid);
  if (!left.length) return undefined;
  const side = (list: typeof measured) => ({
    markup: list.map((m) => m.p).join(""),
    centre: centre(list.reduce<Bounds | undefined>((u, m) => unionBounds(u, m.b!), undefined)!),
  });
  const l = side(left);
  const r = side(right);
  const body = `${rest.join("")}<g id="brow-l">${l.markup}</g><g id="brow-r">${r.markup}</g>`;
  return { svg: `${svg.slice(0, start)}${open[0]}${body}</g>${svg.slice(end)}`, centres: { "brow-l": l.centre, "brow-r": r.centre } };
}
