import { RIG } from "@ys/core";
import paper from "paper/dist/paper-core";

/**
 * Çizimin gerçek yüz geometrisi (3 Kas): iskelet dönme noktaları sabit ama tasarımcılar başı farklı yüksekliğe, ağzı
 * farklı yere çiziyor (uzun boyunlu çizimde çene varsayılandan ~40 px yukarıdaydı; el çeneye ulaşmıyordu). "head",
 * "mouth" ve "eyes" gruplarının sınırları SVG'den ölçülür (grup dönüşümleri dahil; DOM gerekmez, render ve test aynı).
 * Koordinatlar viewBox'tan iskelet tuvaline (400×800) çevrilir. İskelet parçalarının kendi transform öznitelikleri
 * sayılmaz: render pozu bunları CSS ile ezer (çizim render'da öyle görünür).
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
  /**
   * Ağzın ebeveyninin koordinatından iskelet tuvaline matris [a, b, c, d, e, f]: koddan çizilen ağız bunun tersiyle
   * ağzın kardeşi olarak çizime konur (başla birlikte döner).
   */
  mouthFrame?: [number, number, number, number, number, number];
  /** Ağız çizgisinin rengi (ilk geçerli çizgi, yoksa dolgu rengi). */
  mouthInk?: string;
  /**
   * Kolun dinlenmedeki en alt noktası (ön kol + el; sarkan elde parmak uçları), iskelet y. Ele bir yer gösterilirken
   * (çeneye) parmakların nereye kadar uzandığı bundan bilinir: uzun elli çizimde el ağzı kapatıyordu.
   */
  hands?: { l?: number; r?: number };
}

const PARTS = new Set(["head", "mouth", "eyes", "forearm-l", "forearm-r", "hand-l", "hand-r"]);
/** Render pozunun CSS dönüşümüyle ezdiği kimlikler. */
const POSED = new Set<string>([...Object.keys(RIG.pivots), "torso"]);
const SKIP = /^(defs|clipPath|mask|pattern|symbol|marker|linearGradient|radialGradient|filter|metadata|title|desc|style)$/i;
const SHAPE = /^(path|rect|circle|ellipse|line|polyline|polygon)$/i;

let scope: paper.PaperScope | undefined;
export function geometry(): paper.PaperScope {
  if (!scope) {
    scope = new paper.PaperScope();
    scope.setup(new scope.Size(1, 1));
  }
  return scope;
}

