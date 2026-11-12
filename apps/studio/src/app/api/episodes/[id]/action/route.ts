import {
  acquireLock,
  saveNarrationEdit,
  undoNarrationEdit,
  setArchiveShot,
  runStatusOf,
  setSeries,
  reuseCharacter,
  acceptAsset,
  approve,
  rejectAsset,
  setCaptions,
  setSfx,
  setMusic,
  setShort,
  setRealism,
  changeVoice,
  redrawShots,
  replanShots,
  revokeApproval,
  selectCandidate,
  setMotion,
  type MotionMode,
} from "@ys/pipeline/light";
import { importArchiveImage } from "@ys/pipeline/archive";
import { LocalizedError, msg } from "@ys/core/messages";
import { apiError, errorResponse, readJson } from "../../../../../lib/api";
import { cancelJob, episodeBusy, getJob, repo, startJob, store } from "../../../../../lib/server";

const EPISODE_ID = /^[a-z0-9][a-z0-9-]{0,120}$/;
const MOTION_MODES: MotionMode[] = ["animated", "mixed", "still", "vector"];

export type StudioAction =
  | { type: "generate-script" }
  | { type: "rewrite-script" }
  | { type: "edit-narration"; sceneId: string; narration: string; fingerprint?: string }
  | { type: "undo-narration-edit"; editId: string; fingerprint: string }
  | { type: "approve-script" }
  | { type: "revoke-script" }
  | { type: "select"; entityId: string; index: number }
  | { type: "regenerate-concept" }
  | { type: "preview" }
  | { type: "set-motion"; motionMode: MotionMode; aiClipRatio?: number }
  | { type: "approve-concept" }
  | { type: "approve-preview" }
  | { type: "change-voice"; voiceId: string }
  | { type: "redraw"; shotIds: string[] }
  | { type: "replan"; shotIds: string[]; note: string }
  | { type: "resume" }
  | { type: "audit-render"; target?: "main" | "short" }
  | { type: "audit-voice" }
  | { type: "compare-style" }
  | { type: "use-archive"; shotId: string; candidateId: string }
  | { type: "remove-archive"; shotId: string }
  | { type: "accept-asset"; key: string }
  | { type: "reject-asset"; key: string; note?: string }
  | { type: "set-realism"; enabled: boolean }
  | { type: "set-captions"; enabled: boolean }
  | { type: "set-sfx"; enabled: boolean }
  | { type: "set-music"; enabled: boolean }
  | { type: "set-short"; enabled: boolean }
  | { type: "reuse-character"; castId: string; key: string }
  | { type: "set-series"; series?: string }
  | { type: "cancel" };

