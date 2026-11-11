"use client";
import { useEffect, useState } from "react";
import type { ResearchSource, ResearchClaim, ResearchMutation } from "@ys/core/research";
import { useI18n } from "../../locale-provider";

type Status = "unreviewed" | "stale" | "supported" | "disputed" | "needs-source" | "excluded";
interface Claim extends ResearchClaim { fingerprint: string; status: Status; anchorCurrent: boolean; dependentShots: string[] }
interface View { revision: number; sources: ResearchSource[]; claims: Claim[]; unresolved: number }
const emptySource = { title: "", url: "", publisher: "", date: "", excerpt: "", locator: "" };
const emptyClaim = { sceneId: "", quote: "", statement: "", kind: "fact" as ResearchClaim["kind"], links: [] as ResearchClaim["links"] };

export function ResearchPanel({ id, scenes, busy, onRewrite }: { id: string; scenes?: { id: string; narration: string }[]; busy: boolean; onRewrite?: () => Promise<boolean> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false), [view, setView] = useState<View>(), [error, setError] = useState(""), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [refresh, setRefresh] = useState(0);
  const [source, setSource] = useState<{ id?: string } & typeof emptySource>(emptySource);
  const [claim, setClaim] = useState<{ id?: string } & typeof emptyClaim>(emptyClaim);
  const [sourceRevision, setSourceRevision] = useState<number>(), [claimRevision, setClaimRevision] = useState<number>();
  const scriptVersion = JSON.stringify(scenes);
  useEffect(() => {
    if (!open || busy) return;
    let active = true; const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
    setLoading(true); setError("");
    void fetch(`/api/episodes/${id}/research`, { cache: "no-store", signal: controller.signal }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? t("research.error"));
      if (active) setView(data as View);
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : t("research.error")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [open, id, busy, refresh, scriptVersion, t]);
  const save = async (mutation: ResearchMutation, revision?: number): Promise<boolean> => {
    if (!view) return false;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/episodes/${id}/research`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: revision ?? view.revision, mutation }), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error((await res.json()).error ?? t("research.error"));
      setRefresh((n) => n + 1); return true;
    } catch (e) { setError(e instanceof Error ? e.message : t("research.error")); return false; }
    finally { setSaving(false); }
  };
  const locked = busy || saving || loading;
  return <section className="card min-w-0 space-y-3 p-4" aria-label={t("research.title")}>
    <button type="button" className="font-semibold underline underline-offset-4" aria-expanded={open} onClick={() => setOpen(!open)}>{t("research.title")}</button>
    {open && <>
      <p className="text-sm text-muted">{t("research.hint")}</p>
      {error && <p role="alert" className="break-words text-sm text-accent">{error}</p>}
      <button type="button" className="btn-ghost" disabled={locked} onClick={() => setRefresh((n) => n + 1)}>{t("research.refresh")}</button>
      {(loading || busy) && <p className="text-sm">{t("research.loading")}</p>}
      {view && <>
        <p className="text-sm">{t("research.count", { sources: view.sources.length, claims: view.claims.length, unresolved: view.unresolved })}</p>
        {onRewrite && view.sources.some((s) => s.excerpt) && <button type="button" className="btn-ghost" disabled={locked} onClick={() => void onRewrite()}>{t("research.rewrite")}</button>}
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <form className="min-w-0 space-y-2 rounded-lg border border-line p-3" onSubmit={async (e) => { e.preventDefault(); if (await save({ type: "put-source", source }, sourceRevision)) { setSource(emptySource); setSourceRevision(undefined); } }}>
            <h4 className="font-medium">{t("research.sourceForm")}</h4>
            <label className="block text-sm">{t("research.sourceTitle")}<input className="field w-full" required maxLength={300} value={source.title} disabled={locked} onChange={(e) => setSource({ ...source, title: e.target.value })} /></label>
            <label className="block text-sm">{t("research.url")}<input type="url" className="field w-full" required maxLength={2048} value={source.url} disabled={locked} onChange={(e) => setSource({ ...source, url: e.target.value })} /></label>
            <label className="block text-sm">{t("research.excerpt")}<textarea className="field min-h-24 w-full" maxLength={3000} value={source.excerpt} disabled={locked} onChange={(e) => setSource({ ...source, excerpt: e.target.value })} /></label>
            <label className="block text-sm">{t("research.locator")}<input className="field w-full" maxLength={300} value={source.locator} disabled={locked} onChange={(e) => setSource({ ...source, locator: e.target.value })} /></label>
            <label className="block text-sm">{t("research.publisher")}<input className="field w-full" maxLength={200} value={source.publisher} disabled={locked} onChange={(e) => setSource({ ...source, publisher: e.target.value })} /></label>
            <label className="block text-sm">{t("research.date")}<input className="field w-full" maxLength={80} value={source.date} disabled={locked} onChange={(e) => setSource({ ...source, date: e.target.value })} /></label>
            <button className="btn-primary" disabled={locked}>{t("research.saveSource")}</button>
            {source.id && <button type="button" className="btn-ghost" onClick={() => { setSource(emptySource); setSourceRevision(undefined); }}>{t("research.cancel")}</button>}
          </form>
          <form className="min-w-0 space-y-2 rounded-lg border border-line p-3" onSubmit={async (e) => { e.preventDefault(); if (await save({ type: "put-claim", claim }, claimRevision)) { setClaim(emptyClaim); setClaimRevision(undefined); } }}>
            <h4 className="font-medium">{t("research.claimForm")}</h4>
            <label className="block text-sm">{t("research.scene")}<select className="field w-full" required value={claim.sceneId} disabled={locked || !scenes?.length} onChange={(e) => setClaim({ ...claim, sceneId: e.target.value })}><option value="">{t("research.pickScene")}</option>{scenes?.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}</select></label>
            {scenes?.find((s) => s.id === claim.sceneId) && <p className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted">{scenes.find((s) => s.id === claim.sceneId)!.narration}</p>}
            <label className="block text-sm">{t("research.quote")}<textarea className="field w-full" required maxLength={1500} value={claim.quote} disabled={locked} onChange={(e) => setClaim({ ...claim, quote: e.target.value })} /></label>
            <label className="block text-sm">{t("research.statement")}<textarea className="field w-full" required maxLength={1500} value={claim.statement} disabled={locked} onChange={(e) => setClaim({ ...claim, statement: e.target.value })} /></label>
            <label className="block text-sm">{t("research.kind")}<select className="field w-full" value={claim.kind} disabled={locked} onChange={(e) => setClaim({ ...claim, kind: e.target.value as ResearchClaim["kind"] })}>{(["fact", "estimate", "quotation", "interpretation", "reconstruction"] as const).map((kind) => <option key={kind} value={kind}>{t(`research.kind.${kind}`)}</option>)}</select></label>
            <fieldset disabled={locked} className="space-y-2"><legend className="text-sm">{t("research.links")}</legend>{view.sources.map((s) => {
              const link = claim.links.find((l) => l.sourceId === s.id);
              return <div key={s.id} className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={Boolean(link)} onChange={(e) => setClaim({ ...claim, links: e.target.checked ? [...claim.links, { sourceId: s.id, relation: "supports" }] : claim.links.filter((l) => l.sourceId !== s.id) })} /><span className="break-words">{s.title}</span></label>{link && <select className="field" aria-label={`${t("research.relation")} ${s.title}`} value={link.relation} onChange={(e) => setClaim({ ...claim, links: claim.links.map((l) => l.sourceId === s.id ? { ...l, relation: e.target.value as typeof l.relation } : l) })}>{(["supports", "contradicts", "context"] as const).map((relation) => <option key={relation} value={relation}>{t(`research.relation.${relation}`)}</option>)}</select>}</div>;
            })}</fieldset>
            <button className="btn-primary" disabled={locked || !scenes?.length}>{t("research.saveClaim")}</button>
            {claim.id && <button type="button" className="btn-ghost" onClick={() => { setClaim(emptyClaim); setClaimRevision(undefined); }}>{t("research.cancel")}</button>}
          </form>
        </div>
        <details><summary className="cursor-pointer font-medium">{t("research.sources")}</summary><ul className="space-y-3">{view.sources.map((s) => <li key={s.id} className="min-w-0 border-t border-line pt-2 text-sm"><a href={s.url} target="_blank" rel="noreferrer" className="break-words text-accent underline">{s.title}</a><p className="whitespace-pre-wrap break-words text-muted">{s.excerpt}</p><p className="text-xs text-muted">{s.locator} {s.publisher} {s.date}</p><button type="button" className="btn-ghost" disabled={locked} onClick={() => { setSource(s); setSourceRevision(view.revision); }}>{t("research.edit")}</button></li>)}</ul></details>
        <ul className="space-y-3">{view.claims.map((c) => <li key={c.id} className="min-w-0 space-y-2 border-t border-line pt-3 text-sm">
          <p className="font-medium">{c.sceneId} · {t(`research.kind.${c.kind}`)} · {t(`research.status.${c.status}`)}</p>
          <p className="break-words">{c.statement}</p><blockquote className="border-l-2 border-line pl-3 text-muted">{c.quote}</blockquote>
          <ul className="text-xs">{c.links.map((link) => <li key={link.sourceId}>{t(`research.relation.${link.relation}`)}: {view.sources.find((s) => s.id === link.sourceId)?.title ?? link.sourceId}</li>)}</ul>
          <p className="break-words text-xs text-muted">{t("research.dependents", { shots: c.dependentShots.join(", ") || "—" })}</p>
          <div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={locked} onClick={() => { setClaim({ id: c.id, sceneId: c.sceneId, quote: c.quote, statement: c.statement, kind: c.kind, links: c.links }); setClaimRevision(view.revision); }}>{t("research.edit")}</button>{(["supported", "disputed", "needs-source", "excluded"] as const).map((status) => <button key={status} type="button" className="btn-ghost" disabled={locked || !c.anchorCurrent || status === "excluded" && !["interpretation", "reconstruction"].includes(c.kind)} onClick={() => void save({ type: "review-claim", claimId: c.id, fingerprint: c.fingerprint, status })}>{t(`research.status.${status}`)}</button>)}</div>
        </li>)}</ul>
      </>}
    </>}
  </section>;
}
