"use client";

import { ImageProfile, paperPosterRecipe, SavedStyle, StyleRecipe, type SavedStyle as Saved, type StyleRecipe as Recipe } from "@ys/core";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./locale-provider";

const MAX_IMAGE = 4 * 1024 * 1024;
const TEXT_FIELDS = ["name", "artStyle", "promptPrefix", "lighting", "lensLanguage", "designNotes", "motionRules", "typographyRules"] as const;

/** Referans analizi taslak üretir; yalnız kaydedilen, değişmez stil bölüme bağlanır. */
export function CustomStyleEditor({ active, selected, onSelect, onDirty }: {
  active: boolean; selected?: string; onSelect: (id: string | undefined) => void; onDirty: (dirty: boolean) => void;
}) {
  const { t, fmt } = useI18n();
  const [styles, setStyles] = useState<Saved[]>([]);
  const [draft, setDraft] = useState<Recipe>();
  const [referenceKey, setReferenceKey] = useState<string>();
  const [profile, setProfile] = useState<ImageProfile>();
  const [file, setFile] = useState<File>();
  const [phase, setPhase] = useState<"analyze" | "measure" | "save">();
  const [error, setError] = useState<string>();
  const [cost, setCost] = useState<number>();
  const loaded = useRef(false);
  const alive = useRef(true);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!active || loaded.current) return;
    let cancelled = false;
    fetch("/api/styles/custom").then(async (res) => {
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? t("custom.failed"));
      const list = SavedStyle.array().parse(body);
      if (!cancelled) { setStyles(list); loaded.current = true; }
    }).catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [active, t]);
  useEffect(() => {
    const chosen = styles.find((s) => s.id === selected);
    if (chosen) { setDraft(chosen.recipe); setReferenceKey(chosen.referenceKey); setProfile(chosen.referenceProfile); }
  }, [selected, styles]);
  const dirty = () => { onSelect(undefined); onDirty(true); setError(undefined); };
  const choose = (id: string) => {
    const saved = styles.find((s) => s.id === id);
    setDraft(saved?.recipe); setReferenceKey(saved?.referenceKey); setFile(undefined); setCost(undefined); setError(undefined);
    setProfile(saved?.referenceProfile);
    upload.current!.value = "";
    onSelect(saved?.id); onDirty(false);
  };
  async function analyze(file: File, measure = false) {
    setPhase(measure ? "measure" : "analyze"); setError(undefined); onDirty(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]!);
        reader.onerror = () => reject(new Error(t("custom.failed")));
        reader.readAsDataURL(file);
      });
      const res = await fetch(measure ? "/api/styles/measure" : "/api/styles/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mimeType: file.type, base64: data }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? t("custom.failed"));
      const recipe = measure ? draft ?? paperPosterRecipe() : StyleRecipe.parse(body.recipe);
      const measured = body.profile ? ImageProfile.parse(body.profile) : undefined;
      if (!alive.current) return;
      setDraft(recipe); setReferenceKey(body.referenceKey); setCost(measure ? undefined : body.cached ? 0 : body.costUsd); onSelect(undefined);
      setProfile(measured);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : t("custom.failed")); }
    finally { if (alive.current) setPhase(undefined); }
  }
  async function save() {
    const parsed = StyleRecipe.safeParse(draft && { ...draft, negativeRules: draft.negativeRules.filter((rule) => rule.trim()) });
    if (!parsed.success) { setError(t("custom.invalid")); return; }
    setPhase("save"); setError(undefined);
    try {
      const res = await fetch("/api/styles/custom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipe: parsed.data, referenceKey }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? t("custom.failed"));
      const saved = SavedStyle.parse(body);
      if (!alive.current) return;
      setStyles((list) => [saved, ...list.filter((s) => s.id !== saved.id)]); setDraft(saved.recipe); onSelect(saved.id); onDirty(false);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : t("custom.failed")); }
    finally { if (alive.current) setPhase(undefined); }
  }
  if (!active) return null;
  return <div className="grid gap-3 rounded-lg border border-line bg-panel-2 p-4">
    <h3 className="font-medium">{t("custom.title")}</h3>
    <p className="text-sm text-muted">{t("custom.hint")}</p>
    <div className="grid gap-1">
      <button type="button" className="btn-secondary justify-self-start" disabled={Boolean(phase)} onClick={() => { choose(""); setDraft({ ...paperPosterRecipe(), name: t("custom.paperPoster") }); dirty(); }}>{t("custom.startPaperPoster")}</button>
      <p className="text-xs text-muted">{t("custom.starterHint")}</p>
    </div>
    <label className="grid gap-1">
      <span className="label">{t("custom.saved")}</span>
      <select className="field" value={selected ?? ""} disabled={Boolean(phase)} onChange={(e) => choose(e.target.value)}>
        <option value="">{t("custom.freeform")}</option>
        {styles.map((s) => <option key={s.id} value={s.id}>{s.recipe.name}</option>)}
      </select>
    </label>
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="grid gap-1">
        <span className="label">{t("custom.image")}</span>
        <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(phase)} onChange={(e) => {
          const next = e.target.files?.[0];
          if (!next) { choose(""); return; }
          if (!["image/png", "image/jpeg", "image/webp"].includes(next.type) || next.size > MAX_IMAGE || !next.size) { setFile(undefined); setError(t("custom.badImage")); return; }
          setFile(next); setReferenceKey(undefined); setProfile(undefined); setCost(undefined); dirty();
        }} className="field" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={!file || Boolean(phase)} onClick={() => void analyze(file!, true)}>{t(phase === "measure" ? "custom.measuring" : "custom.measure")}</button>
        <button type="button" className="btn-secondary" disabled={!file || Boolean(phase)} onClick={() => void analyze(file!)}>{t(phase === "analyze" ? "custom.analyzing" : "custom.analyze")}</button>
      </div>
    </div>
    {cost !== undefined && <p className="text-xs text-muted" role="status">{t("custom.cost", { cost: fmt.usd(cost) })}</p>}
    {profile && <div className="grid gap-2 rounded border border-line p-3" data-testid="reference-profile">
      <p className="text-sm">{t("custom.measured")}</p>
      <div className="flex flex-wrap gap-2">{profile.palette.map((swatch) => <span key={swatch.color} className="flex items-center gap-1 text-xs"><span className="inline-block h-5 w-5 rounded border border-line" style={{ background: swatch.color }} />{swatch.color} · {Math.round(swatch.share * 1000) / 10}%</span>)}</div>
      <p className="text-xs text-muted">{t("custom.measureStats", { dark: Math.round(profile.tone.darkShare * 100), light: Math.round(profile.tone.lightShare * 100), contrast: Math.round(profile.contrastSpan * 100) })}</p>
      <button type="button" className="btn-secondary justify-self-start" disabled={Boolean(phase) || !draft || profile.palette.length < 3} onClick={() => { setDraft({ ...draft!, palette: profile.palette.map((s) => s.color) }); dirty(); }}>{t("custom.applyPalette")}</button>
      <p className="text-xs text-muted">{t(profile.palette.length < 3 ? "custom.fewColors" : "custom.measureHint")}</p>
    </div>}
    {draft && <>
      {referenceKey && <img src={"/api/assets/" + referenceKey} alt={t("custom.reference")} className="max-h-48 max-w-full rounded border border-line object-contain" />}
      <div className="grid gap-3 md:grid-cols-2">
        {TEXT_FIELDS.map((field) => <label key={field} className={"grid gap-1 " + (field === "designNotes" || field === "motionRules" ? "md:col-span-2" : "")}>
          <span className="label">{t(`custom.field.${field}`)}</span>
          <textarea className="field" rows={field === "name" ? 1 : 3} value={draft[field]} disabled={Boolean(phase)} onChange={(e) => { setDraft({ ...draft, [field]: e.target.value }); dirty(); }} />
        </label>)}
        <label className="grid gap-1"><span className="label">{t("custom.field.palette")}</span><input className="field" value={draft.palette.join(", ")} disabled={Boolean(phase)} onChange={(e) => { setDraft({ ...draft, palette: e.target.value.split(",").map((x) => x.trim()) }); dirty(); }} /></label>
        <label className="grid gap-1"><span className="label">{t("custom.field.lineStyle")}</span><select className="field" value={draft.lineStyle} disabled={Boolean(phase)} onChange={(e) => { setDraft({ ...draft, lineStyle: e.target.value as Recipe["lineStyle"] }); dirty(); }}>{["outline", "flat", "sketch", "ink"].map((line) => <option key={line} value={line}>{t(`line.${line as Recipe["lineStyle"]}`)}</option>)}</select></label>
        <label className="grid gap-1"><span className="label">{t("custom.field.texture")}</span><select className="field" value={draft.texture} disabled={Boolean(phase)} onChange={(e) => { setDraft({ ...draft, texture: e.target.value as Recipe["texture"] }); dirty(); }}>{["none", "paper", "watercolor", "chalk", "halftone", "hatching", "grain", "scanlines"].map((kind) => <option key={kind} value={kind}>{t(`custom.texture.${kind as Recipe["texture"]}`)}</option>)}</select></label>
        <label className="grid gap-1"><span className="label">{t("custom.field.craftPreset")}</span><select className="field" value={draft.craftPreset ?? ""} disabled={Boolean(phase)} onChange={(e) => { setDraft({ ...draft, craftPreset: (e.target.value || undefined) as Recipe["craftPreset"] }); dirty(); }}><option value="">{t("custom.noPreset")}</option>{["paper-cutout", "risograph", "isometric", "paper-poster"].map((id) => <option key={id} value={id}>{t(`custom.material.${id as NonNullable<Recipe["craftPreset"]>}`)}</option>)}</select></label>
        {(["negativeRules", "reviewRules"] as const).map((field) => <label key={field} className="grid gap-1"><span className="label">{t(`custom.field.${field}`)}</span><textarea className="field" rows={4} value={draft[field].join("\n")} disabled={Boolean(phase)} onChange={(e) => { setDraft({ ...draft, [field]: e.target.value.split("\n") }); dirty(); }} /></label>)}
      </div>
      <button type="button" className="btn-primary justify-center" disabled={Boolean(phase)} onClick={() => void save()}>{t(phase === "save" ? "custom.saving" : "custom.save")}</button>
      {!selected && <p className="text-xs text-muted">{t("custom.unsaved")}</p>}
    </>}
    {(draft || file) && <button type="button" className="btn-secondary" disabled={Boolean(phase)} onClick={() => choose("")}>{t("custom.reset")}</button>}
    {selected && <p className="text-sm text-accent" role="status">{t("custom.ready")}</p>}
    {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
  </div>;
}
