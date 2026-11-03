import paper from "paper/dist/paper-core";

/**
 * Çizimin gerçek yüz geometrisi (3 Kas): iskelet dönme noktaları sabit ama tasarımcılar başı farklı yüksekliğe, ağzı
 * farklı yere çiziyor (uzun boyunlu çizimde çene varsayılandan ~40 px yukarıdaydı; el çeneye ulaşmıyordu). "head",
 * "mouth" ve "eyes" gruplarının sınırları SVG'den ölçülür (grup dönüşümleri dahil; DOM gerekmez, render ve test aynı).
 * Koordinatlar viewBox'tan iskelet tuvaline (400×800) çevrilir.
 */

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Face {
  head?: Bounds;
  mouth?: Bounds;
  eyes?: Bounds;
  /** Çene (elin değeceği yer): ağız ve gözlerden, yoksa başın altından; ikisi de yoksa undefined. */
  chin?: [number, number];
}

const PARTS = new Set(["head", "mouth", "eyes"]);
const SKIP = /^(defs|clipPath|mask|pattern|symbol|marker|linearGradient|radialGradient|filter|metadata|title|desc|style)$/i;
const SHAPE = /^(path|rect|circle|ellipse|line|polyline|polygon)$/i;

let scope: paper.PaperScope | undefined;
function geometry(): paper.PaperScope {
  if (!scope) {
    scope = new paper.PaperScope();
    scope.setup(new scope.Size(1, 1));
  }
  return scope;
}

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]!] = m[2] ?? m[3]!;
  return out;
}

const nums = (v = "") => (v.match(/-?[\d.]+(?:e-?\d+)?/gi) ?? []).map(Number);
const num = (v: string | undefined, d = 0) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : d;
};

/** SVG transform özniteliği → paper matrisi (translate, scale, rotate, matrix, skew yok sayılır). */
export function transformOf(value: string | undefined): paper.Matrix {
  const g = geometry();
  const m = new g.Matrix();
  for (const [, fn, args] of (value ?? "").matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = nums(args);
    if (fn === "translate") m.translate(a[0] ?? 0, a[1] ?? 0);
    else if (fn === "scale") m.scale(a[0] ?? 1, a[1] ?? a[0] ?? 1);
    else if (fn === "rotate") m.rotate(a[0] ?? 0, new g.Point(a[1] ?? 0, a[2] ?? 0));
    else if (fn === "matrix" && a.length === 6) m.append(new g.Matrix(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!));
  }
  return m;
}

/** Şeklin kendi koordinatındaki sınırları (paper ile); ölçülemezse undefined. */
function shapeBounds(tag: string, a: Record<string, string>, matrix: paper.Matrix): Bounds | undefined {
  const g = geometry();
  let item: paper.Item;
  try {
    switch (tag.toLowerCase()) {
      case "path":
        item = new g.CompoundPath({ pathData: a.d ?? "", insert: false });
        break;
      case "rect":
        item = new g.Path.Rectangle({ point: [num(a.x), num(a.y)], size: [num(a.width), num(a.height)], insert: false });
        break;
      case "circle":
        item = new g.Path.Circle({ center: [num(a.cx), num(a.cy)], radius: num(a.r), insert: false });
        break;
      case "ellipse":
        item = new g.Path.Ellipse({ center: [num(a.cx), num(a.cy)], radius: [num(a.rx), num(a.ry)], insert: false });
        break;
      case "line":
        item = new g.Path({ segments: [[num(a.x1), num(a.y1)], [num(a.x2), num(a.y2)]], insert: false });
        break;
      default: {
        const p = nums(a.points);
        item = new g.Path({ segments: Array.from({ length: Math.floor(p.length / 2) }, (_, i) => [p[2 * i]!, p[2 * i + 1]!]), insert: false });
      }
    }
    item.transform(matrix.appended(transformOf(a.transform)));
  } catch {
    return undefined;
  }
  const b = item.bounds;
  return [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width + b.height > 0 ? { x: b.x, y: b.y, w: b.width, h: b.height } : undefined;
}

const union = (a: Bounds | undefined, b: Bounds): Bounds => {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** Çizimin baş, ağız ve göz grupları ile çenesi (iskelet tuvali koordinatında). */
export function faceOf(svg: string, rig: { width: number; height: number } = { width: 400, height: 800 }): Face {
  const g = geometry();
  const box = nums(/viewBox\s*=\s*"([^"]*)"/.exec(svg)?.[1]);
  const [vx, vy, vw, vh] = box.length === 4 ? box : [0, 0, rig.width, rig.height];
  // viewBox → iskelet tuvali ("meet": oran korunur, ortalanır).
  const k = Math.min(rig.width / vw!, rig.height / vh!);
  const root = new g.Matrix().translate((rig.width - vw! * k) / 2, (rig.height - vh! * k) / 2).scale(k).translate(-vx!, -vy!);
  const stack: { matrix: paper.Matrix; part?: string; group: boolean }[] = [{ matrix: root, group: true }];
  const found: Partial<Record<"head" | "mouth" | "eyes", Bounds>> = {};
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
    if (name === "g" || name === "svg") {
      if (self) continue;
      const id = a.id && PARTS.has(a.id) ? a.id : top.part;
      stack.push({ matrix: name === "svg" ? top.matrix : top.matrix.appended(transformOf(a.transform)), part: id, group: true });
      continue;
    }
    if (!SHAPE.test(name!)) continue;
    const own = a.id && PARTS.has(a.id) ? a.id : top.part;
    if (!own) continue;
    const b = shapeBounds(name!, a, top.matrix);
    if (b) found[own as "head"] = union(found[own as "head"], b);
  }
  const { head, mouth, eyes } = found;
  let chin: [number, number] | undefined;
  if (mouth && eyes) {
    // Çene ağzın altında, gözle ağız arası mesafenin ~yarısı kadar aşağıda.
    const bottom = mouth.y + mouth.h;
    chin = [mouth.x + mouth.w / 2, bottom + Math.max(6, (bottom - (eyes.y + eyes.h / 2)) * 0.45)];
  } else if (head) chin = [head.x + head.w / 2, head.y + head.h * 0.92];
  return { ...found, ...(chin ? { chin } : {}) };
}
