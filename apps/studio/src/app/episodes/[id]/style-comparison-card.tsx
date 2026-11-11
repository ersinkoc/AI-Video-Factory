"use client";
import type { EpisodeResponse } from "../../../lib/types";
import { useI18n } from "../../locale-provider";
import type { Act } from "./parts";

export function StyleComparisonCard({ state, busy, act, onSeek }: { state: EpisodeResponse["state"]; busy: boolean; act?: Act; onSeek: (seconds: number) => void }) {
  const { t } = useI18n();
  const render = state.render;
  if (!render?.styleReference || !render.styleSampling) return null;
  const comparison = render.styleComparison;
  return <section className="card min-w-0 space-y-3 p-4" aria-label={t("comparison.title")}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t("comparison.title")}</h3>
      {act && <button className="btn-ghost" disabled={busy} onClick={() => act({ type: "compare-style" })}>{t("comparison.run")}</button>}</div>
    <p className="text-sm text-muted">{t("comparison.hint")}</p>
    <div className="flex flex-wrap gap-2">{render.styleReference.profile.palette.map((s) => <span key={s.color} className="text-xs"><span className="mr-1 inline-block h-4 w-4 rounded border border-line align-middle" style={{ background: s.color }} />{s.color} · {Math.round(s.share * 1000) / 10}%</span>)}</div>
    {comparison ? <>
      <p className="text-sm">{t(`audit.status.${comparison.status}`)} · {t("comparison.count", { compared: comparison.compared, eligible: comparison.eligible, excluded: comparison.excludedArchive })}</p>
      {comparison.error && <p className="break-words text-sm text-accent">{comparison.error}</p>}
      {comparison.findings.length ? <ul className="space-y-2 text-sm">{comparison.findings.map((f) => <li key={f.shotId}><button className="btn-ghost" onClick={() => onSeek(f.seconds)}>{f.shotId} · {f.seconds.toFixed(1)}s</button> {f.flags.map((flag) => t(`comparison.flag.${flag as "palette" | "tone" | "contrast" | "detail"}`)).join(", ")}</li>)}</ul> : <p className="text-sm text-muted">{t(comparison.compared ? "comparison.noFlags" : "comparison.noSamples")}</p>}
      {comparison.reportKey && <a className="btn-secondary inline-flex" href={`/api/episodes/${state.id}/style-comparison`}>{t("comparison.download")}</a>}
    </> : <p className="text-sm text-muted">{t("comparison.absent")}</p>}
  </section>;
}
