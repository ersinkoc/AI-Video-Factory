import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Timeline, TYPOGRAPHY_PAIRS, VectorAsset, VectorShot, type Typography } from "../packages/core/src/index.ts";
import { renderStills, renderThumbnail } from "../packages/video/src/render.ts";

const args = process.argv.slice(2);
const output = resolve(args.find((s) => !s.startsWith("--")) ?? "out/typography");
const portrait = args.includes("--portrait");
const only = args.find((s) => s.startsWith("--pair="))?.slice(7);
if (only && !Object.hasOwn(TYPOGRAPHY_PAIRS, only)) throw new Error(`Unknown typography pair: ${only}`);
const pairs = only ? [only as Typography["pair"]] : Object.keys(TYPOGRAPHY_PAIRS) as Typography["pair"][];
const publicDir = join(output, "public");
await mkdir(publicDir, { recursive: true });
const files = [];
for (const pair of pairs) {
  const marker = VectorAsset.parse({ id: "marker", kind: "prop", width: 200, height: 200, svg: '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="85" fill="#B54B20"/><path d="M50 100H150M100 50V150" stroke="#F3F0E6" stroke-width="14"/></svg>' });
  const vector = VectorShot.parse({ camera: { zoomFrom: 1, zoomTo: 1, panX: 0 }, layers: [{ asset: "marker", x: 960, y: 650, height: 190 }], texts: [
    { text: "Çığ, ışık ve ölçü", x: 960, y: 170, style: "title" },
    { text: "Güçlü düşünce: ÇĞİÖŞÜ çğıöşü", x: 960, y: 720, style: "subtitle" },
  ] });
  const timeline = Timeline.parse({ episodeId: `typography-${pair}`, lang: "tr", fps: 30, width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080,
    durationInFrames: 120, typography: { pair }, palette: ["#F3F0E6", "#17211C", "#B54B20"], vectorAssets: { marker },
    visuals: [{ shotId: "s1-sh1", kind: "motion_graphic", assetUrl: "", fromFrame: 0, durationInFrames: 120, vector }], audio: [],
    captions: ["İstanbul’da", "ışık,", "çığ", "ve", "ölçü."].map((text, i) => ({ text, startMs: i * 750, endMs: (i + 1) * 750 })),
  });
  await writeFile(join(output, `${pair}.json`), JSON.stringify(timeline, null, 2));
  const stills = await renderStills({ timeline, publicDir, outDir: join(output, pair), frames: { specimen: 75 } });
  const thumbnail = join(output, `${pair}-thumbnail.jpg`);
  await renderThumbnail({ timeline, publicDir, shotId: "s1-sh1", side: "bottom", title: "Çığ, ışık ve ölçü", output: thumbnail });
  files.push({ pair, stills, thumbnail });
  console.log(`${pair}: ${stills.specimen}`);
}
await writeFile(join(output, "specimens.json"), JSON.stringify({ portrait, files }, null, 2));
