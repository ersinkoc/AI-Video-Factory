import { STYLE_PACKS, VectorAssetMeta } from "@ys/core";
import { getJson, type AssetStore } from "@ys/storage";
import type { EpisodeState } from "./state.ts";

/**
 * Stil örnekleri: her stil paketinde bir karakter ve bir mekân, yeni bölüm formunda önizleme olarak gösterilir. Önce
 * bölümlerde o stilde çizilmiş (kapıdan geçmiş) varlıklar kullanılır, para harcanmaz; eksikler pipeline'ın kendi
 * tasarımcısı ve kalite kapısıyla çizilir (`ys styles samples`). Karakter bankaya sunucu olarak girer, o stilde bölüm
 * açarken seçilebilir.
 */

export const STYLE_SAMPLES_KEY = "library/style-samples.json";
/** Mekân çizilirken kullanılan sanal bölüm: maliyet defterinde bu adla görünür, durumu kaydedilmez. */
export const STYLE_SAMPLES_ID = "style-samples";

/** Bütün stillerde aynı konu: önizlemeler yan yana karşılaştırılabilsin. */
export const SAMPLE_BRIEF = {
  character: {
    name: "Guide",
    role: "presenter",
    description:
      "Friendly storyteller in his late 30s, short dark hair, trimmed beard, rolled-up shirt sleeves, waistcoat, comfortable trousers, standing upright with an open, welcoming posture, looking at the viewer.",
  },
  background: {
    name: "Study",
    description:
      "A scholar's study: a large window on the back wall, tall bookshelves full of books, a wooden desk with a globe, a lamp and open papers, a rug on the floor. Empty of people.",
  },
} as const;

export interface StyleSample {
  /** Karakterin ve mekânın kütüphane anahtarı (SVG). */
  character?: string;
  background?: string;
  /** Bölümlerden alındı mı, örnek için mi çizildi. */
  source: "library" | "drawn";
  at: string;
}

export type StyleSamples = Record<string, StyleSample>;

export async function loadStyleSamples(store: AssetStore): Promise<StyleSamples> {
  return (await getJson<StyleSamples>(store, STYLE_SAMPLES_KEY)) ?? {};
}

/** Kapıdan geçmiş (ya da insanın kabul ettiği) ve reddedilmemiş varlık. */
async function usable(store: AssetStore, key: string): Promise<boolean> {
  const check = VectorAssetMeta.safeParse((await getJson(store, `${key}.json`)) ?? {}).data?.check;
  return Boolean(check?.passed || check?.override?.decision === "accepted") && check?.override?.decision !== "rejected";
}

/**
 * Bölümlerde çizilmiş örnekler (para harcamaz): her paket için o stildeki bölümlerin seçili ilk karakteri ve ilk
 * mekânı. Bölüm sırası kimliğe göre (tarih önekli): en yeni çizimler önce.
 */
export async function existingSamples(store: AssetStore): Promise<StyleSamples> {
  const out: StyleSamples = {};
  const keys = (await store.list("episodes/")).filter((k) => k.endsWith("/state.json")).sort().reverse();
  for (const stateKey of keys) {
    const state = await getJson<EpisodeState>(store, stateKey);
    const pack = state?.style?.pack;
    if (!pack || !STYLE_PACKS.some((p) => p.id === pack) || !state.cast || !state.concept) continue;
    const sample = out[pack] ?? { source: "library" as const, at: new Date().toISOString() };
    const pick = async (ids: string[], dir: string) => {
      for (const id of ids) {
        const key = state.concept!.selected[id]?.key;
        if (key?.startsWith(dir) && (await usable(store, key))) return key;
      }
      return undefined;
    };
    sample.character ??= await pick(state.cast.characters.map((c) => c.id), "library/vector/character/");
    sample.background ??= await pick(state.cast.locations.map((l) => l.id), "library/vector/background/");
    out[pack] = sample;
  }
  // Uygun varlığı olmayan paketin örneği yok.
  return Object.fromEntries(Object.entries(out).filter(([, s]) => s.character || s.background));
}
