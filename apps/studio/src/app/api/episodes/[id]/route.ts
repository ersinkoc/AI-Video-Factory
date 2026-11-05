import { rm } from "node:fs/promises";
import { msg } from "@ys/core/messages";
import { groupCosts } from "@ys/media-gateway";
import { deleteEpisode, estimateEpisode, lineStyleOf, listLibraryCharacters, motionModeOf, progressOf, runStatusOf, type MotionMode } from "@ys/pipeline/light";
import { apiError, errorResponse, textResponse } from "../../../../lib/api";
import { episodeBusy, episodeSpentUsd, estimateContext, forgetJob, getJob, ledgerEntries, quotaOf, repo, store, workDirOf } from "../../../../lib/server";
import type { EpisodeResponse, QuotaView } from "../../../../lib/types";

const MODES: MotionMode[] = ["animated", "mixed", "still", "vector"];
const EPISODE_ID = /^[a-z0-9][a-z0-9-]{0,120}$/;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!EPISODE_ID.test(id)) return textResponse(req, msg("api.badEpisode"), 400);
  try {
    const [state, entries, estimateCtx] = await Promise.all([repo().load(id), ledgerEntries(id), estimateContext()]);
    const estimates = Object.fromEntries(MODES.map((m) => [m, estimateEpisode(state, estimateCtx, m)])) as EpisodeResponse["estimates"];

    // Ses henüz bitmediyse kullanılacak sağlayıcının kotası yetiyor mu?
    let quota: QuotaView | null = null;
    if (!state.done.voice) {
      const row = estimates[motionModeOf(state.input)].rows.find((r) => r.stage === "voice");
      const providerId = state.voiceProviderId ?? row?.providerId;
      const q = providerId ? await quotaOf(providerId) : undefined;
      if (providerId && q && row) {
        const voiced = new Set(Object.keys(state.voice ?? {}));
        const needed =
          state.script?.scenes.filter((s) => !voiced.has(s.id)).reduce((n, s) => n + s.narration.length, 0) ?? row.quantity;
        quota = { providerId, quota: q, needed };
      }
    }

    const status = runStatusOf(state);
    // Pipeline'ı bitmiş ama süreci kapanmamış iş (ölü iş) burada da temizlenir: aksi halde "devam" düğmesi kilitli kalır.
    if (getJob(id)?.status === "running") await episodeBusy(id, state, status.status);
    const job = getJob(id) ?? null;
    // Stüdyo'nun başlattığı süreç yaşıyorsa (ör. uzun bir ajan çağrısında) takılmış sayılmaz.
    if (job?.status === "running" && status.status === "stalled" && (await episodeBusy(id, state, "stalled"))) status.status = "running";
    // İptal edilen/çöken Stüdyo işi aşamayı kapatamadı: dosyadaki "sürüyor" bayat, kullanıcı devam ettirebilsin.
    // Kilidin sahibi yaşıyorsa (uzun bir ajan çağrısı) "takıldı" değil; ölmüşse "sürüyor" bayat (iptal, çökme).
    if (status.status === "stalled" && (await episodeBusy(id, state, "stalled"))) status.status = "running";
    else if (status.status === "running" && !(await episodeBusy(id, state, "running"))) status.status = job?.status === "error" ? "error" : "idle";
    // Konsept sekmesinde "Kütüphaneden kullan": aynı stil ve çizgi stilindeki onaylı karakterler.
    const library =
      motionModeOf(state.input) === "vector" && state.style && state.cast && !state.approvals?.concept
        ? await listLibraryCharacters(store(), { artStyle: state.style.artStyle, lineStyle: lineStyleOf(state), realism: state.input.realism !== false })
        : [];
    const body: EpisodeResponse = {
      state,
      library,
      job,
      status,
      spentUsd: await episodeSpentUsd(id),
      claudeUsd: entries.filter((e) => e.capability === "llm" && !e.cacheHit).reduce((n, e) => n + e.estimateMicros, 0) / 1_000_000,
      estimates,
      actual: {
        byStage: groupCosts(entries, (e) => e.stage ?? "—"),
        byProvider: groupCosts(entries, (e) => e.providerId),
      },
      progress: progressOf(state) ?? null,
      quota,
    };
    return Response.json(body);
  } catch (e) {
    return errorResponse(req, e, 404);
  }
}

/**
 * Bölümü siler (yarım kalmış ya da bitmiş): önce render klasörü (video, Short, kareler, render önbelleği), sonra
 * depodaki dosyaları. İş sürerken (Stüdyo işi ya da CLI kilidi) silinmez: çalışan süreç durumu bellekten yeniden yazardı.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!EPISODE_ID.test(id)) return apiError(req, msg("api.badEpisode"));
  let state;
  try {
    state = await repo().load(id);
  } catch (e) {
    return errorResponse(req, e, 404);
  }
  try {
    if (await episodeBusy(id, state, runStatusOf(state).status)) return apiError(req, msg("api.busy"), 409);
    forgetJob(id);
    await rm(workDirOf(id), { recursive: true, force: true });
    await deleteEpisode(store(), id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(req, e, 500);
  }
}
