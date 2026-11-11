import { prefixSvgIds, type VectorAnim } from "@ys/core";

/** Kısa baskı geçişinin ilerlemesi; mutlak çekim zamanıyla geri sarılabilir. */
export function printProgress(anims: VectorAnim[], p: number): number {
  const enter = anims.find((a) => a.type === "fade_in" || a.type === "pop" || a.type === "slide_in" || a.type === "draw_on");
  if (!enter) return 1;
  return Math.max(0, Math.min(1, (p - enter.start) / Math.max(0.0001, enter.end - enter.start)));
}

export interface InkPlate { svg: string; x: number; y: number }

/**
 * Düz renk SVG, renk başına bir baskı geçişine ayrılır. Karmaşık boyalar ve maskeler özgün çizimde kalır:
 * renge göre ayırmak onların alfa/örtüşme sözleşmesini bozardı. Renkler değiştirilmez, kayıt kayması sabittir.
 */
export function inkPlates(svg: string, prefix: string): InkPlate[] | undefined {
  if (/url\(|<(?:mask|filter|linearGradient|radialGradient)\b|style="[^"]*(?:fill|stroke)\s*:/i.test(svg)) return undefined;
  const paints = [...svg.matchAll(/\s(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]!);
  if (paints.some((c) => c !== "none" && !/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(c))) return undefined;
  const hex = (c: string) => (c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c).toLowerCase();
  const colours = [...new Set(paints.filter((c) => c !== "none").map(hex))];
  if (!colours.length || colours.length > 8) return undefined;
  // SVG'nin örtük dolgusu siyah; ayrı bir plaka onu da korur.
  if (!colours.includes("#000000")) colours.push("#000000");
  return colours.map((colour, i) => {
    const ink = svg.replace(/\s(fill|stroke)="([^"]+)"/g, (_m, prop: string, c: string) => ' ' + prop + '="' + (c !== "none" && hex(c) === colour ? c : "none") + '"');
    // Birden fazla SVG'nin tanımları birbirine karışmasın.
    const rooted = ink.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => '<svg' + (/\sfill=/.test(attrs) ? attrs : attrs + ' fill="' + (colour === "#000000" ? "#000000" : "none") + '"') + '>');
    return { svg: prefixSvgIds(rooted, prefix + i + "-"), x: i === 0 ? 0 : i % 2 ? 1.25 : -1.25, y: i === 0 ? 0 : i % 3 === 0 ? -0.65 : 0.65 };
  });
}

/** Baskı geçişleri üst üste başlar; son anda hepsi opaktır, kayıt kayması sonradan değişmez. */
export function plateOpacity(q: number, index: number, count: number): number {
  const delay = count <= 1 ? 0 : (index / (count - 1)) * 0.3;
  const p = Math.max(0, Math.min(1, (q - delay) / 0.7));
  return 1 - (1 - p) ** 3;
}
