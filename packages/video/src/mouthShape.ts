import type { Bounds } from "./rigGeometry.ts";
import type { Viseme } from "./visemes.ts";

/**
 * Konuşan ağzın koddan çizimi (3 Kas): çizimin ağzı konuşurken gizlenir, yerine ölçülen ağız kutusunda (rigGeometry)
 * o anın şekli çizilir. Ağız açılırken çoğunlukla aşağı açılır (çene düşer); köşeler ifadeyle kalkar/iner. Renkler sade
 * (koyu iç, beyaz diş, pembe dil), çizgi rengi çizimden.
 */

/** Koddan çizilen konuşan ağız: ölçülen ağız kutusu, ebeveyninin matrisi, çizgi rengi, çeneye kadar açılabileceği derinlik. */
export interface SpeakingMouth {
  box: Bounds;
  frame: [number, number, number, number, number, number];
  ink: string;
  drop: number;
}

export interface MouthStyle {
  /** Dudak çizgisinin rengi (çizimin ağız çizgisi). */
  ink: string;
  /** İfade: −1 somurtkan … +1 gülen (köşeler). */
  mood: number;
  /** Dudak çizgisinin (lipLine) altında açılabileceği en büyük derinlik (çeneye kadar); yoksa sınır yok. */
  drop?: number;
}

/** Açıklık genişliği (ağız genişliğinin kesri), yüksekliği, yuvarlaklık, diş ve dil. */
const SHAPES: Record<Viseme, { ww: number; h: number; round?: boolean; teeth?: "top" | "full"; tongue?: "low" | "up"; press?: boolean }> = {
  X: { ww: 0.9, h: 0 },
  A: { ww: 0.76, h: 0, press: true },
  B: { ww: 0.82, h: 0.2, teeth: "full" },
  C: { ww: 0.86, h: 0.42, teeth: "top" },
  D: { ww: 1, h: 0.72, teeth: "top", tongue: "low" },
  E: { ww: 0.68, h: 0.5, round: true },
  F: { ww: 0.42, h: 0.36, round: true },
  G: { ww: 0.78, h: 0.17, teeth: "top" },
  H: { ww: 0.84, h: 0.42, teeth: "top", tongue: "up" },
};

