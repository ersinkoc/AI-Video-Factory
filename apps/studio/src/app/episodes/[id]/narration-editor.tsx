"use client";
import { useEffect, useRef, useState } from "react";
import type { NarrationEditPreview } from "@ys/pipeline/light";
import { useI18n } from "../../locale-provider";
import { stageKey, type Act } from "./parts";

type Preview = NarrationEditPreview & { estimatedUsd: number | null };
type UndoPreview = { fingerprint: string; editId: string; sceneId: string; narration: string };

async function requestPreview(id: string, body: unknown, signal: AbortSignal) {
  const res = await fetch(`/api/episodes/${id}/edits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await res.json(); if (!res.ok) throw new Error(data.error);
  return data;
}

export function NarrationEditor({ id, sceneId, narration, disabled, act, onDirtyChange }: { id: string; sceneId: string; narration: string; disabled: boolean; act: Act; onDirtyChange?: (sceneId: string, dirty: boolean) => void }) {
  const { t, fmt } = useI18n();
  const [draft, setDraft] = useState(narration), [preview, setPreview] = useState<Preview>(), [pending, setPending] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), controller = useRef<AbortController | undefined>(undefined);
  const previousNarration = useRef(narration);
  useEffect(() => { onDirtyChange?.(sceneId, draft.trim() !== narration); }, [sceneId, draft, narration, onDirtyChange]);
  useEffect(() => {
    generation.current++; controller.current?.abort(); setPreview(undefined); setPending(false);
    // Başka bir oturum metni değiştirirse yerel taslak otomatik olarak ezilmez.
    const previous = previousNarration.current;
    setDraft((current) => current === previous ? narration : current);
    previousNarration.current = narration;
  }, [narration, disabled]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  const inspect = async () => {
    const request = ++generation.current; controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 30_000); setPending(true); setError("");
    try {
      const result = await requestPreview(id, { type: "preview", sceneId, narration: draft }, abort.signal) as Preview;
      if (request === generation.current) setPreview(result);
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : t("edit.error")); }
    finally { clearTimeout(timer); if (request === generation.current) setPending(false); }
  };
  const apply = async (review: Preview) => {
    setPending(true); setError("");
    try {
      if (await act({ type: "edit-narration", sceneId, narration: review.after, fingerprint: review.fingerprint })) setPreview(undefined);
      else setError(t("edit.recheck"));
    } catch { setError(t("edit.error"));
    } finally { setPending(false); }
  };
  return <div className="min-w-0 space-y-2">
    <textarea aria-label={t("edit.narration", { scene: sceneId })} className="field min-h-24 w-full leading-relaxed" rows={Math.min(8, Math.ceil(draft.length / 110) + 1)} maxLength={20_000} value={draft} disabled={disabled || pending} onChange={(e) => { generation.current++; controller.current?.abort(); setDraft(e.target.value); setPreview(undefined); setError(""); }} />
    {!disabled && <div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={pending || draft.trim() === narration || !draft.trim()} onClick={() => void inspect()}>{t("edit.preview")}</button>{draft !== narration && <button type="button" className="btn-ghost" disabled={pending} onClick={() => { setDraft(narration); setPreview(undefined); setError(""); }}>{t("edit.reset")}</button>}</div>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    {preview && !disabled && <div className="space-y-2 rounded-lg border border-line p-3 text-sm" aria-label={t("edit.impact")}>
      <h4 className="font-semibold">{t("edit.impact")}</h4>
      <p>{t("edit.voice", { changed: preview.regenerateVoice.join(", ") || "—", kept: preview.retainedVoice.join(", ") || "—" })}</p>
      <p>{t("edit.timing", { scenes: preview.timingScenes.join(", ") || "—" })}</p>
      <p>{t("edit.shots", { shots: preview.relatedShots.join(", ") || "—" })}</p>
      <p>{t("edit.stages")}: {preview.stages.map((s) => t(stageKey(s))).join(", ") || "—"}</p>
      <p>{t("edit.reuse", { count: preview.retainedCharacters.length })}</p>
      {Boolean(preview.archiveChoices.length) && <p>{t("edit.archives", { shots: preview.archiveChoices.join(", ") })}</p>}
      <p>{t("edit.estimate", { amount: preview.estimatedUsd === null ? t("edit.unknown") : fmt.usd(preview.estimatedUsd) })}</p>
      <p className="text-xs text-muted">{t("edit.limit")}</p>
      <button type="button" className="btn-primary" disabled={pending || !preview.changed} onClick={() => void apply(preview)}>{t("edit.apply")}</button>
    </div>}
  </div>;
}

export function NarrationUndo({ id, editId, busy, act }: { id: string; editId: string; busy: boolean; act: Act }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<UndoPreview>(), [pending, setPending] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => { generation.current++; controller.current?.abort(); setPreview(undefined); setPending(false); return () => { generation.current++; controller.current?.abort(); }; }, [editId, busy]);
  const inspect = async () => {
    const request = ++generation.current, abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 30_000); setPending(true); setError("");
    try { const result = await requestPreview(id, { type: "undo-preview", editId }, abort.signal); if (request === generation.current) setPreview(result); }
    catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : t("edit.error")); }
    finally { clearTimeout(timer); if (request === generation.current) setPending(false); }
  };
  return <section className="space-y-2 rounded-lg border border-line p-3 text-sm">
    <button type="button" className="btn-ghost" disabled={busy || pending} onClick={() => void inspect()}>{t("edit.undoPreview")}</button>
    {error && <p role="alert" className="text-bad">{error}</p>}
    {preview && !busy && <><p>{t("edit.undoHint", { scene: preview.sceneId })}</p><blockquote className="whitespace-pre-wrap break-words">{preview.narration}</blockquote><button type="button" className="btn-primary" disabled={pending} onClick={async () => { setPending(true); try { if (await act({ type: "undo-narration-edit", editId, fingerprint: preview.fingerprint })) setPreview(undefined); else setError(t("edit.recheck")); } finally { setPending(false); } }}>{t("edit.undoApply")}</button></>}
  </section>;
}
