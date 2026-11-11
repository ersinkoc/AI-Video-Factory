"use client";
import { useEffect, useState } from "react";
import type { VoiceAuditReport, VoiceAuditSummary } from "@ys/pipeline/light";
import type { EpisodeResponse } from "../../../lib/types";
import { useI18n } from "../../locale-provider";
import { asset, type Act } from "./parts";

interface View { summary: VoiceAuditSummary | null; evidence: { report: VoiceAuditReport; current: boolean; reasons: string[] } | null }
export function VoiceAuditCard({ state, busy, act }: { state: EpisodeResponse["state"]; busy: boolean; act: Act }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false), [view, setView] = useState<View>(), [loading, setLoading] = useState(false), [error, setError] = useState(""), [refresh, setRefresh] = useState(0), [offset, setOffset] = useState(0);
  const version = JSON.stringify([state.voiceAudit, state.script?.scenes.map((s) => [s.id, s.narration]), state.voice]);
  useEffect(() => {
    if (!open || busy) return;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000); let active = true;
    setLoading(true); setView(undefined); setError(""); setOffset(0);
    void fetch(`/api/episodes/${state.id}/voice-audit`, { cache: "no-store", signal: controller.signal }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? t("voiceAudit.error")); if (active) setView(data);
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t("voiceAudit.error")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [open, state.id, busy, version, refresh, t]);
  const scenes = view?.evidence?.report.scenes ?? [];
  return <section className="card min-w-0 space-y-3 p-4" aria-label={t("voiceAudit.title")}>
    <button type="button" className="font-semibold underline underline-offset-4" aria-expanded={open} onClick={() => setOpen(!open)}>{t("voiceAudit.title")}</button>
    {open && <>
      <p className="text-sm text-muted">{t("voiceAudit.hint")}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={busy || loading || !state.script} onClick={() => void act({ type: "audit-voice" })}>{t("voiceAudit.run")}</button><button type="button" className="btn-ghost" disabled={busy || loading} onClick={() => setRefresh((n) => n + 1)}>{t("research.refresh")}</button></div>
      {error && <p role="alert" className="break-words text-sm text-bad">{error}</p>}
      {(loading || busy) ? <p>{t("common.loading")}</p> : view && <>
        {!view.summary ? <p className="text-sm">{t("voiceAudit.absent")}</p> : <p className="text-sm">{t(`voiceAudit.status.${view.summary.status}`)} · {t("voiceAudit.count", { scenes: view.summary.scenes, findings: view.summary.findingsCount })}</p>}
        {view.summary?.error && <p className="break-words text-sm text-bad">{view.summary.error}</p>}
        {view.evidence && <>
          {!view.evidence.current && <p role="status" className="text-sm text-accent">{t("voiceAudit.stale")}</p>}
          {view.evidence.reasons.map((reason) => <p key={reason} className="text-xs text-muted">{reason}</p>)}
          <a className="btn-ghost" href={`/api/episodes/${state.id}/voice-audit?download`} download>{t("voiceAudit.download")}</a>
          <ul className="space-y-4">{scenes.slice(offset, offset + 20).map((scene) => <li key={scene.sceneId} className="min-w-0 space-y-2 border-t border-line pt-3 text-sm">
            <h4 className="font-semibold">{scene.sceneId}</h4>
            {scene.metrics && <p>{t("voiceAudit.metrics", { duration: fmt.duration(scene.metrics.durationMs / 1000), rms: scene.metrics.rmsDbfs === null ? t("voiceAudit.silent") : fmt.number(Math.round(scene.metrics.rmsDbfs * 10) / 10), covered: fmt.duration(scene.metrics.coveredMs / 1000) })}</p>}
            {scene.source?.sha256 && <audio controls preload="none" src={asset(scene.source.key)} aria-label={t("voiceAudit.listen", { scene: scene.sceneId })} className="max-w-full" />}
            <ul className="space-y-1">{scene.findings.map((finding, i) => <li key={i} className="text-accent">{t(`voiceAudit.kind.${finding.kind}`)}{finding.startMs !== undefined && <> · {(finding.startMs / 1000).toFixed(2)}–{(finding.endMs! / 1000).toFixed(2)}s</>}</li>)}</ul>
            <details><summary className="cursor-pointer">{t("voiceAudit.forms")}</summary><dl className="space-y-2">{(["script", "recorded", "spoken", "captions"] as const).map((name) => <div key={name}><dt className="font-medium">{t(`voiceAudit.form.${name}`)}</dt><dd className="whitespace-pre-wrap break-words text-muted">{scene.forms[name] ?? t("voiceAudit.unknown")}</dd></div>)}</dl></details>
            <details><summary className="cursor-pointer">{t("quality.checks")}</summary><ul className="space-y-1 text-xs">{scene.checks.map((check, i) => <li key={i}>{t(`voiceAudit.check.${check.name}`)} · {t(`audit.checkStatus.${check.status}`)}{check.reason && <p className="break-words text-muted">{check.reason}</p>}</li>)}</ul></details>
          </li>)}</ul>
          <div className="flex gap-2"><button type="button" className="btn-ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 20))}>{t("quality.previous")}</button><button type="button" className="btn-ghost" disabled={offset + 20 >= scenes.length} onClick={() => setOffset(offset + 20)}>{t("quality.next")}</button></div>
        </>}
      </>}
    </>}
  </section>;
}
