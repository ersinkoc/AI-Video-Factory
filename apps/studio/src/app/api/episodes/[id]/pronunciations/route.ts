import { applyPronunciationImpact, loadPronunciationBook, mutateEpisodePronunciation, mutateSharedPronunciations, pronunciationLanguage, pronunciationSettingsView, previewPronunciationImpact, runStatusOf } from "@ys/pipeline/light";
import { msg } from "@ys/core/messages";
import { apiError, errorResponse } from "../../../../../lib/api";
import { episodeBusy, repo, store } from "../../../../../lib/server";

const validId = (id: string) => /^[a-z0-9][a-z0-9-]{0,120}$/.test(id);
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!validId(id)) return apiError(req, msg("api.badEpisode"));
  try { return Response.json(pronunciationSettingsView(await repo().load(id), await loadPronunciationBook(store())), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return errorResponse(req, error); }
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!validId(id)) return apiError(req, msg("api.badEpisode"));
  try {
    const text = await req.text(); if (text.length > 4096) return apiError(req, msg("err.pronunciation.invalid"));
    const input = JSON.parse(text) as { type?: unknown; scope?: unknown; written?: unknown; spoken?: unknown; fingerprint?: unknown; revision?: unknown; rulesFingerprint?: unknown } | null;
    if (!input) return apiError(req, msg("err.pronunciation.invalid"));
    const state = await repo().load(id);
    if (await episodeBusy(id, state, runStatusOf(state).status)) return apiError(req, msg("api.busy"));
    if (input.type === "preview") return Response.json(previewPronunciationImpact(state, await loadPronunciationBook(store())), { headers: { "cache-control": "no-store" } });
    if (input.type === "apply") {
      if (typeof input.fingerprint !== "string" || typeof input.rulesFingerprint !== "string" || !Number.isSafeInteger(input.revision)) return apiError(req, msg("err.pronunciation.invalid"));
      await applyPronunciationImpact({ id, store: store(), repo: repo(), fingerprint: input.fingerprint, revision: input.revision as number, rulesFingerprint: input.rulesFingerprint });
    } else {
      if (!["put", "remove"].includes(input.type as string) || !["shared", "episode"].includes(input.scope as string)) return apiError(req, msg("err.pronunciation.invalid"));
      const lang = pronunciationLanguage(state.input.lang);
      const mutation = input.type === "put" ? { type: "put", entry: { lang, written: input.written, spoken: input.spoken } } : { type: "remove", lang, written: input.written };
      if (input.scope === "shared") {
        if (!Number.isSafeInteger(input.revision)) return apiError(req, msg("err.pronunciation.invalid"));
        await mutateSharedPronunciations(store(), input.revision as number, mutation);
      } else {
        if (typeof input.fingerprint !== "string") return apiError(req, msg("err.pronunciation.invalid"));
        await mutateEpisodePronunciation({ id, store: store(), repo: repo(), fingerprint: input.fingerprint, mutation });
      }
    }
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(req, error); }
}
