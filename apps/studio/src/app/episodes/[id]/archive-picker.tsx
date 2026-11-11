"use client";
import { useEffect, useRef, useState } from "react";
import type { ArchiveSearch } from "@ys/core";
import type { EpisodeResponse } from "../../../lib/types";
import { useI18n } from "../../locale-provider";
import { asset, type Act } from "./parts";

export function ArchivePicker({ state, busy, act }: { state: EpisodeResponse["state"]; busy: boolean; act: Act }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [shotId, setShotId] = useState(state.shots?.[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArchiveSearch>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (!state.shots?.some((s) => s.id === shotId)) setShotId(state.shots?.[0]?.id ?? ""); }, [state.shots, shotId]);
  const selected = state.archives?.[shotId];
  const search = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(""); setResults(undefined);
    try {
      const response = await fetch(`/api/archive?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? t("common.actionFailed"));
      if (!controller.signal.aborted) setResults(data);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  return <section className="card min-w-0 space-y-3 p-3" aria-label={t("archive.title")}>
    <button className="btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{t("archive.title")}</button>
    {open && <>
      <p className="text-sm text-muted">{t("archive.hint")}</p>
      <label className="grid min-w-0 gap-1 text-sm">{t("archive.shot")}<select className="min-w-0 w-full" value={shotId} disabled={busy} onChange={(e) => setShotId(e.target.value)}>
        {state.shots?.map((s, i) => <option key={s.id} value={s.id}>#{i + 1} · {s.description.slice(0, 100)}</option>)}
      </select></label>
      {selected && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 text-sm">
        <img src={asset(selected.key)} alt={selected.source.title} className="h-20 w-28 object-contain" />
        <div className="min-w-0 flex-1"><p>{selected.source.title}</p><a href={selected.source.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline">{t("archive.source")}</a></div>
        <button className="btn-ghost" disabled={busy} onClick={() => act({ type: "remove-archive", shotId })}>{t("archive.restore")}</button>
      </div>}
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input aria-label={t("archive.query")} value={query} className="min-w-0 flex-1" maxLength={180} onChange={(e) => { request.current?.abort(); setLoading(false); setQuery(e.target.value); setResults(undefined); }} placeholder={t("archive.queryHint")} />
        <button className="btn-primary" disabled={loading || query.trim().length < 2}>{t(loading ? "common.loading" : "archive.search")}</button>
      </form>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {results?.errors.length ? <p className="text-sm text-accent">{t("archive.partial", { providers: results.errors.map((e) => e.provider).join(", ") })}</p> : null}
      {results && !results.items.length && !results.errors.length && <p className="text-sm text-muted">{t("archive.empty")}</p>}
      {results && <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">{results.items.map((item) => <article key={item.id} className="min-w-0 space-y-2 rounded-lg border border-line p-3 text-sm">
        <img src={`/api/archive/${item.id}/image`} alt={item.title} loading="lazy" className="h-36 w-full bg-black/20 object-contain" />
        <h4 className="font-semibold">{item.title}</h4>
        <p className="text-xs text-muted">{item.creator} {item.date} · {item.provider}</p>
        <div className="flex flex-wrap gap-2"><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost">{t("archive.source")}</a>
          <button className="btn-primary" disabled={busy || !shotId} onClick={async () => { if (await act({ type: "use-archive", shotId, candidateId: item.id })) setResults(undefined); }}>{t("archive.use")}</button></div>
      </article>)}</div>}
    </>}
  </section>;
}