export function attrsOf(raw: string): Record<string, string> {
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
export function shapeBounds(tag: string, a: Record<string, string>, matrix: paper.Matrix): Bounds | undefined {
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
    item.transform(a.id && POSED.has(a.id) ? matrix : matrix.appended(transformOf(a.transform)));
  } catch {
    return undefined;
  }
  const b = item.bounds;
  return [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width + b.height > 0 ? { x: b.x, y: b.y, w: b.width, h: b.height } : undefined;
}

export const unionBounds = (a: Bounds | undefined, b: Bounds): Bounds => {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** Öznitelikteki ya da style'daki boya; renk değilse (none, url(), currentColor) undefined. */
function paintOf(a: Record<string, string>, key: "stroke" | "fill"): string | undefined {
  const v = (a[key] ?? new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`).exec(a.style ?? "")?.[1])?.trim();
  return v && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|[a-z]+)$/i.test(v) && !/^(none|transparent|currentcolor|inherit)$/i.test(v) ? v : undefined;
}

/** Çizimin şekilleri: iskelet tuvalindeki sınırları, içinde bulunduğu grupların kimlikleri, metindeki yeri ve sırası. */
interface Shape {
  b: Bounds;
  ids: string[];
  /** Hemen içinde bulunduğu grubun kimliği (adsız grupta undefined). */
  parent?: string;
  at: number;
  len: number;
  self: boolean;
}

function shapesOf(svg: string, rig: { width: number; height: number }): Shape[] {
  const g = geometry();
  const box = nums(/viewBox\s*=\s*"([^"]*)"/.exec(svg)?.[1]);
  const [vx, vy, vw, vh] = box.length === 4 ? box : [0, 0, rig.width, rig.height];
  const k = Math.min(rig.width / vw!, rig.height / vh!);
  const root = new g.Matrix().translate((rig.width - vw! * k) / 2, (rig.height - vh! * k) / 2).scale(k).translate(-vx!, -vy!);
  const stack: { matrix: paper.Matrix; ids: string[]; id?: string }[] = [{ matrix: root, ids: [] }];
  const out: Shape[] = [];
  let skip = 0;
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, raw, self] = m;
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
      const matrix = name === "svg" || (a.id && POSED.has(a.id)) ? top.matrix : top.matrix.appended(transformOf(a.transform));
      stack.push({ matrix, ids: a.id ? [...top.ids, a.id] : top.ids, ...(a.id ? { id: a.id } : {}) });
      continue;
    }
    if (!SHAPE.test(name!)) continue;
    const b = shapeBounds(name!, a, top.matrix);
    if (b) out.push({ b, ids: a.id ? [...top.ids, a.id] : top.ids, ...(top.id ? { parent: top.id } : {}), at: m.index!, len: m[0].length, self: Boolean(self) });
  }
  return out;
}

const union = (shapes: Shape[]) => shapes.reduce<Bounds | undefined>((u, s) => unionBounds(u, s.b), undefined);

/** Şekiller ardışık kardeş mi (aralarında yalnız boşluk): tek grupta toplanabilir. */
const siblings = (svg: string, parts: Shape[]) => parts.every((s, i) => i === 0 || !svg.slice(parts[i - 1]!.at + parts[i - 1]!.len, s.at).trim());

/** Çizimin burnu: metindeki yeri ve gözlerin ona değmeden yana kayabileceği boşluk (iskelet px). */
export interface Nose {
  box: Bounds;
  /** Gözler sağa (r) ya da sola (l) en çok bu kadar kayınca bir göz burna değer; dikeyde örtüşmüyorsa Infinity. */
  room: { l: number; r: number };
  /** Burnun şekillerinin metindeki ilk karakteri ve bitişi (ardışık kardeşler). */
  from: number;
  to: number;
}

/**
 * Burun (5 Kas, kullanıcı: "gözler ve burun birbirine giriyor, çok sahnede"): tasarımcı burnu ayrı bir grup olarak
 * çizmiyor (133 çizimin hiçbirinde "nose" kimliği yok); başın içinde, göz, kaş ve ağız gruplarının dışında kalan, iki
 * gözün arasında ve altında, ağzın üstünde biten küçük şekillerdir (124 çizimde bulundu, 12'si gözle denetlendi).
 * Bakış ve konuşulana dönüş gözleri kaydırırken burun yerinde kalıyordu; çizimlerin çoğunda burnun üstü bir gözün iç
 * köşesine 0–4 px. Şekiller ardışık kardeş olmalı (araya başka öğe girmeden tek grupta toplanabilsin); değilse undefined.
 */
export function noseOf(svg: string, rig: { width: number; height: number } = { width: 400, height: 800 }): Nose | undefined {
  if (/\sid\s*=\s*["']nose["']/.test(svg)) return undefined;
  const shapes = shapesOf(svg, rig);
  const within = (id: string) => shapes.filter((s) => s.ids.includes(id));
  const eyes = union(within("eyes"));
  const mouth = union(within("mouth"));
  if (!eyes || !mouth) return undefined;
  const mid = eyes.x + eyes.w / 2;
  const left = union(within("eyes").filter((s) => s.b.x + s.b.w / 2 < mid));
  const right = union(within("eyes").filter((s) => s.b.x + s.b.w / 2 >= mid));
  if (!left || !right) return undefined;
  const lo = left.x + left.w * 0.4;
  const hi = right.x + right.w * 0.6;
  const parts = shapes.filter((s) => {
    if (!s.ids.includes("head") || ["eyes", "brows", "mouth"].some((id) => s.ids.includes(id))) return false;
    const cx = s.b.x + s.b.w / 2;
    return cx > lo && cx < hi && s.b.y >= eyes.y - eyes.h / 2 && s.b.y + s.b.h <= mouth.y + mouth.h / 2 && s.b.w < eyes.w / 2 && s.b.h < (mouth.y + mouth.h - eyes.y) * 1.1;
  });
  if (!parts.length || !parts.every((s) => s.self)) return undefined;
  if (!siblings(svg, parts)) return undefined;
  const box = union(parts)!;
  const touches = (e: Bounds) => Math.min(e.y + e.h, box.y + box.h) > Math.max(e.y, box.y);
  // Bir piksel pay: göz burna değmeden durur.
  const gap = (v: number) => Math.max(0, v - 1);
  return {
    box,
    room: { r: touches(left) ? gap(box.x - left.x - left.w) : Infinity, l: touches(right) ? gap(right.x - box.x - box.w) : Infinity },
    from: parts[0]!.at,
    to: parts.at(-1)!.at + parts.at(-1)!.len,
  };
}

/** Burnun şekilleri tek grupta (`<g id="nose">`): poz onu gözlerle birlikte kaydırabilsin. */
export function withNose(svg: string, nose: Pick<Nose, "from" | "to">): string {
  return `${svg.slice(0, nose.from)}<g id="nose">${svg.slice(nose.from, nose.to)}</g>${svg.slice(nose.to)}`;
}

/**
 * Burnun bu karedeki kayması: gözler burnun yanındaki boşluk kadar serbest kayar (bakış, göz gezdirme); aşınca burun
 * da aşan kadar gider (yüz o yana dönmüş gibi; gözlüğün köprüsü burunda kalır).
 */
export function noseShift(eyes: number, room: Nose["room"]): number {
  return eyes - Math.min(room.r, Math.max(-room.l, eyes));
}

/**
 * Boyun (5 Kas, kullanıcı: "boyun nedense elbiselerin üstüne çıkıyor"): tasarımcı boynu baş grubunun içinde, baş dönünce
 * onunla dönsün diye çiziyor; baş gövdeden sonra çizildiği için boynun altı yakanın, gömleğin üstüne biniyordu (133
 * çizimin 115'inde boyun gövdenin üstüne 8–38 px iniyordu). Boyun, başın doğrudan içinde yüzden önce çizilen (yüzün
 * arkasında kalan), ortada, dar ve çenenin altına uzanan ardışık şekillerdir (119 çizimde bulundu, hepsi gözle
 * denetlendi). Yüz: başın ağzı içine alan en büyük şekli. Bulunamazsa undefined.
 */
export function neckOf(svg: string, rig: { width: number; height: number } = { width: 400, height: 800 }): { from: number; to: number } | undefined {
  const shapes = shapesOf(svg, rig);
  const mouth = union(shapes.filter((s) => s.ids.includes("mouth")));
  if (!mouth) return undefined;
  const head = shapes.filter((s) => s.ids.includes("head") && !["eyes", "brows", "mouth"].some((id) => s.ids.includes(id)));
  const covers = (b: Bounds) => b.x <= mouth.x && b.x + b.w >= mouth.x + mouth.w && b.y <= mouth.y && b.y + b.h >= mouth.y + mouth.h;
  const face = head.filter((s) => covers(s.b)).sort((a, b) => b.b.w * b.b.h - a.b.w * a.b.h)[0];
  if (!face) return undefined;
  const { x, y, w, h } = face.b;
  const chin = y + h;
  const parts = head.filter((s) => s.at < face.at && s.b.y < chin && s.b.y + s.b.h > chin + 4 && Math.abs(s.b.x + s.b.w / 2 - (x + w / 2)) < w * 0.2 && s.b.w < w * 0.6);
  if (!parts.length || !parts.every((s) => s.self && s.parent === "head") || !siblings(svg, parts)) return undefined;
  return { from: parts[0]!.at, to: parts.at(-1)!.at + parts.at(-1)!.len };
}

/**
 * Bilek ekseni (iskelet x): eli ön kolun içinde ayrı grup olan kolda ön kolun (elsiz) orta çizgisi. El bu eksende aynalanınca bilekten
 * kopmadan döner (handRoll). Eli ayrı grup olmayan kolda yok.
 */
export function wristsOf(svg: string, rig: { width: number; height: number } = { width: 400, height: 800 }): { l?: number; r?: number } {
  const shapes = shapesOf(svg, rig);
  const axis = (side: "l" | "r") => {
    // El ön kolun içinde olmalı (iskelet: bilek ön kolla döner); kardeşse ön kolu izlemez, dönmesi de anlamsız.
    if (!shapes.some((s) => s.ids.includes(`hand-${side}`) && s.ids.includes(`forearm-${side}`))) return undefined;
    const sleeve = union(shapes.filter((s) => s.ids.includes(`forearm-${side}`) && !s.ids.includes(`hand-${side}`)));
    return sleeve && sleeve.x + sleeve.w / 2;
  };
  const l = axis("l");
  const r = axis("r");
  return { ...(l === undefined ? {} : { l }), ...(r === undefined ? {} : { r }) };
}

/** Çizimin baş, ağız ve göz grupları ile çenesi (iskelet tuvali koordinatında). */
export function faceOf(svg: string, rig: { width: number; height: number } = { width: 400, height: 800 }): Face {
  const g = geometry();
  const box = nums(/viewBox\s*=\s*"([^"]*)"/.exec(svg)?.[1]);
  const [vx, vy, vw, vh] = box.length === 4 ? box : [0, 0, rig.width, rig.height];
  // viewBox → iskelet tuvali ("meet": oran korunur, ortalanır).
  const k = Math.min(rig.width / vw!, rig.height / vh!);
  const root = new g.Matrix().translate((rig.width - vw! * k) / 2, (rig.height - vh! * k) / 2).scale(k).translate(-vx!, -vy!);
  const stack: { matrix: paper.Matrix; part?: string; stroke?: string; fill?: string }[] = [{ matrix: root }];
  const found: Partial<Record<string, Bounds>> = {};
  let frame: paper.Matrix | undefined;
  let line: string | undefined;
  let fill: string | undefined;
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
    if (a.id === "mouth") frame ??= top.matrix;
    const stroke = paintOf(a, "stroke") ?? top.stroke;
    const paint = paintOf(a, "fill") ?? top.fill;
    if (name === "g" || name === "svg") {
      if (self) continue;
      const id = a.id && PARTS.has(a.id) ? a.id : top.part;
      const matrix = name === "svg" || (a.id && POSED.has(a.id)) ? top.matrix : top.matrix.appended(transformOf(a.transform));
      stack.push({ matrix, part: id, stroke, fill: paint });
      continue;
    }
    if (!SHAPE.test(name!)) continue;
    const own = a.id && PARTS.has(a.id) ? a.id : top.part;
    if (!own) continue;
    const b = shapeBounds(name!, a, top.matrix);
    if (!b) continue;
    found[own] = unionBounds(found[own], b);
    if (own === "mouth") {
      line ??= stroke;
      fill ??= paint;
    }
  }
  const { head, mouth, eyes } = found;
  // Ön kol ve el (el grubu yoksa el ön kolun içinde çizilir): en alt nokta.
  const lowest = (side: "l" | "r") => {
    const ys = [found[`forearm-${side}`], found[`hand-${side}`]].filter((b) => b !== undefined).map((b) => b.y + b.h);
    return ys.length ? Math.max(...ys) : undefined;
  };
  const l = lowest("l");
  const r = lowest("r");
  let chin: [number, number] | undefined;
  if (mouth && eyes) {
    // Çene ağzın altında, gözle ağız arası mesafenin ~yarısı kadar aşağıda.
    const bottom = mouth.y + mouth.h;
    chin = [mouth.x + mouth.w / 2, bottom + Math.max(6, (bottom - (eyes.y + eyes.h / 2)) * 0.45)];
  } else if (head) chin = [head.x + head.w / 2, head.y + head.h * 0.92];
  const ink = line ?? fill;
  return {
    ...(head ? { head } : {}),
    ...(mouth ? { mouth } : {}),
    ...(eyes ? { eyes } : {}),
    ...(l !== undefined || r !== undefined ? { hands: { ...(l !== undefined ? { l } : {}), ...(r !== undefined ? { r } : {}) } } : {}),
    ...(chin ? { chin } : {}),
    ...(frame && mouth ? { mouthFrame: [frame.a, frame.b, frame.c, frame.d, frame.tx, frame.ty] as Face["mouthFrame"] } : {}),
    ...(ink ? { mouthInk: ink } : {}),
  };
}
