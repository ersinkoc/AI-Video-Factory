import { msg } from "@ys/core/messages";
import { errorResponse, textResponse } from "../../../../../lib/api";
import { repo } from "../../../../../lib/server";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return textResponse(req, msg("api.badEpisode"), 400);
  try {
    const state = await repo().load(id);
    if (!state.render?.archiveSources?.length) return textResponse(req, msg("api.notFound"), 404);
    return Response.json({ renderedAt: state.render.at, images: state.render.archiveSources }, { headers: {
      "content-disposition": `attachment; filename="${id}.sources.json"`, "cache-control": "no-store", "x-content-type-options": "nosniff",
    } });
  } catch (error) { return errorResponse(req, error); }
}
