import { msg } from "@ys/core/messages";
import { errorResponse, textResponse } from "../../../../../lib/api";
import { repo, store } from "../../../../../lib/server";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return textResponse(req, msg("api.badEpisode"), 400);
  try {
    const key = (await repo().load(id)).render?.styleComparison?.reportKey;
    const prefix = `episodes/${id}/style-comparisons/`;
    if (!key?.startsWith(prefix) || !/^[a-z0-9-]+\.json$/.test(key.slice(prefix.length))) return textResponse(req, msg("api.notFound"), 404);
    const bytes = await store().get(key);
    if (!bytes) return textResponse(req, msg("api.notFound"), 404);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${id}.style-comparison.json"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (e) { return errorResponse(req, e); }
}
