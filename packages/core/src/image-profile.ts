import { z } from "zod";

const unit = z.number().finite().min(0).max(1);
/** Measurements describe pixels, not aesthetic quality or accessibility compliance. */
export const ImageProfile = z.object({
  version: z.literal(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(), height: z.number().int().positive(),
  sampledPixels: z.number().int().positive().max(192 * 192),
  palette: z.array(z.object({ color: z.string().regex(/^#[0-9a-f]{6}$/), share: unit })).min(1).max(6),
  tone: z.object({ p10: unit, median: unit, p90: unit, darkShare: unit, lightShare: unit }),
  contrastSpan: unit,
  edgeDensity: unit,
});
export type ImageProfile = z.infer<typeof ImageProfile>;

/** Standard sRGB -> OKLab equations; distances operate in perceptual color space. */
export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const linear = (v: number) => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
  r = linear(r); g = linear(g); b = linear(b);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s];
}
export function colorDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}
export function compareImageProfiles(reference: ImageProfile, actual: ImageProfile) {
  const colors = (p: ImageProfile) => p.palette.map(({ color, share }) => ({ share, lab: rgbToOklab(...[1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number]) }));
  const a = colors(reference), b = colors(actual);
  const nearest = (from: typeof a, to: typeof a) => from.reduce((sum, c) => sum + c.share * Math.min(...to.map((d) => colorDistance(c.lab, d.lab))), 0);
  const paletteDistance = (nearest(a, b) + nearest(b, a)) / 2;
  const matched = new Set<number>();
  let shareDifference = 0;
  for (const c of a) {
    const candidates = b.map((d, i) => ({ i, distance: colorDistance(c.lab, d.lab) })).filter((d) => !matched.has(d.i) && d.distance < .08).sort((x, y) => x.distance - y.distance);
    const match = candidates[0];
    if (match) { matched.add(match.i); shareDifference += Math.abs(c.share - b[match.i]!.share); }
    else shareDifference += c.share;
  }
  const paletteShareDelta = (shareDifference + b.reduce((sum, c, i) => sum + (matched.has(i) ? 0 : c.share), 0)) / 2;
  const toneDelta = Math.abs(reference.tone.median - actual.tone.median);
  const contrastDelta = Math.abs(reference.contrastSpan - actual.contrastSpan);
  const edgeDelta = Math.abs(reference.edgeDensity - actual.edgeDensity);
  return { paletteDistance, paletteShareDelta, toneDelta, contrastDelta, edgeDelta,
    flags: [paletteDistance > .12 || paletteShareDelta > .25 ? "palette" : "", toneDelta > .18 ? "tone" : "", contrastDelta > .22 ? "contrast" : "", edgeDelta > .2 ? "detail" : ""].filter(Boolean) };
}
