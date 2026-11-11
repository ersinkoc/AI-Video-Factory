import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runMediaTool } from "../packages/video/src/tools.ts";

// Yalnız doğrulanmış yatay teknik örnekler galeriye kopyalanır.
const source = resolve(process.argv[2] ?? "out/style-craft");
const target = resolve("apps/studio/public/style-previews");
const manifest: Record<string, { version: string; seconds: number }> = {};
const files = await Promise.all(["paper-cutout", "risograph", "isometric"].map(async (id) => {
  const video = resolve(source, id + ".mp4");
  const poster = resolve(source, id, "settled.jpg");
  const probe = JSON.parse((await runMediaTool("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_frames:format=duration", "-of", "json", video])).stdout);
  const stream = probe.streams[0];
  if (stream?.width !== 1920 || stream.height !== 1080 || Number(stream.nb_frames) !== 240 || Math.abs(Number(probe.format.duration) - 8) > 0.1) throw new Error("Expected an 8-second 1920x1080 preview: " + id);
  const bytes = await readFile(video);
  await readFile(poster);
  manifest[id] = { version: createHash("sha256").update(bytes).digest("hex").slice(0, 12), seconds: 8 };
  return { id, video, poster };
}));
await mkdir(target, { recursive: true });
for (const { id, video, poster } of files) {
  await copyFile(video, resolve(target, id + ".mp4"));
  await copyFile(poster, resolve(target, id + ".jpg"));
}
await writeFile(resolve("apps/studio/src/lib/style-previews.ts"), "/** Yerel, sessiz teknik örnekler; yalnız seçili videonun metaverisi yüklenir. */\nexport const STYLE_PREVIEWS: Record<string, { version: string; seconds: number }> = " + JSON.stringify(manifest, null, 2) + ";\n");
console.log("Installed three verified local style previews.");