/** Stüdyodaki her insan kararı ve iş başlatma buradan geçer. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!EPISODE_ID.test(id)) return apiError(req, msg("api.badEpisode"));
  const episodes = repo();

  try {
    const action = await readJson<StudioAction>(req);
    // Çalışan iş (Stüdyo'nun ya da CLI'ın) durum dosyasını bellekteki kopyasıyla yeniden yazar: araya giren her
    // değişiklik kaybolur ya da işin ilerlemesini siler. İptal dışında hiçbir eylem iş sürerken yapılmaz.
    if (action.type !== "cancel") {
      const state = await episodes.load(id);
      if (await episodeBusy(id, state, runStatusOf(state).status)) throw new LocalizedError(msg("api.busy"));
    }
    switch (action.type) {
      case "generate-script":
        startJob(id, "job.script", ["episode", "run", id, "--until", "script"]);
        break;
      case "rewrite-script":
        startJob(id, "job.rewriteScript", ["episode", "rewrite-script", id]);
        break;
      case "edit-narration":
        await saveNarrationEdit({ id, store: store(), repo: episodes, sceneId: action.sceneId, narration: action.narration, fingerprint: action.fingerprint });
        break;
      case "undo-narration-edit":
        await undoNarrationEdit({ id, store: store(), repo: episodes, editId: action.editId, fingerprint: action.fingerprint });
        break;
      case "approve-script":
        await episodes.update(id, (s) => approve(s, "script"));
        startJob(id, "job.concept", ["episode", "run", id, "--until", "concept"]);
        break;
      case "revoke-script":
        await episodes.update(id, (s) => revokeApproval(s, "script"));
        break;
      case "select":
        await episodes.update(id, (s) => selectCandidate(s, action.entityId, action.index));
        break;
      case "regenerate-concept":
        startJob(id, "job.regenerate", ["episode", "run", id, "--only", "concept"]);
        break;
      case "preview":
        startJob(id, "job.preview", ["episode", "preview", id]);
        break;
      case "set-motion":
        if (!MOTION_MODES.includes(action.motionMode)) throw new LocalizedError(msg("api.badMotion"));
        await episodes.update(id, (s) => setMotion(s, action.motionMode, action.aiClipRatio));
        break;
      case "approve-concept":
        await episodes.update(id, (s) => approve(s, "concept"));
        startJob(id, "job.produce", ["episode", "run", id]);
        break;
      case "approve-preview":
        await episodes.update(id, (s) => approve(s, "preview"));
        startJob(id, "job.render", ["episode", "run", id]);
        break;
      case "change-voice":
        await episodes.update(id, (s) => changeVoice(s, action.voiceId));
        break;
      case "redraw":
        await episodes.update(id, (s) => redrawShots(s, action.shotIds));
        startJob(id, "job.redraw", ["episode", "run", id]);
        break;
      case "replan":
        await episodes.update(id, (s) => replanShots(s, Array.isArray(action.shotIds) ? action.shotIds : [], typeof action.note === "string" ? action.note : ""));
        startJob(id, "job.replan", ["episode", "run", id]);
        break;
      case "accept-asset":
      case "reject-asset": {
        const release = await acquireLock(store(), id);
        try {
          const s = await episodes.load(id);
          if (action.type === "accept-asset") await acceptAsset(store(), s, action.key);
          else await rejectAsset(store(), s, action.key, action.note);
          await episodes.save(s);
        } finally { await release(); }
        break;
      }
      case "reuse-character": {
        const release = await acquireLock(store(), id);
        try {
          const s = await episodes.load(id);
          await reuseCharacter(store(), s, action.castId, action.key);
          await episodes.save(s);
        } finally { await release(); }
        break;
      }
      case "set-series":
        await episodes.update(id, (s) => setSeries(s, typeof action.series === "string" ? action.series : undefined));
        break;
      case "set-realism":
        await episodes.update(id, (s) => setRealism(s, action.enabled));
        break;
      case "set-captions":
        await episodes.update(id, (s) => setCaptions(s, action.enabled === true));
        break;
      case "set-sfx":
        await episodes.update(id, (s) => setSfx(s, action.enabled === true));
        break;
      case "set-music":
        await episodes.update(id, (s) => setMusic(s, action.enabled === true));
        break;
      case "set-short":
        await episodes.update(id, (s) => setShort(s, action.enabled === true));
        break;
      case "resume":
        startJob(id, "job.resume", ["episode", "run", id]);
        break;
      case "use-archive":
      case "remove-archive": {
        const release = await acquireLock(store(), id);
        try {
          const state = await episodes.load(id);
          if (!state.shots?.some((s) => s.id === action.shotId)) throw new LocalizedError(msg("err.action.noShots"));
          const image = action.type === "use-archive" ? await importArchiveImage(action.candidateId, { store: store() }) : undefined;
          setArchiveShot(state, action.shotId, image);
          await episodes.save(state);
        } finally { await release().catch(() => {}); }
        break;
      }
      case "audit-render": {
        const state = await episodes.load(id);
        if (action.target !== undefined && action.target !== "main" && action.target !== "short") throw new LocalizedError(msg("api.badAction", { type: "audit target" }));
        if (action.target === "short" ? !state.short : !state.render || (!state.render.auditRanges?.length && !state.timeline)) throw new LocalizedError(msg("err.missing", { what: action.target === "short" ? "short" : "timeline/render" }));
        startJob(id, "job.audit", ["episode", "audit", id, ...(action.target === "short" ? ["--short"] : [])]);
        break;
      }
      case "audit-voice":
        startJob(id, "job.voiceAudit", ["episode", "audit-voice", id]);
        break;
      case "compare-style": {
        const state = await episodes.load(id);
        if (!state.render?.styleReference || !state.render.styleSampling) throw new LocalizedError(msg("err.missing", { what: "render/style reference" }));
        startJob(id, "job.compareStyle", ["episode", "compare-style", id]);
        break;
      }
      case "cancel":
        cancelJob(id);
        break;
      default:
        throw new LocalizedError(msg("api.badAction", { type: String((action as { type?: unknown }).type) }));
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(req, e);
  }
}
