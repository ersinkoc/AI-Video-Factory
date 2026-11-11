import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fontAsset, TYPOGRAPHY_PAIRS, TURKISH_FONT_SAMPLE, type Typography } from "@ys/core";
import { missingWoffGlyphs } from "./woff-glyphs.ts";

const require = createRequire(import.meta.url);
/** Stage only selected fonts into the same local public directory as the scene's assets. */
export async function stageTypography(selection: Typography | undefined, publicDir: string): Promise<void> {
  if (!selection) return;
  const pair = TYPOGRAPHY_PAIRS[selection.pair];
  if (!pair) throw new Error("Unknown typography pair.");
  for (const face of [pair.heading, pair.body]) {
    const parts = await Promise.all((["latin", "latin-ext"] as const).map(async (subset) => {
      const file = fontAsset(face, subset);
      const source = require.resolve(`@fontsource/${face.id}/files/${file.slice("typography/".length)}`);
      return { file, bytes: await readFile(source) };
    }));
    const missing = missingWoffGlyphs(parts.map((p) => p.bytes), TURKISH_FONT_SAMPLE);
    if (missing.length) throw new Error(`Font ${face.family} ${face.weight} lacks required glyphs: ${missing.join(" ")}`);
    for (const { file, bytes } of parts) {
      const target = join(publicDir, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
  }
}
