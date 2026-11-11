import { editNarration, estimateEpisode, previewNarrationEdit, previewNarrationUndo, runStatusOf } from "@ys/pipeline/light";
import { msg } from "@ys/core/messages";
import { apiError, errorResponse } from "../../../../../lib/api";
import { episodeBusy, estimateContext, repo, store } from "../../../../../lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return apiError(req, msg("api.badEpisode"));
  try {
    const text = await req.text();
    if (text.length > 96_000) return apiError(req, msg("err.edit.invalid"));
    const input = JSON.parse(text) as { type?: unknown; sceneId?: unknown; narration?: unknown; editId?: unknown } | null;
    if (!input || !["preview", "undo-preview"].includes(input.type as string)) return apiError(req, msg("err.edit.invalid"));
    const state = await repo().load(id);
    if (await episodeBusy(id, state, runStatusOf(state).status)) return apiError(req, msg("api.busy"));
    if (input.type === "undo-preview") {
      if (typeof input.editId !== "string") return apiError(req, msg("err.edit.invalid"));
      const { before: _before, ...preview } = await previewNarrationUndo(store(), state, input.editId);
      return Response.json(preview, { headers: { "cache-control": "no-store" } });
    }
    if (typeof input.sceneId !== "string" || !input.sceneId || input.sceneId.length > 160 || typeof input.narration !== "string") return apiError(req, msg("err.edit.invalid"));
    const preview = previewNarrationEdit(state, input.sceneId, input.narration);
    const next = structuredClone(state); editNarration(next, input.sceneId, input.narration);
    const estimate = estimateEpisode(next, await estimateContext());
    const estimatedUsd = estimate.rows.filter((r) => preview.stages.includes(r.stage)).reduce((n, r) => n + r.costUsd, 0);
    return Response.json({ ...preview, estimatedUsd: estimate.warnings.length ? null : estimatedUsd }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(req, error); }
}
