"use client";

import { STYLE_PACKS, stylePackOf, type StylePack } from "@ys/core/styles";
import { textureLayer } from "@ys/core/texture";
import { useI18n } from "./locale-provider";

/** Stil paketi → örnek karakter ve mekânın kütüphane anahtarı (yalnız örneği olan paketler). */
export type SampleKeys = Record<string, { character?: string; background?: string }>;

/** Örneğin SVG'si: sunucu paketin çizgi stilini uygular; anahtar yalnız önbelleği tazeler. */
const sample = (pack: string, kind: "character" | "background", key: string) => `/api/styles/${pack}/sample?kind=${kind}&v=${encodeURIComponent(key)}`;

/**
 * Mekânın önünde ayakta karakter, render'daki gibi: arka plan geri çekilir (aynı filtre), paketin dokusu biner, kenarlar
 * kararır. SVG'ler kum havuzlu yoldan <img> ile gelir; doku koddan üretilmiş SVG'dir.
 */
function Preview({ pack, keys }: { pack: StylePack; keys: SampleKeys[string] }) {
  const { locale } = useI18n();
  const grain = textureLayer(pack.texture, `g-${pack.id}`);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-panel-2">
      {keys.background && (
        <img
          src={sample(pack.id, "background", keys.background)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: "saturate(0.78) contrast(0.86) brightness(0.94)" }}
        />
      )}
      {keys.character && (
        <img
          src={sample(pack.id, "character", keys.character)}
          alt={pack.name[locale]}
          loading="lazy"
          className="absolute bottom-[6%] left-1/2 h-[66%] -translate-x-1/2 object-contain"
        />
      )}
      {grain && (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(grain.svg)}`}
          alt=""
          data-texture={pack.texture}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ opacity: grain.opacity }}
        />
      )}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.32) 100%)" }} />
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
          <Preview pack={current} keys={samples[pack]} />
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
            <Preview pack={p} keys={samples[p.id]!} />
            <span className={`truncate px-1 ${pack === p.id ? "text-accent" : ""}`}>{p.name[locale]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
