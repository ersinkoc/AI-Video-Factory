import { loadResearch, mutateResearch, readResearchExport, researchView } from "@ys/pipeline/light";
import { msg } from "@ys/core/messages";
import { apiError, errorResponse } from "../../../../../lib/api";
import { repo, store } from "../../../../../lib/server";

const validId = (id: string) => /^[a-z0-9][a-z0-9-]{0,120}$/.test(id);
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!validId(id)) return apiError(req, msg("api.badEpisode"));
  try {
    const state = await repo().load(id);
    if (new URL(req.url).searchParams.has("render")) {
      const summary = state.render?.research;
      const prefix = `episodes/${id}/research/exports/`;
      if (!summary || !summary.reportKey.startsWith(prefix) || !/^[a-z0-9-]+\.json$/.test(summary.reportKey.slice(prefix.length))) return apiError(req, msg("api.notFound"), 404);
      return Response.json(await readResearchExport(store(), state), { headers: { "content-disposition": `attachment; filename="${id}.research.json"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }
    return Response.json(researchView(await loadResearch(store(), id), state), { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(req, error); }
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!validId(id)) return apiError(req, msg("api.badEpisode"));
  try {
    const text = await req.text();
    if (text.length > 32_768) return apiError(req, msg("err.research.invalid"));
    const input = JSON.parse(text) as { expectedRevision?: unknown; mutation?: unknown };
    if (!input || !Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 0) return apiError(req, msg("err.research.invalid"));
    await mutateResearch({ id, store: store(), load: () => repo().load(id), expectedRevision: input.expectedRevision as number, mutation: input.mutation });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(req, error); }
}
