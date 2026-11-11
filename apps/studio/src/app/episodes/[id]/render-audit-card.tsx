"use client";

import type { EpisodeResponse } from "../../../lib/types";
import { useI18n } from "../../locale-provider";
import type { Act } from "./parts";

const time = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const CHECKS = {
  black_and_freeze: "audit.check.picture",
  local_motion: "audit.check.motion",
  audio_levels: "audit.check.audio",
  shot_audio: "audit.check.shotAudio",
  semantic_action_readability_and_sound_quality: "audit.check.editorial",
  report_storage: "audit.check.storage",
} as const;

export function RenderAuditCard({ state, busy, act, onSeek, target = "main" }: {
  state: EpisodeResponse["state"];
  busy: boolean;
  act?: Act;
  onSeek: (seconds: number) => void;
  target?: "main" | "short";
}) {
  const { t } = useI18n();
  const output = target === "short" ? state.short : state.render;
  if (!output) return null;
  const audit = output.audit;
  const title = t(target === "short" ? "audit.shortTitle" : "audit.title");
  const interrupted = audit?.status === "running" && !busy;
  return (
    <section className="card min-w-0 space-y-3 p-4" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {act && <button className="btn-ghost" disabled={busy} onClick={() => act(target === "short" ? { type: "audit-render", target } : { type: "audit-render" })}>{t(audit ? "audit.rerun" : "audit.run")}</button>}
      </div>
      <p className="text-sm text-muted">{t("audit.advisory")}</p>
      {!audit ? <p className="text-sm">{t("audit.absent")}</p> : <>
        <p className={`text-sm font-medium ${audit.status === "failed" || audit.status === "incomplete" || interrupted ? "text-accent" : ""}`}>
          {t(interrupted ? "audit.interrupted" : `audit.status.${audit.status}`)}
        </p>
        {audit.status !== "running" && <p className="text-sm">{t("audit.count", { n: audit.findingsCount })}</p>}
        {audit.error && <p className="break-words text-sm text-accent">{audit.error}</p>}
        {audit.rangeBasis === "current_timeline" && <p className="text-xs text-accent">{t("audit.currentTimeline")}</p>}
        {audit.checks.length > 0 && <ul className="space-y-2 text-sm">
          {audit.checks.map((check, i) => <li key={`${check.name}-${i}`}>
            <div className="flex flex-wrap justify-between gap-2">
              <span>{check.name in CHECKS ? t(CHECKS[check.name as keyof typeof CHECKS]) : check.name}</span>
              <span className={check.status === "failed" ? "text-accent" : "text-muted"}>{t(`audit.checkStatus.${check.status}`)}</span>
            </div>
            {check.reason && <details className="mt-1 text-xs text-muted"><summary>{t("audit.details")}</summary><p className="mt-1 break-words">{check.reason}</p></details>}
          </li>)}
        </ul>}
        {audit.findings.length > 0 && <ul className="space-y-2 border-t border-line pt-3 text-sm">
          {audit.findings.map((finding, i) => <li key={`${finding.id}-${finding.kind}-${i}`}>
            <button className="text-left text-accent underline underline-offset-4" onClick={() => onSeek(finding.startSec)}>
              {time(finding.startSec)}–{time(finding.endSec)} · {t(`audit.finding.${finding.kind}`)}
            </button>
          </li>)}
        </ul>}
        {audit.findingsCount > audit.findings.length && <p className="text-xs text-muted">{t("audit.more", { n: audit.findingsCount - audit.findings.length })}</p>}
        {audit.shotAudio && <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-medium">{t("audit.shotTitle", { n: audit.shotAudio.windowsCount })}</summary>
          <p className="my-2 text-xs text-muted">{t("audit.shotHint")}</p>
          <ul className="space-y-2">{audit.shotAudio.windows.map((window, i) => <li key={`${window.id}-${i}`}>
            <button type="button" className="w-full min-w-0 rounded border border-line p-2 text-left hover:bg-panel-2" onClick={() => onSeek(window.startSec)}>
              <span className="flex flex-wrap justify-between gap-2 text-xs"><span className="break-all">{window.id} · {time(window.startSec)}–{time(window.endSec)}</span><span>{window.rmsDbfs === null ? t(window.coverage ? "audit.silentSamples" : "audit.unmeasuredSamples") : `${window.rmsDbfs.toFixed(1)} dBFS RMS`}</span></span>
              <svg aria-hidden="true" viewBox="0 0 128 20" preserveAspectRatio="none" className="my-1 h-6 w-full text-accent">{window.envelope.map((value, j) => <rect key={j} x={j * 4} y={18 - value * 18} width="3" height={2 + value * 18} fill="currentColor" opacity={value ? .8 : .2} />)}</svg>
              <span className="text-xs text-muted">{t("audit.shotStats", { quiet: window.coverage ? Math.round(window.quietShare * 100) + "%" : "—", delta: window.relativeDb === null ? "—" : `${window.relativeDb > 0 ? "+" : ""}${window.relativeDb.toFixed(1)} dB`, previous: window.previousDeltaDb == null ? "—" : `${window.previousDeltaDb > 0 ? "+" : ""}${window.previousDeltaDb.toFixed(1)} dB`, coverage: Math.round(window.coverage * 100) })}</span>
            </button>
          </li>)}</ul>
          {audit.shotAudio.windowsCount > audit.shotAudio.windows.length && <p className="mt-2 text-xs text-muted">{t("audit.shotMore", { shown: audit.shotAudio.windows.length, total: audit.shotAudio.windowsCount })}</p>}
        </details>}
        {audit.reportKey && <a className="btn-ghost" href={`/api/episodes/${state.id}/audit?v=${encodeURIComponent(audit.at)}${target === "short" ? '&short' : ''}`} download>{t("audit.download")}</a>}
      </>}
    </section>
  );
}
