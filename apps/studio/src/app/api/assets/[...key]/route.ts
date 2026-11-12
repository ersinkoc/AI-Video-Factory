import { msg } from "@ys/core/messages";
import { textResponse } from "../../../../lib/api";
import { typographyFile } from "../../../../lib/fonts";
import { store } from "../../../../lib/server";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  svg: "image/svg+xml",
  woff: "font/woff",
};

/** Üretilmiş varlıkların bulunduğu kökler: görsel/ses üretimleri ve vektör kütüphanesi. */
const ROOTS = new Set(["assets", "library"]);
/** Render'ın public/ klasörüne kopyaladığı yazı tipleri (stageTypography); oynatıcı için paketinden sunulur. */
const FONTS = "typography";

/**
 * Depodaki üretilmiş varlıkları sunar. Anahtarlar içerik hash'li olduğu için kalıcı önbelleklenebilir. Stüdyo oynatıcısı
 * zaman çizelgesindeki yolları (depo anahtarları ve yazı tipleri) buradan okur; ses ve klipte ileri sarma için Range desteklenir.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const root = key[0] ?? "";
  // Kodlanmış eğik çizgi (%2F) bir parçaya "../episodes/…" sokabiliyordu: parçada ayraç ve nokta ile başlama yasak.
  if ((!ROOTS.has(root) && root !== FONTS) || key.some((k) => !k || k.startsWith(".") || /[\\/\0]/.test(k))) {
    return textResponse(req, msg("api.forbidden"), 403);
  }
  const bytes = root === FONTS ? await typographyFile(key.join("/")) : await store().get(key.join("/"));
  if (!bytes) return textResponse(req, msg("api.notFound"), 404);
  // Yukarıdaki denetim en az bir dolu parça garanti eder; "" yalnız tip için (ulaşılamaz).
  /* v8 ignore next */
  const ext = key.at(-1)?.split(".").pop()?.toLowerCase() ?? "";
  const headers = {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    // Model üretimi SVG doğrudan açılsa bile betik çalışmasın: belge kum havuzunda, dış kaynak yok.
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "x-content-type-options": "nosniff",
  };
  const size = bytes.byteLength;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!range || (!range[1] && !range[2])) return new Response(new Uint8Array(bytes), { headers });
  // "bytes=-500" son 500 bayt demektir; boyut dışı aralık 416.
  const suffix = !range[1];
  const start = suffix ? Math.max(0, size - Number(range[2])) : Number(range[1]);
  const end = suffix || !range[2] ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
    status: 206,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}` },
  });
}
