import { decideQuality, qualityView, type QualityStatus } from "@ys/pipeline/light";
import { msg } from "@ys/core/messages";
import { apiError, errorResponse } from "../../../../../lib/api";
import { repo, store } from "../../../../../lib/server";

const validId = (id: string) => /^[a-z0-9][a-z0-9-]{0,120}$/.test(id);
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!validId(id)) return apiError(req, msg("api.badEpisode"));
  try {
    const query = new URL(req.url).searchParams, offset = Number(query.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid issue offset");
    const view = await qualityView(await repo().load(id), store());
    const filtered = view.issues.filter((issue) => (["target", "source", "status"] as const).every((key) => !query.get(key) || query.get(key) === issue[key]));
    return Response.json({ issues: filtered.slice(offset, offset + 50), total: filtered.length, offset, notices: view.notices, historicalDecisions: view.historicalDecisions }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(req, error); }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!validId(id)) return apiError(req, msg("api.badEpisode"));
  try {
    const body = await req.text();
    if (body.length > 4096) throw new Error("Quality decision is too large");
    const input = JSON.parse(body) as { issueKey?: unknown; exportId?: unknown; status?: unknown };
    if (!input || typeof input.issueKey !== "string" || typeof input.exportId !== "string" || input.exportId.length > 128 || typeof input.status !== "string") throw new Error("Invalid quality decision");
    await decideQuality({ id, store: store(), load: () => repo().load(id), issueKey: input.issueKey, exportId: input.exportId, status: input.status as QualityStatus });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(req, error); }
}
