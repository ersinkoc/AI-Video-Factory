import { msg } from "@ys/core/messages";
import { errorResponse, textResponse } from "../../../../../lib/api";
import { repo, store } from "../../../../../lib/server";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return textResponse(req, msg("api.badEpisode"), 400);
  try {
    const state = await repo().load(id);
    const short = new URL(req.url).searchParams.has("short");
    const key = (short ? state.short : state.render)?.audit?.reportKey;
    if (!key || !key.startsWith(`episodes/${id}/render-audits/`) || !/^[a-z0-9-]+\.json$/.test(key.slice(`episodes/${id}/render-audits/`.length))) return textResponse(req, msg("api.notFound"), 404);
    const bytes = await store().get(key);
    if (!bytes) return textResponse(req, msg("api.notFound"), 404);
    return new Response(new Uint8Array(bytes), { headers: {
      "content-type": "application/json", "content-disposition": `attachment; filename="${id}${short ? '.short' : ''}.audit.json"`,
      "cache-control": "no-store", "x-content-type-options": "nosniff",
    } });
  } catch (error) {
    return errorResponse(req, error);
  }
}
