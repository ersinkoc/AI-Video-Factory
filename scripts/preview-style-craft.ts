import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { carriedObjects, paperPosterRecipe, stylePackOf, Timeline, VectorAsset, VectorShot } from "../packages/core/src/index.ts";
import { renderEpisode, renderStills } from "../packages/video/src/render.ts";
import { runMediaTool } from "../packages/video/src/tools.ts";

// Aynı mesaj akışını üç yerel malzemede gösterir; AI ve ücretli sağlayıcı çağrısı yok.
const output = resolve(process.argv[2] ?? "out/style-craft");
const portrait = process.argv.includes("--portrait");
const render = process.argv.includes("--render");
const posterOnly = process.argv.includes("--poster-only");
await mkdir(output, { recursive: true });
const publicDir = resolve(output, "public");
await mkdir(publicDir, { recursive: true });
if (render) await runMediaTool("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "8", resolve(publicDir, "silence.wav")]);
for (const id of posterOnly ? ["paper-poster"] : ["paper-cutout", "risograph", "isometric"]) {
  const pack = id === "paper-poster" ? paperPosterRecipe() : stylePackOf(id)!;
  const brightness = (hex: string) => [0, 2, 4].reduce((sum, i) => sum + parseInt(hex.slice(i + 1, i + 3), 16), 0);
  const light = [...pack.palette].sort((a, b) => brightness(b) - brightness(a))[0]!;
  const dark = [...pack.palette].sort((a, b) => brightness(a) - brightness(b))[0]!;
  const ink = id === "risograph" || id === "paper-poster" ? dark : pack.palette[0]!;
  const accent = pack.palette[id === "paper-poster" ? 2 : 1]!;
  const shade = (hex: string, k: number) => "#" + [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i + 1, i + 3), 16) * (1 - k) + 255 * k).toString(16).padStart(2, "0")).join("");
  const asset = (id: string, kind: "prop" | "background", svg: string, width = 300, height = 300) => VectorAsset.parse({ id, kind, svg, width, height, ...(posterOnly && kind === "prop" ? { meta: { grounded: false } } : {}) });
  const device = (colour: string) => id === "isometric"
    ? '<path d="M30 100L150 30L270 100L150 170Z" fill="' + shade(colour, 0.4) + '"/><path d="M30 100L150 170V300L30 230Z" fill="' + shade(colour, 0.15) + '"/><path d="M150 170L270 100V230L150 300Z" fill="' + colour + '"/><path d="M165 185L250 136V150L165 199ZM165 215L250 166V180L165 229ZM165 245L250 196V210L165 259Z" fill="' + light + '"/>'
    : '<rect x="25" y="30" width="250" height="250" rx="12" fill="' + colour + '"/><rect x="55" y="70" width="190" height="100" fill="' + light + '"/><circle cx="90" cy="220" r="14" fill="' + ink + '"/><rect x="130" y="210" width="90" height="18" fill="' + ink + '"/>';
  const assets = {
    room: asset("room", "background", '<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="' + light + '"/>' + (id === "paper-poster" ? '<path d="M700 490H1200" stroke="#68725F" stroke-width="12"/>' : "") + '</svg>', 1920, 1080),
    source: asset("source", "prop", '<svg viewBox="0 0 300 320">' + device(accent!) + '</svg>', 300, 320),
    server: asset("server", "prop", '<svg viewBox="0 0 300 320">' + (id === "paper-poster" ? '<rect x="50" y="20" width="200" height="280" rx="8" fill="#111410"/><path d="M75 55H225V100H75ZM75 125H225V170H75ZM75 195H225V240H75Z" fill="#F3F0E6"/><circle cx="95" cy="267" r="9" fill="#D5FA73"/><rect x="120" y="261" width="80" height="12" fill="#68725F"/>' : device(id === "risograph" ? pack.palette[0]! : ink!)) + '</svg>', 300, 320),
    packet: id === "paper-poster" ? asset("packet", "prop", '<svg viewBox="0 0 100 100"><rect x="5" y="20" width="90" height="65" rx="4" fill="#111410"/><path d="M12 27H88L50 60Z" fill="#D5FA73"/></svg>', 100, 100) : asset("packet", "prop", '<svg viewBox="0 0 100 100"><path d="M10 25H90V80H10Z" fill="' + accent + '" stroke="' + ink + '" stroke-width="3"/><path d="M10 25L50 55L90 25" fill="none" stroke="' + ink + '" stroke-width="3"/></svg>', 100, 100),
  };
  const camera = { zoomFrom: 1, zoomTo: 1, panX: 0 };
  const layers = id === "paper-poster" ? [{ asset: "source", x: 570, y: 800, height: 500 }, { asset: "server", x: 1350, y: 800, height: 500 }] : [{ asset: "source", x: 660, y: 760, height: 350 }, { asset: "server", x: 1260, y: 760, height: 350 }];
  const first = VectorShot.parse({ background: "room", camera, layers: [...layers, { asset: "packet", x: 790, y: 530, height: 85, anims: [{ type: "move", start: 0.2, end: 0.85, toX: 1120 }] }], texts: [{ text: "MESAJ YOLA ÇIKAR", style: "title", x: 150, y: 150 }] });
  const second = VectorShot.parse({ background: "room", camera, layers: id === "paper-poster" ? [...layers, { asset: "packet", x: 1120, y: 530, height: 85, anims: [{ type: "move", start: 0, end: 0.3, toX: 1260 }] }] : layers, texts: [{ text: "SUNUCU İŞLER", style: "title", x: 150, y: 150 }] });
  const third = VectorShot.parse({ ...second, ...(id === "paper-poster" ? { layers: [...layers, { asset: "packet", x: 1260, y: 530, height: 85, anims: [{ type: "move", start: 0.1, end: 0.65, toX: 790 }] }] } : {}), texts: [{ text: id === "paper-poster" ? "YANIT GERİ DÖNER" : "AYNI SİSTEM, YENİ ADIM", style: "title", x: 150, y: 150 }] });
  const timeline = Timeline.parse({ episodeId: "style-craft-" + id, lang: "tr", fps: 30, width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080, durationInFrames: 240, palette: pack.palette, texture: pack.texture, lineStyle: pack.lineStyle, vectorAssets: assets,
    visuals: [
      { shotId: "s1-sh1", vector: first, fromFrame: 0, durationInFrames: 90 },
      { shotId: "s2-sh1", vector: second, fromFrame: 90, durationInFrames: 90, enter: id !== "paper-poster" },
      { shotId: "s3-sh1", vector: third, fromFrame: 180, durationInFrames: 60, enter: id !== "paper-poster", carried: carriedObjects(second, third) },
    ].map((v) => ({ ...v, stylePack: id, kind: "motion_graphic", assetUrl: "" })),
    audio: render ? [{ role: "voice", assetUrl: "silence.wav", fromFrame: 0, durationInFrames: 240 }] : [],
  });
  await writeFile(resolve(output, id + ".json"), JSON.stringify(timeline, null, 2));
  // Giriş, hareketin ortası, yerleşme ve geçiş sınırları; sondan başa seek de denenir.
  const frames = { end: 239, start: 1, travel: 45, before: 89, seam: 90, reveal: 117, settled: 145, carryBefore: 179, carry: 180, carryAfter: 188, revealAgain: 117 };
  const outDir = resolve(output, id); await mkdir(outDir, { recursive: true });
  console.log(await renderStills({ timeline, publicDir, frames, outDir, onWait: (pid) => console.log("Waiting for render " + pid) }));
  if (render) await renderEpisode({ timeline, publicDir, outputPath: resolve(output, id + ".mp4"), concurrency: 1, onWait: (pid) => console.log("Waiting for render " + pid) });
}
