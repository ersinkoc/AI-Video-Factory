import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fontAsset, Timeline, TYPOGRAPHY_PAIRS, TURKISH_FONT_SAMPLE, type Typography } from "@ys/core";
import { chunkKeys } from "../src/chunks.ts";
import { stageTypography } from "../src/typography-assets.ts";
import { missingWoffGlyphs } from "../src/woff-glyphs.ts";

const require = createRequire(import.meta.url);
let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "ys-type-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe("bundled font staging", () => {
  it.each(Object.keys(TYPOGRAPHY_PAIRS) as Typography["pair"][])("stages %s with actual Turkish and Latin glyph coverage", async (pair) => {
    await stageTypography({ pair }, dir);
    for (const face of Object.values(TYPOGRAPHY_PAIRS[pair])) {
      const files = await Promise.all((["latin", "latin-ext"] as const).map((subset) => readFile(join(dir, fontAsset(face, subset)))));
      expect(missingWoffGlyphs(files, TURKISH_FONT_SAMPLE)).toEqual([]);
      expect(missingWoffGlyphs(files, "🙂")).toEqual(["🙂"]);
    }
  });
  it("detects that Latin-only coverage cannot establish complete Turkish support", async () => {
    const path = require.resolve("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff");
    const missing = missingWoffGlyphs([await readFile(path)], TURKISH_FONT_SAMPLE);
    expect(missing).toEqual(expect.arrayContaining(["Ğ", "İ", "Ş", "ğ", "ş"]));
  });
  it("does not stage fonts for an older timeline", async () => {
    await expect(stageTypography(undefined, join(dir, "unused"))).resolves.toBeUndefined();
    await expect(readFile(join(dir, "unused"))).rejects.toThrow();
  });
  it("rejects an unknown persisted typography pair", async () => {
    await expect(stageTypography({ pair: "removed-pair" } as never, dir)).rejects.toThrow("Unknown typography pair");
  });
  it("invalidates picture cache keys when the selected pair or staged font bytes change", async () => {
    const timeline = Timeline.parse({ episodeId: "fonts", lang: "tr", durationInFrames: 90, visuals: [], audio: [], typography: { pair: "clear" } });
    await stageTypography(timeline.typography, dir);
    const ranges = [{ from: 0, to: 90 }];
    const first = await chunkKeys(timeline, ranges, dir, "same-code");
    expect(await chunkKeys(timeline, ranges, dir, "same-code")).toEqual(first);
    const path = join(dir, fontAsset(TYPOGRAPHY_PAIRS.clear.body, "latin"));
    const original = await readFile(path);
    try {
      await writeFile(path, Buffer.concat([original, Buffer.from([0])]));
      expect(await chunkKeys(timeline, ranges, dir, "same-code")).not.toEqual(first);
    } finally { await writeFile(path, original); }
    timeline.typography = { pair: "editorial" };
    await stageTypography(timeline.typography, dir);
    expect(await chunkKeys(timeline, ranges, dir, "same-code")).not.toEqual(first);
  });
});
