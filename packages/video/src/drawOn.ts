import paper from "paper/dist/paper-core";

/**
 * "draw_on": nesne elle çiziliyormuş gibi belirir. Çizilebilir her öğenin konturu belge sırasıyla, uzunluğuyla
 * orantılı sürede çizilir (uzun kontur uzun sürer, kalem hızı sabit); kontur bitince dolgusu arkadan gelir. Kendi
 * konturu olmayan dolgu şekli mürekkep çizgisiyle çizilir, dolgu gelince çizgi söner. Uzunluklar paper.js ile
 * yoldan hesaplanır (DOM ve yerleşim gerekmez; render ve test aynı sonucu verir).
 */

export interface DrawStroke {
  /** Öğeye eklenen `data-draw` değeri (katman önekiyle benzersiz). */
  key: string;
  length: number;
  /** Kendi konturu yok: çizim sırasında mürekkep çizgisi verilir. */
  ink: boolean;
  /** Öğenin kendi dolgu saydamlığı (dolgu buna kadar gelir). */
  fillOpacity: number;
  /** Kontur çiziminin draw_on ilerlemesindeki aralığı. */
  from: number;
  to: number;
}

export interface DrawPlan {
  svg: string;
  strokes: DrawStroke[];
  /** Mürekkep çizgisinin kalınlığı (görüntü kutusu birimi). */
  inkWidth: number;
}

/** İlerlemenin bu kadarı kontur çizimine, kalanı son dolgunun gelmesine. */
const TRACE = 0.8;
const FILL = 1 - TRACE;
const INK = "#1d1a24";

/** İçindeki şekiller çizilmez (tanım, kırpma, maske, desen). */
const SKIP = /^(defs|clipPath|mask|pattern|symbol|marker|linearGradient|radialGradient|filter)$/i;
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

const num = (v: string | undefined, d = 0) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : d;
};

const points = (v = "") => (v.trim().match(/-?[\d.]+(?:e-?\d+)?/gi) ?? []).map(Number);

/** Şeklin çevre uzunluğu (kendi koordinatında; stroke-dasharray da bu birimde). Bozuk veri 0 verir. */
export function shapeLength(tag: string, a: Record<string, string>): number {
  const g = geometry();
  let item: paper.PathItem;
  try {
    switch (tag.toLowerCase()) {
      case "path":
        item = new g.CompoundPath({ pathData: a.d ?? "", insert: false });
        break;
      case "rect": {
        const rx = num(a.rx, num(a.ry));
        item = new g.Path.Rectangle({ point: [num(a.x), num(a.y)], size: [num(a.width), num(a.height)], radius: [rx, num(a.ry, rx)], insert: false });
        break;
      }
      case "circle":
        return 2 * Math.PI * num(a.r);
      case "ellipse":
        item = new g.Path.Ellipse({ center: [num(a.cx), num(a.cy)], radius: [num(a.rx), num(a.ry)], insert: false });
        break;
      case "line":
        return Math.hypot(num(a.x2) - num(a.x1), num(a.y2) - num(a.y1));
      default: {
        // polyline / polygon
        const p = points(a.points);
        const segments = Array.from({ length: Math.floor(p.length / 2) }, (_, i) => [p[2 * i]!, p[2 * i + 1]!]);
        item = new g.Path({ segments, closed: tag.toLowerCase() === "polygon", insert: false });
      }
    }
  } catch {
    return 0;
  }
  const length = (item as paper.Path).length;
  return Number.isFinite(length) ? length : 0;
}

/** Öğenin kendi konturu var mı (öznitelik ya da satır içi stil). */
function stroked(a: Record<string, string>): boolean {
  const own = a.stroke ?? /(?:^|;)\s*stroke\s*:\s*([^;]+)/i.exec(a.style ?? "")?.[1];
  return own !== undefined && own.trim() !== "none";
}

/** SVG'nin çizilebilir öğelerini işaretler ve çizim sırasını çıkarır. */
export function drawPlan(svg: string, prefix: string): DrawPlan {
  const strokes: Omit<DrawStroke, "from" | "to">[] = [];
  let skip = 0;
  const out = svg.replace(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g, (tag, close: string, name: string, raw: string, self: string) => {
    if (SKIP.test(name)) {
      if (close) skip = Math.max(0, skip - 1);
      else if (!self) skip++;
      return tag;
    }
    if (close || skip || !SHAPE.test(name)) return tag;
    const a = attrsOf(raw);
    const key = `${prefix}${strokes.length}`;
    strokes.push({ key, length: shapeLength(name, a), ink: !stroked(a), fillOpacity: Math.min(1, Math.max(0, num(a["fill-opacity"], 1))) });
    return `<${name}${raw} data-draw="${key}"${self}>`;
  });
  // Kalem hızı sabit; çok kısa öğe de kısa bir an alır (yoksa nokta gibi ayrıntılar birden belirir).
  const total = strokes.reduce((s, x) => s + x.length, 0);
  const weight = (x: (typeof strokes)[number]) => Math.max(x.length, total * 0.002, 1e-6);
  const sum = strokes.reduce((s, x) => s + weight(x), 0);
  let at = 0;
  const timed = strokes.map((x) => {
    const from = (at / sum) * TRACE;
    at += weight(x);
    return { ...x, from, to: (at / sum) * TRACE };
  });
  const box = points(/viewBox\s*=\s*"([^"]*)"/.exec(svg)?.[1]);
  const inkWidth = Math.max(box[2] ?? 0, box[3] ?? 0, 100) / 260;
  return { svg: out, strokes: timed, inkWidth };
}

/** draw_on ilerlemesi k'da (0–1) öğelerin kontur ve dolgu durumu; bitmiş öğe için kural yazılmaz (özgün görünüm). */
export function drawCss(plan: DrawPlan, k: number): string {
  return plan.strokes
    .map((s) => {
      const fill = Math.min(1, Math.max(0, (k - s.to) / FILL));
      if (fill >= 1) return "";
      const sel = `[data-draw="${s.key}"]`;
      // Uzunluğu ölçülemeyen öğe çizilemez: sırası gelince bütünüyle belirir.
      if (s.length <= 0) return `${sel}{opacity:${fill.toFixed(3)}}`;
      const trace = Math.min(1, Math.max(0, (k - s.from) / (s.to - s.from)));
      const rules = [
        `fill-opacity:${(s.fillOpacity * fill).toFixed(3)}`,
        `stroke-dasharray:${s.length.toFixed(2)} ${s.length.toFixed(2)}`,
        `stroke-dashoffset:${(s.length * (1 - trace)).toFixed(2)}`,
      ];
      if (s.ink) rules.push(`stroke:${INK}`, `stroke-width:${plan.inkWidth.toFixed(2)}`);
      // Başlamamış konturun sıfır boylu tiresi yuvarlak uçla nokta gibi görünmesin.
      if (trace <= 0) rules.push("stroke-opacity:0");
      else if (s.ink) rules.push(`stroke-opacity:${(1 - fill).toFixed(3)}`);
      return `${sel}{${rules.join(";")}}`;
    })
    .join("");
}
