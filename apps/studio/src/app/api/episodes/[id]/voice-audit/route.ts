import { readVoiceAudit } from "@ys/pipeline/light";
import { msg } from "@ys/core/messages";
import { apiError, errorResponse } from "../../../../../lib/api";
import { repo, store } from "../../../../../lib/server";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return apiError(req, msg("api.badEpisode"));
  try {
    const state = await repo().load(id), evidence = await readVoiceAudit(store(), state);
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (new URL(req.url).searchParams.has("download")) {
      if (!evidence) return apiError(req, msg("api.notFound"), 404);
      return Response.json(evidence, { headers: { ...headers, "content-disposition": `attachment; filename="${id}.voice-audit.json"` } });
    }
    return Response.json({ summary: state.voiceAudit ?? null, evidence: evidence ?? null }, { headers });
  } catch (error) { return errorResponse(req, error); }
}
