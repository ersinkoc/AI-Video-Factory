"use client";

import { STYLE_PACKS, stylePackOf } from "@ys/core/styles";
import { useI18n } from "./locale-provider";

/** Stil paketi → örnek karakter ve mekânın kütüphane anahtarı (yalnız örneği olan paketler). */
export type SampleKeys = Record<string, { character?: string; background?: string }>;

const asset = (key: string) => `/api/assets/${key}`;

/** Mekânın önünde ayakta karakter: bölümdeki gibi zemine basar. SVG'ler kum havuzlu varlık yolundan <img> ile gelir. */
function Preview({ sample, name }: { sample: SampleKeys[string]; name: string }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-panel-2">
      {sample.background && <img src={asset(sample.background)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
      {sample.character && (
        <img src={asset(sample.character)} alt={name} loading="lazy" className="absolute bottom-[6%] left-1/2 h-[66%] -translate-x-1/2 object-contain" />
      )}
    </div>
  );
}

/**
 * Yeni bölüm formunda stil galerisi: her paketin aynı konuyla çizilmiş örneği (bir karakter, bir mekân). Küçük resme
 * tıklamak paketi seçer; seçili paketin örneği büyük gösterilir. Örnekler `ys styles samples` ile üretilir.
 */
export function StyleGallery({ samples, pack, onPick }: { samples: SampleKeys; pack: string; onPick: (pack: string) => void }) {
  const { t, locale } = useI18n();
  const packs = STYLE_PACKS.filter((p) => samples[p.id]);
  const current = stylePackOf(pack);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label">{t("form.gallery")}</span>
        <span className="text-xs text-muted">{t("form.gallery.hint", { n: packs.length, total: STYLE_PACKS.length })}</span>
      </div>
      {current && samples[pack] && (
        <div className="md:max-w-xl">
          <Preview sample={samples[pack]} name={current.name[locale]} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {packs.map((p) => (
          <button
            type="button"
            key={p.id}
            aria-pressed={pack === p.id}
            onClick={() => onPick(p.id)}
            className={`grid gap-1 rounded-lg border p-1 text-left text-xs transition ${pack === p.id ? "border-accent bg-accent/10" : "border-line hover:border-muted"}`}
          >
            <Preview sample={samples[p.id]!} name={p.name[locale]} />
            <span className={`truncate px-1 ${pack === p.id ? "text-accent" : ""}`}>{p.name[locale]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
