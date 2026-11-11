"use client";
import { useEffect, useRef, useState } from "react";
import type { PronunciationImpact, pronunciationSettingsView } from "@ys/pipeline/light";
import { useI18n } from "../../locale-provider";
import { stageKey } from "./parts";

type View = ReturnType<typeof pronunciationSettingsView>;
type Scope = "episode" | "shared";
export function PronunciationPanel({ id, busy, version }: { id: string; busy: boolean; version: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false), [view, setView] = useState<View>(), [impact, setImpact] = useState<PronunciationImpact>(), [error, setError] = useState(""), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [refresh, setRefresh] = useState(0);
  const [written, setWritten] = useState(""), [spoken, setSpoken] = useState(""), [scope, setScope] = useState<Scope>("episode"), [base, setBase] = useState<Pick<View, "fingerprint" | "revision">>(), [offset, setOffset] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++; setImpact(undefined); setSaving(false);
    if (!open || busy) return;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000); let active = true;
    setLoading(true); setError(""); setImpact(undefined); setOffset(0);
    void fetch(`/api/episodes/${id}/pronunciations`, { cache: "no-store", signal: controller.signal }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? t("pronunciation.error")); if (active) setView(data);
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t("pronunciation.error")); }).finally(() => { if (active) setLoading(false); });
    return () => { generation.current++; active = false; clearTimeout(timer); controller.abort(); };
  }, [open, id, busy, version, refresh, t]);
  const post = async (body: Record<string, unknown>, preview = false): Promise<boolean> => {
    const request = generation.current;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/episodes/${id}/pronunciations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? t("pronunciation.error"));
      if (request !== generation.current) return false;
      if (preview) setImpact(data); else { setImpact(undefined); setRefresh((n) => n + 1); }
      return true;
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : t("pronunciation.error")); return false; }
    finally { if (request === generation.current) setSaving(false); }
  };
  const reset = () => { setWritten(""); setSpoken(""); setBase(undefined); };
  const bind = () => { if (!base && view) setBase({ fingerprint: view.fingerprint, revision: view.revision }); setImpact(undefined); };
  const locked = busy || saving || loading;
  const rules = view ? [...view.shared.map((e) => ({ ...e, scope: "shared" as const })), ...Object.entries(view.overrides).map(([written, spoken]) => ({ written, spoken, scope: "episode" as const }))] : [];
  return <section className="card min-w-0 space-y-3 p-4" aria-label={t("pronunciation.title")}>
    <button type="button" className="font-semibold underline underline-offset-4" aria-expanded={open} onClick={() => setOpen(!open)}>{t("pronunciation.title")}</button>
    {open && <>
      <p className="text-sm text-muted">{t("pronunciation.hint")}</p>
      {error && <p role="alert" className="break-words text-sm text-bad">{error}</p>}
      {(loading || busy) && <p>{t("common.loading")}</p>}
      <button type="button" className="btn-ghost" disabled={locked} onClick={() => setRefresh((n) => n + 1)}>{t("research.refresh")}</button>
      {view && <>
        <p className="text-xs text-muted">{t("pronunciation.revision", { lang: view.lang, revision: view.revision })}</p>
        {view.pending && <p className="text-sm">{t("pronunciation.pending", { scenes: view.pending.scenes.join(", ") })}</p>}
        <form className="grid min-w-0 gap-2 rounded-lg border border-line p-3" onSubmit={async (event) => { event.preventDefault(); if (await post({ type: "put", scope, written, spoken, ...base })) reset(); }}>
          <label className="text-sm">{t("pronunciation.scope")}<select className="field w-full" value={scope} disabled={locked} onChange={(e) => { bind(); setScope(e.target.value as Scope); }}><option value="episode">{t("pronunciation.origin.episode")}</option><option value="shared">{t("pronunciation.origin.shared")}</option></select></label>
          <label className="text-sm">{t("pronunciation.written")}<input className="field w-full" required maxLength={120} value={written} disabled={locked} onChange={(e) => { bind(); setWritten(e.target.value); }} /></label>
          <label className="text-sm">{t("pronunciation.spoken")}<input className="field w-full" required maxLength={240} value={spoken} disabled={locked} onChange={(e) => { bind(); setSpoken(e.target.value); }} /></label>
          <p className="text-xs text-muted">{t("pronunciation.scopeHint")}</p>
          <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={locked || !base || !written.trim() || !spoken.trim()}>{t("pronunciation.save")}</button><button type="button" className="btn-ghost" disabled={locked} onClick={reset}>{t("research.cancel")}</button></div>
        </form>
        {(written || spoken) && <p className="text-xs text-muted">{t("pronunciation.unsaved")}</p>}
        <ul className="space-y-2">{rules.map((entry) => <li key={`${entry.scope}:${entry.written}`} className="flex min-w-0 flex-wrap items-center gap-2 border-t border-line pt-2 text-sm"><span className="break-words">{entry.written} → {entry.spoken} · {t(`pronunciation.origin.${entry.scope}`)}</span><button type="button" className="btn-ghost" disabled={locked} onClick={() => { setWritten(entry.written); setSpoken(entry.spoken); setScope(entry.scope); setBase({ fingerprint: view.fingerprint, revision: view.revision }); setImpact(undefined); }}>{t("research.edit")}</button><button type="button" className="btn-ghost" disabled={locked} onClick={() => void post({ type: "remove", scope: entry.scope, written: entry.written, fingerprint: view.fingerprint, revision: view.revision })}>{t("pronunciation.remove")}</button></li>)}</ul>
        <details><summary className="cursor-pointer text-sm">{t("pronunciation.effective")}</summary><ul className="space-y-1 text-xs">{view.effective.slice(offset, offset + 30).map((entry) => <li key={entry.written} className="break-words">{entry.written} → {entry.spoken} · {t(`pronunciation.origin.${entry.origin}`)}</li>)}</ul><div className="flex gap-2"><button type="button" className="btn-ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>{t("quality.previous")}</button><button type="button" className="btn-ghost" disabled={offset + 30 >= view.effective.length} onClick={() => setOffset(offset + 30)}>{t("quality.next")}</button></div></details>
        <button type="button" className="btn-ghost" disabled={locked || Boolean(written || spoken)} onClick={() => void post({ type: "preview" }, true)}>{t("pronunciation.preview")}</button>
        {impact && <div className="min-w-0 space-y-2 rounded-lg border border-line p-3 text-sm">
          <p>{t("pronunciation.affected", { scenes: impact.affected.join(", ") || "—", retained: impact.retained.join(", ") || "—" })}</p>
          <p>{t("edit.stages")}: {impact.stages.map((stage) => t(stageKey(stage))).join(", ") || "—"}</p>
          <p className="text-xs text-muted">{t("pronunciation.applyHint")}</p>
          <ul className="max-h-80 space-y-2 overflow-auto">{impact.scenes.map((scene) => <li key={scene.sceneId} className="break-words border-t border-line pt-2"><p>{scene.sceneId} · {t(`pronunciation.status.${scene.status}`)}</p><p>{t("pronunciation.recorded")}: {scene.recorded ?? t("voiceAudit.unknown")}</p><p>{t("pronunciation.desired")}: {scene.spoken}</p><p className="text-xs text-muted">{scene.script}</p></li>)}</ul>
          <button type="button" className="btn-primary" disabled={locked || !impact.affected.length} onClick={() => void post({ type: "apply", fingerprint: impact.fingerprint, revision: impact.revision, rulesFingerprint: impact.rulesFingerprint })}>{t("pronunciation.apply")}</button>
        </div>}
      </>}
    </>}
  </section>;
}