/** Konuşurken çizilen şekiller (sessizlikte, X, çizimin kendi ağzı görünür). */
export const SPOKEN: readonly Viseme[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Ağız içi, diş ve dil: soluk tonlar (parlak kırmızı iç sade çizimlerde göze batıyordu). */
export const MOUTH_COLORS = { inside: "#42191f", teeth: "#f4efe4", tongue: "#b5646d" } as const;

/** Ölçülen ağız bundan darsa şekiller bu genişlikte çizilir (nokta gibi ağızda açıklık okunmuyor). */
const MIN_WIDTH = 22;
/** En açık şeklin (D) çizginin altındaki derinliği, genişliğin kesri: 0,72 açıklığın 0,72'si. */
const DEEPEST = 0.72 * 0.72;
/** Çene yakınsa açıklıklar birlikte küçülür, ama en az bu kadar kalır (şekiller birbirinden ayrılsın). */
const MIN_OPEN = 0.35;

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * Dudak çizgisinin yüksekliği: çizgi ağızda kutunun ortası; kocaman açık çizilmiş ağızda (C# bölümü: 76×42 px kahkaha)
 * köşeler kutunun üstündedir, şekil oradan açılmalı (yoksa ağız çeneye kayıyordu): üstten en çok genişliğin %15'i.
 */
export const lipLine = (box: Bounds) => box.y + Math.min(box.h / 2, box.w * 0.15);

/** Bir ağız şeklinin SVG işaretlemesi (iskelet tuvali koordinatında, ağzın ortasında, dudak çizgisinde). */
export function mouthSvg(v: Viseme, box: Bounds, style: MouthStyle): string {
  const s = SHAPES[v];
  const w = Math.max(box.w, MIN_WIDTH);
  const cx = box.x + box.w / 2;
  const cy = lipLine(box);
  const a = (s.ww * w) / 2;
  const mood = Math.max(-1, Math.min(1, style.mood));
  // Köşeler gülerken kalkar (ekranda yukarı = eksi).
  const c = cy - mood * 0.12 * w;
  const sw = Math.max(1.6, w * 0.07);
  const line = (k = 1) => `stroke="${style.ink}" stroke-width="${f(sw * k)}" stroke-linecap="round" stroke-linejoin="round"`;
  if (!s.h) {
    // Kapalı ağız: köşeler arası ifadeli eğri; bastırılmış dudak (M, B, P) daha dar, daha düz ve kalın (gülümseme gibi
    // kıvrılınca çene çizgisine benziyordu).
    const bend = cy + mood * (s.press ? 0.04 : 0.1) * w;
    return `<path d="M${f(cx - a)} ${f(c)} Q${f(cx)} ${f(2 * bend - c)} ${f(cx + a)} ${f(c)}" fill="none" ${line(s.press ? 1.3 : 1)}/>`;
  }
  // Açıklıklar çeneyi geçmesin: hepsi aynı oranda küçülür (aralarındaki fark korunur).
  const room = style.drop === undefined ? 1 : Math.max(MIN_OPEN, Math.min(1, (cy + style.drop - c) / (DEEPEST * w)));
  const H = s.h * w * room;
  const parts: string[] = [];
  let outline: string;
  if (s.round) {
    // Yuvarlak/büzük: elips, merkezi biraz aşağıda (çene düşer).
    outline = `<ellipse cx="${f(cx)}" cy="${f(c + H * 0.15)}" rx="${f(a)}" ry="${f(H / 2)}"`;
  } else {
    // Mercek: üst dudak az, alt dudak çok açılır (ikinci derece eğrinin tepesi, kontrol noktasına uzaklığın yarısında).
    const top = c - 2 * H * 0.28;
    const bottom = c + 2 * H * 0.72;
    outline = `<path d="M${f(cx - a)} ${f(c)} Q${f(cx)} ${f(top)} ${f(cx + a)} ${f(c)} Q${f(cx)} ${f(bottom)} ${f(cx - a)} ${f(c)}Z"`;
  }
  parts.push(`${outline} fill="${s.teeth === "full" ? MOUTH_COLORS.teeth : MOUTH_COLORS.inside}"/>`);
  if (s.teeth === "top") parts.push(`<ellipse cx="${f(cx)}" cy="${f(c - H * 0.16)}" rx="${f(a * 0.66)}" ry="${f(H * 0.13)}" fill="${MOUTH_COLORS.teeth}"/>`);
  if (s.teeth === "full") parts.push(`<path d="M${f(cx - a * 0.8)} ${f(c + H * 0.12)} L${f(cx + a * 0.8)} ${f(c + H * 0.12)}" stroke="${MOUTH_COLORS.inside}" stroke-width="${f(sw * 0.6)}"/>`);
  if (s.tongue === "low") parts.push(`<ellipse cx="${f(cx)}" cy="${f(c + H * 0.52)}" rx="${f(a * 0.5)}" ry="${f(H * 0.16)}" fill="${MOUTH_COLORS.tongue}"/>`);
  if (s.tongue === "up") parts.push(`<ellipse cx="${f(cx)}" cy="${f(c + H * 0.05)}" rx="${f(a * 0.3)}" ry="${f(H * 0.17)}" fill="${MOUTH_COLORS.tongue}"/>`);
  // Dudak çizgisi en üstte.
  parts.push(`${outline} fill="none" ${line()}/>`);
  return parts.join("");
}

/** Öğenin kapanışından sonraki konum (kendini kapatan etikette etiketin sonu); kapanmamışsa undefined. */
function endOf(svg: string, start: number): number | undefined {
  let depth = 0;
  for (const m of svg.slice(start).matchAll(/<(\/?)[a-zA-Z][\w:-]*[^>]*?(\/?)>/g)) {
    if (m[1]) depth--;
    else if (!m[2]) depth++;
    if (depth === 0) return start + m.index + m[0].length;
  }
  return undefined;
}

/** Çizimin kimlikli ağız öğesi (öneki eklenmiş SVG'de) ile onun ve vizem şekillerinin kimlikleri. */
export const mouthIds = (prefix: string) => ({ mouth: `${prefix}mouth`, shape: (v: Viseme) => `${prefix}viseme-${v}` });

/**
 * Konuşan ağzın bütün şekilleri ağız öğesinin hemen arkasına, gizli olarak konur (aynı ebeveyn: başla birlikte döner).
 * Şekiller iskelet tuvali koordinatında çizilir; ebeveyn matrisinin tersiyle sarılır. Her karede yalnız CSS hangisinin
 * görüneceğini seçer: çizim her şekil değişiminde yeniden ayrıştırılmaz. Ağız öğesi bulunamazsa ya da matris tersinmezse
 * undefined.
 */
export function withMouths(svg: string, prefix: string, mouth: SpeakingMouth, mood: number): string | undefined {
  const ids = mouthIds(prefix);
  const at = svg.indexOf(` id="${ids.mouth}"`);
  if (at < 0) return undefined;
  const end = endOf(svg, svg.lastIndexOf("<", at));
  const [a, b, c, d, e, g] = mouth.frame;
  const det = a * d - b * c;
  if (end === undefined || Math.abs(det) < 1e-9) return undefined;
  const inv = [d / det, -b / det, -c / det, a / det, (c * g - d * e) / det, (b * e - a * g) / det].map((n) => Math.round(n * 1e6) / 1e6);
  const style = { ink: mouth.ink, mood, drop: mouth.drop };
  const shapes = SPOKEN.map((v) => `<g id="${ids.shape(v)}" display="none">${mouthSvg(v, mouth.box, style)}</g>`).join("");
  return `${svg.slice(0, end)}<g transform="matrix(${inv.join(" ")})">${shapes}</g>${svg.slice(end)}`;
}
