import { applyLineStyle, sanitizeSvg, stylePackOf } from "@ys/core";
import { msg } from "@ys/core/messages";
import { loadStyleSamples } from "@ys/pipeline/light";
import { textResponse } from "../../../../../lib/api";
import { store } from "../../../../../lib/server";

/**
 * Stil örneğinin SVG'si (yeni bölüm formunun galerisi): render'daki gibi temizlenir ve paketin çizgi stili uygulanır,
 * önizleme bölümde göreceğinle aynı olsun. Anahtar dizinden okunur (istemcinin verdiği yol kullanılmaz); `?v=` yalnız
 * önbellek içindir.
 */
export async function GET(req: Request, ctx: { params: Promise<{ pack: string }> }) {
  const { pack } = await ctx.params;
  const style = stylePackOf(pack);
  const kind = new URL(req.url).searchParams.get("kind");
  if (!style || (kind !== "character" && kind !== "background")) return textResponse(req, msg("api.notFound"), 404);
  const key = (await loadStyleSamples(store()))[pack]?.[kind];
  const bytes = key ? await store().get(key) : null;
  if (!bytes) return textResponse(req, msg("api.notFound"), 404);
  return new Response(applyLineStyle(sanitizeSvg(new TextDecoder().decode(bytes)), style.lineStyle), {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=86400",
      // Varlık yolundaki gibi: SVG doğrudan açılsa bile betik çalışmasın, dış kaynak yok.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
