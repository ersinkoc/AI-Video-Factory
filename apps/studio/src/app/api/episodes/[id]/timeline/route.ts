import { msg } from "@ys/core/messages";
import { onScreen } from "@ys/pipeline/light";
import { apiError, errorResponse, isMissingEpisode, textResponse } from "../../../../../lib/api";
import { repo } from "../../../../../lib/server";

/**
 * Bölümün zaman çizelgesi, render'ın gördüğü haliyle (altyazı gömülmeyecekse altyazısız): Stüdyo oynatıcısı bölümü render
 * etmeden tarayıcıda oynatır. Gömülü SVG'lerle megabaytlar tutabilir; bölüm yanıtına konmaz, yalnız oynatıcı açılınca istenir.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return textResponse(req, msg("api.badEpisode"), 400);
  try {
    const state = await repo().load(id);
    if (!state.timeline) return apiError(req, msg("api.noTimeline"), 404);
    return Response.json(onScreen(state, state.timeline), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(req, e, isMissingEpisode(e) ? 404 : 500);
  }
}
