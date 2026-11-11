"use client";
import { useEffect, useState } from "react";
import type { QualityIssue, QualitySource, QualityStatus, QualityTarget } from "@ys/pipeline/light";
import { useI18n } from "../../locale-provider";

interface Page { issues: QualityIssue[]; total: number; offset: number; notices: string[]; historicalDecisions: number }
export function QualityIssueBoard({ id, busy, version, onSeek }: {
  id: string; busy: boolean; version: string; onSeek: (target: "main" | "short", seconds: number) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false), [source, setSource] = useState(""), [status, setStatus] = useState(""), [target, setTarget] = useState(""), [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page>(), [error, setError] = useState(""), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!open || busy) return;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
    let active = true;
    setLoading(true); setError(""); setPage(undefined);
    const query = new URLSearchParams({ source, status, target, offset: String(offset) });
    void fetch(`/api/episodes/${id}/quality?${query}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? t("quality.error"));
      if (active) setPage(value as Page);
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t("quality.error")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [open, id, version, busy, source, status, target, offset, refresh, t]);
  const decide = async (issue: QualityIssue, next: QualityStatus) => {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/episodes/${id}/quality`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ issueKey: issue.key, exportId: issue.exportId, status: next }), signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error((await response.json()).error ?? t("quality.error"));
      setRefresh((r) => r + 1);
    } catch (e) { setError(e instanceof Error ? e.message : t("quality.error")); }
    finally { setSaving(false); }
  };
  const sources: QualitySource[] = ["audit", "style", "intent", "research", "voice", "lint", "draft", "review"];
  const statuses: QualityStatus[] = ["open", "reviewed", "accepted", "fix-needed"];
  const targets: QualityTarget[] = ["main", "short", "plan"];
  return <section className="card min-w-0 space-y-3 p-4" aria-label={t("quality.title")}>
    <button type="button" className="font-semibold underline underline-offset-4" aria-expanded={open} onClick={() => setOpen(!open)}>{t("quality.title")}</button>
    {open && <>
      <p className="text-sm text-muted">{t("quality.hint")}</p>
      <div className="flex flex-wrap gap-2">
        <label className="text-sm">{t("quality.source")} <select value={source} disabled={saving} onChange={(e) => { setSource(e.target.value); setOffset(0); }} className="input"> <option value="">{t("quality.all")}</option>{sources.map((s) => <option key={s} value={s}>{t(`quality.source.${s}`)}</option>)}</select></label>
        <label className="text-sm">{t("quality.target")} <select value={target} disabled={saving} onChange={(e) => { setTarget(e.target.value); setOffset(0); }} className="input"><option value="">{t("quality.all")}</option>{targets.map((s) => <option key={s} value={s}>{t(`quality.target.${s}`)}</option>)}</select></label>
        <label className="text-sm">{t("quality.status")} <select value={status} disabled={saving} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="input"><option value="">{t("quality.all")}</option>{statuses.map((s) => <option key={s} value={s}>{t(`quality.status.${s}`)}</option>)}</select></label>
        <button type="button" className="btn-ghost" disabled={busy || loading || saving} onClick={() => setRefresh((r) => r + 1)}>{t("quality.refresh")}</button>
      </div>
      {error && <p role="alert" className="break-words text-sm text-accent">{error}</p>}
      {(loading || busy) ? <p>{t("quality.loading")}</p> : page && <>
        <p className="text-sm">{t("quality.count", { n: page.total })}</p>
        {page.historicalDecisions > 0 && <p className="text-xs text-muted">{t("quality.historical", { n: page.historicalDecisions })}</p>}
        <details><summary className="cursor-pointer text-sm">{t("quality.checks")}</summary><ul className="space-y-1 text-xs text-muted">{page.notices.map((notice, i) => <li key={i} className="break-words">{notice}</li>)}</ul></details>
        <ul className="space-y-3">{page.issues.map((issue) => <li key={issue.key} className="min-w-0 space-y-2 border-t border-line pt-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span>{t(`quality.source.${issue.source}`)} · {t(`quality.target.${issue.target}`)} · {issue.kind}</span>
            {issue.exportId && issue.target !== "plan" && <select aria-label={`${t("quality.status")} ${issue.kind} ${issue.shotId ?? ''}`} className="input" value={issue.status} disabled={busy || saving} onChange={(e) => void decide(issue, e.target.value as QualityStatus)}>{statuses.map((s) => <option key={s} value={s}>{t(`quality.status.${s}`)}</option>)}</select>}
          </div>
          <p className="break-words">{issue.detail}</p>
          {issue.source === "research" && <a href="#script" className="text-accent underline">{t("research.open")}</a>}
          {issue.source === "voice" && <a href="#script" className="text-accent underline">{t("voiceAudit.open")}</a>}
          {issue.seconds !== undefined && issue.target !== "plan" ? <button type="button" className="text-accent underline" onClick={() => onSeek(issue.target as "main" | "short", issue.seconds!)}>{issue.shotId} · {issue.seconds.toFixed(1)}s</button> : <span className="text-xs text-muted">{issue.shotId} · {t("quality.planOnly")}</span>}
          {issue.exportId && <p className="break-all text-xs text-muted">{t("quality.version")}: {issue.exportId}</p>}
        </li>)}</ul>
        <div className="flex gap-2"><button type="button" className="btn-ghost" disabled={!offset || saving} onClick={() => setOffset(Math.max(0, offset - 50))}>{t("quality.previous")}</button><button type="button" className="btn-ghost" disabled={offset + page.issues.length >= page.total || saving} onClick={() => setOffset(offset + 50)}>{t("quality.next")}</button></div>
      </>}
    </>}
  </section>;
}
