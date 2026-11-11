import { createHash } from "node:crypto";
import sharp from "sharp";
import { colorDistance, ImageProfile, rgbToOklab } from "@ys/core";
import { getJson, putJson, type AssetStore } from "@ys/storage";

/** Deterministic histogram peaks followed by perceptual nearest-color assignment. */
export async function measureImage(bytes: Uint8Array): Promise<ImageProfile> {
  const input = sharp(bytes, { limitInputPixels: 16_000_000, animated: false }).rotate();
  const metadata = await input.metadata();
  const { data, info } = await input.resize(192, 192, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  const tones: number[] = [];
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
    tones.push(Math.max(0, Math.min(1, rgbToOklab(r, g, b)[0])));
  }
  const ranked = [...bins.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0]).map(([, bin]) => {
    const rgb: [number, number, number] = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    return { ...bin, lab: rgbToOklab(...rgb), rgb };
  });
  const peaks: typeof ranked = [];
  for (const bin of ranked) {
    if (peaks.every((peak) => colorDistance(peak.lab, bin.lab) >= .08)) peaks.push(bin);
    if (peaks.length === 6) break;
  }
  const counts = peaks.map(() => 0);
  for (const bin of ranked) {
    let nearest = 0;
    for (let i = 1; i < peaks.length; i++) if (colorDistance(bin.lab, peaks[i]!.lab) < colorDistance(bin.lab, peaks[nearest]!.lab)) nearest = i;
    counts[nearest]! += bin.n;
  }
  let edges = 0, pairs = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = y * info.width + x;
    for (const j of [x + 1 < info.width ? i + 1 : -1, y + 1 < info.height ? i + info.width : -1]) if (j >= 0) {
      pairs++; if (Math.abs(tones[i]! - tones[j]!) > .12) edges++;
    }
  }
  tones.sort((a, b) => a - b);
  const percentile = (q: number) => tones[Math.floor((tones.length - 1) * q)]!;
  return ImageProfile.parse({ version: 1, sha256: createHash("sha256").update(bytes).digest("hex"),
    width: metadata.autoOrient?.width ?? metadata.width, height: metadata.autoOrient?.height ?? metadata.height,
    sampledPixels: tones.length,
    palette: peaks.map((peak, i) => ({ color: "#" + peak.rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""), share: counts[i]! / tones.length })).sort((a, b) => b.share - a.share),
    tone: { p10: percentile(.1), median: percentile(.5), p90: percentile(.9), darkShare: tones.filter((v) => v < .3).length / tones.length, lightShare: tones.filter((v) => v > .8).length / tones.length },
    contrastSpan: percentile(.9) - percentile(.1), edgeDensity: pairs ? edges / pairs : 0 });
}

export async function measureStyleReference(store: AssetStore, bytes: Uint8Array) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const referenceKey = `library/style-references/${hash}.jpg`;
  const key = `library/style-measurements/${hash}-v1.json`;
  const cached = ImageProfile.safeParse(await getJson(store, key));
  if (cached.success && cached.data.sha256 === hash && await store.get(referenceKey)) return { referenceKey, profile: cached.data, cached: true };
  const profile = await measureImage(bytes);
  await store.put(referenceKey, bytes, "image/jpeg");
  await putJson(store, key, profile);
  return { referenceKey, profile, cached: false };
}
