"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import type { LibraryCharacter } from "@ys/pipeline/light";
import { stylePackOf } from "@ys/core/styles";
import type { MessageKey } from "../lib/i18n";
import { useI18n } from "./locale-provider";

const PAGE_SIZE = 12;
const CAST_LIMIT = 5;
const imageUrl = (key: string) => `/api/assets/${key.split("/").map(encodeURIComponent).join("/")}`;
const searchable = (value: string) => value.toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}/gu, "").replaceAll("ı", "i");

function CharacterImage({ character }: { character: LibraryCharacter }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const source = attempt === 0 ? character.figurePreview ?? character.key : character.key;
  return <div className="relative aspect-[4/3] overflow-hidden bg-[#e7e5df]">
    {attempt < 2 ? <img src={imageUrl(source)} alt={character.name} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain p-3" onError={() => setAttempt(attempt === 0 && character.figurePreview && character.figurePreview !== character.key ? 1 : 2)} /> : <div className="absolute inset-0 grid content-center justify-items-center gap-2 p-3 text-center text-xs text-[#53535a]" role="img" aria-label={t("form.bank.imageMissing", { name: character.name })}><UserRound size={36} aria-hidden="true" /><span>{t("form.bank.noPreview")}</span></div>}
  </div>;
}

/** Seçim, arama ve sayfadan bağımsızdır; yeni bölüm sunucu/kadro kimliklerini aynı sözleşmeyle gönderir. */
export function CharacterBankPicker({ bank, presenter, setPresenter, cast, setCast, disabled = false }: {
  bank: LibraryCharacter[]; presenter: string; setPresenter: (id: string) => void; cast: string[]; setCast: (ids: string[]) => void; disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState(""), [pack, setPack] = useState(""), [line, setLine] = useState(""), [compatibleOnly, setCompatibleOnly] = useState(false), [requestedPage, setPage] = useState(0);
  const chosen = bank.filter((c) => c.id === presenter || cast.includes(c.id)), first = chosen[0];
  const mixed = new Set(chosen.map((c) => `${c.pack}|${c.lineStyle}`)).size > 1;
  const compatible = (c: LibraryCharacter) => !first || c.pack === first.pack && c.lineStyle === first.lineStyle;
  const selected = (c: LibraryCharacter) => c.id === presenter || cast.includes(c.id);
  const packName = (id?: string) => (id && stylePackOf(id)?.name[locale]) || t("bank.custom");
  const filtered = bank.filter((c) => (!pack || c.pack === pack) && (!line || c.lineStyle === line) && (!compatibleOnly || compatible(c)) && (!query.trim() || searchable([c.name, c.role, c.description, c.id, ...c.mascotOf].join(" ")).includes(searchable(query.trim()))));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), page = Math.min(requestedPage, pageCount - 1), shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const remove = (id: string) => { if (presenter === id) setPresenter(""); setCast(cast.filter((value) => value !== id)); };
  const resetFilters = () => { setQuery(""); setPack(""); setLine(""); setCompatibleOnly(false); setPage(0); };
  return <fieldset disabled={disabled} className="min-w-0 space-y-4 rounded-xl border border-line p-3 sm:p-4">
    <legend className="px-1 text-sm font-semibold">{t("form.bank.title")}</legend>
    <div className="space-y-2"><p className="text-sm text-muted">{t("form.bank.hint")}</p><p className="text-xs text-muted">{t("form.bank.limit", { n: CAST_LIMIT })}</p><a className="inline-block text-xs text-accent underline" href="/characters">{t("form.bank.manage")}</a></div>
    {bank.length === 0 ? <p className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-muted">{t("bank.empty")}</p> : <>
      <div className="space-y-2 rounded-lg border border-line bg-panel-2/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{t("form.bank.selected", { n: chosen.length })}</h3>{chosen.length > 0 && <button type="button" className="text-xs text-accent underline" disabled={disabled} onClick={() => { setPresenter(""); setCast([]); }}>{t("form.bank.clear")}</button>}</div>
        {chosen.length ? <ul className="flex flex-wrap gap-2">{chosen.map((c) => <li key={c.id} className="min-w-0 max-w-full"><button type="button" disabled={disabled} className="inline-flex max-w-full items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent" aria-label={t("form.bank.removeSelected", { name: c.name })} onClick={() => remove(c.id)}><span className="min-w-0 break-words">{c.name} · {t(c.id === presenter ? "form.bank.presenterBadge" : "form.bank.castBadge")}</span><span aria-hidden="true">×</span></button></li>)}</ul> : <p className="text-xs text-muted">{t("form.bank.noneSelected")}</p>}
        {mixed ? <p role="alert" className="text-xs text-bad">{t("form.bank.mixed")}</p> : first && <p className="text-xs text-accent">{t("form.bank.style", { pack: packName(first.pack), line: t(`line.${first.lineStyle}` as MessageKey) })}</p>}
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="min-w-0 text-xs text-muted">{t("form.bank.search")}<input type="search" className="field mt-1" maxLength={200} placeholder={t("form.bank.searchHint")} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
        <label className="min-w-0 text-xs text-muted">{t("form.bank.packFilter")}<select className="field mt-1" value={pack} onChange={(e) => { setPack(e.target.value); setPage(0); }}><option value="">{t("bank.filter.all")}</option>{[...new Set(bank.map((c) => c.pack).filter((p): p is string => Boolean(p)))].map((p) => <option key={p} value={p}>{packName(p)}</option>)}</select></label>
        <label className="min-w-0 text-xs text-muted">{t("form.bank.lineFilter")}<select className="field mt-1" value={line} onChange={(e) => { setLine(e.target.value); setPage(0); }}><option value="">{t("form.bank.allLines")}</option>{[...new Set(bank.map((c) => c.lineStyle))].map((l) => <option key={l} value={l}>{t(`line.${l}` as MessageKey)}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={compatibleOnly} onChange={(e) => { setCompatibleOnly(e.target.checked); setPage(0); }} />{t("form.bank.compatibleOnly")}</label><button type="button" className="text-accent underline" disabled={disabled || !query && !pack && !line && !compatibleOnly} onClick={resetFilters}>{t("form.bank.resetFilters")}</button></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted" aria-live="polite">{t("form.bank.results", { start: filtered.length ? page * PAGE_SIZE + 1 : 0, end: Math.min((page + 1) * PAGE_SIZE, filtered.length), n: filtered.length })}</p>{pageCount > 1 && <nav aria-label={t("form.bank.pages")} className="flex items-center gap-2"><button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={disabled || page === 0} onClick={() => setPage(page - 1)}>{t("quality.previous")}</button><span className="text-xs">{t("form.bank.page", { page: page + 1, total: pageCount })}</span><button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={disabled || page + 1 >= pageCount} onClick={() => setPage(page + 1)}>{t("quality.next")}</button></nav>}</div>
      {shown.length === 0 ? <p role="status" className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{t("form.bank.noMatches")}</p> : <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{shown.map((c) => {
        const isPresenter = presenter === c.id, isCast = cast.includes(c.id), conflict = !compatible(c), supported = Boolean(c.pack && stylePackOf(c.pack));
        const blocked = disabled || !supported || conflict && !selected(c);
        return <article key={c.id} aria-label={c.name} className={`flex min-w-0 flex-col overflow-hidden rounded-xl border ${selected(c) ? "border-accent bg-accent/5" : "border-line bg-panel-2/30"}`}>
          <CharacterImage key={`${c.key}:${c.figurePreview ?? ""}`} character={c} />
          <div className="flex min-w-0 flex-1 flex-col gap-2 p-3"><div className="flex flex-wrap items-center justify-between gap-1"><h4 className="min-w-0 max-w-full break-words text-sm font-semibold">{c.name}</h4>{selected(c) && <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] text-accent">{t(isPresenter ? "form.bank.presenterBadge" : "form.bank.castBadge")}</span>}</div>
            {c.role && <p className="break-words text-xs text-accent">{c.role}</p>}
            <p className="break-words text-xs text-muted">{packName(c.pack)} · {t(`line.${c.lineStyle}` as MessageKey)}</p>
            <p className="line-clamp-2 break-words text-xs text-muted" title={c.description}>{c.description}</p>
            <p className="text-[11px] text-muted">{t("bank.episodes", { n: c.episodes.length })}{c.bank ? ` · ${t("bank.badge.bank")}` : ""}</p>
            {conflict && !selected(c) && <p className="text-xs text-muted">{t("form.bank.incompatible")}</p>}
            <div className="mt-auto grid gap-2 pt-1"><button type="button" className={isPresenter ? "btn-primary justify-center px-2 py-1.5 text-xs" : "btn-ghost justify-center px-2 py-1.5 text-xs"} aria-label={t(isPresenter ? "form.bank.removePresenter" : "form.bank.asPresenter", { name: c.name })} aria-pressed={isPresenter} disabled={blocked} onClick={() => { setPresenter(isPresenter ? "" : c.id); if (!isPresenter) setCast(cast.filter((id) => id !== c.id)); }}>{t(isPresenter ? "form.bank.presenterBadge" : "form.bank.presenterAction")}</button>
              <label className={`flex items-center justify-center gap-2 text-xs ${blocked || isPresenter || !isCast && cast.length >= CAST_LIMIT ? "text-muted" : ""}`}><input type="checkbox" aria-label={t("form.bank.asCast", { name: c.name })} checked={isCast && !isPresenter} disabled={blocked || isPresenter || !isCast && cast.length >= CAST_LIMIT} onChange={() => setCast(isCast ? cast.filter((id) => id !== c.id) : [...cast, c.id])} />{t("form.bank.cast")}</label>
            </div>
          </div>
        </article>;
      })}</div>}
    </>}
  </fieldset>;
}
