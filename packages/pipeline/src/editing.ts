import { createHash, randomUUID } from "node:crypto";
import { LocalizedError, msg } from "@ys/core";
import { getJson, putJson, type AssetStore } from "@ys/storage";
import { editNarration, type EpisodeRepo } from "./actions.ts";
import { acquireLock } from "./lock.ts";
import { STAGES, type EpisodeState } from "./state.ts";

export const episodeFingerprint = (state: EpisodeState): string => createHash("sha256").update(JSON.stringify(state)).digest("hex");
const editKey = (id: string, editId: string) => `episodes/${id}/edits/${editId}.json`;
type Repo = Pick<EpisodeRepo, "load" | "save">;
interface Revision { version: 1; episodeId: string; id: string; sceneId: string; at: string; before: EpisodeState; beforeFingerprint: string; afterFingerprint: string }

/** Etki, uygulamanın kullandığı düzenleme işlevini kopya üzerinde çalıştırarak hesaplanır. */
export function previewNarrationEdit(state: EpisodeState, sceneId: string, narration: string) {
  const next = structuredClone(state);
  editNarration(next, sceneId, narration);
  const index = state.script!.scenes.findIndex((s) => s.id === sceneId);
  const before = state.script!.scenes[index]!.narration, after = next.script!.scenes[index]!.narration;
  const changed = before !== after;
  return {
    fingerprint: episodeFingerprint(state), sceneId, before, after, changed,
    stages: changed ? STAGES.slice(STAGES.indexOf("voice")) : [],
    clearedStages: STAGES.filter((s) => state.done[s] && !next.done[s]),
    regenerateVoice: changed ? [sceneId] : [],
    retainedVoice: Object.keys(next.voice ?? {}).filter((id) => state.script!.scenes.some((s) => s.id === id)),
    timingScenes: changed ? state.script!.scenes.slice(index).map((s) => s.id) : [],
    relatedShots: changed ? (state.shots ?? []).filter((s) => s.sceneId === sceneId).map((s) => s.id) : [],
    archiveChoices: changed ? Object.keys(state.archives ?? {}) : [],
    retainedCharacters: Object.keys(state.concept?.selected ?? {}),
    retainedExport: state.render?.exportId ?? state.render?.at,
  };
}
export type NarrationEditPreview = ReturnType<typeof previewNarrationEdit>;

/** Eski API istemcileri için parmak izi isteğe bağlıdır; yeni Studio akışı her zaman gönderir. */
export async function saveNarrationEdit(opts: { id: string; store: AssetStore; repo: Repo; sceneId: string; narration: string; fingerprint?: string }) {
  const release = await acquireLock(opts.store, opts.id);
  try {
    const state = await opts.repo.load(opts.id);
    const preview = previewNarrationEdit(state, opts.sceneId, opts.narration);
    if (opts.fingerprint !== undefined && preview.fingerprint !== opts.fingerprint) throw new LocalizedError(msg("err.edit.changed"));
    if (!preview.changed) return;
    const next = structuredClone(state), id = randomUUID(), at = new Date().toISOString();
    editNarration(next, opts.sceneId, opts.narration);
    next.narrationEdit = { id, at };
    const record: Revision = { version: 1, episodeId: opts.id, id, sceneId: opts.sceneId, at, before: state, beforeFingerprint: preview.fingerprint, afterFingerprint: episodeFingerprint(next) };
    // Önce geri alma kaydı yazılır; durum kaydı düşerse eski bölüm olduğu gibi kalır.
    await putJson(opts.store, editKey(opts.id, id), record);
    await opts.repo.save(next);
  } finally { await release(); }
}

export async function previewNarrationUndo(store: AssetStore, state: EpisodeState, editId: string) {
  if (!/^[a-f0-9-]{36}$/.test(editId) || state.narrationEdit?.id !== editId) throw new LocalizedError(msg("err.edit.undo"));
  const record = await getJson<Revision>(store, editKey(state.id, editId));
  if (!record || record.version !== 1 || record.id !== editId || record.episodeId !== state.id || record.before?.id !== state.id || episodeFingerprint(record.before) !== record.beforeFingerprint || episodeFingerprint(state) !== record.afterFingerprint) throw new LocalizedError(msg("err.edit.undo"));
  return { fingerprint: record.afterFingerprint, editId, sceneId: record.sceneId, narration: record.before.script?.scenes.find((s) => s.id === record.sceneId)?.narration ?? "", before: record.before };
}

export async function undoNarrationEdit(opts: { id: string; store: AssetStore; repo: Repo; editId: string; fingerprint: string }) {
  const release = await acquireLock(opts.store, opts.id);
  try {
    const state = await opts.repo.load(opts.id);
    if (episodeFingerprint(state) !== opts.fingerprint) throw new LocalizedError(msg("err.edit.changed"));
    const undo = await previewNarrationUndo(opts.store, state, opts.editId);
    await opts.repo.save(undo.before);
  } finally { await release(); }
}
