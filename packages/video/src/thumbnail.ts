import type { Timeline } from "@ys/core";

/** YouTube küçük resmi (16:9, önerilen boy). */
export const THUMB = { width: 1280, height: 720 } as const;

export type ThumbnailSide = "left" | "right" | "bottom";

export interface ThumbnailPick {
  shotId: string;
  /** Başlığın yeri: kişilerin karşı yanı (yüz başlığın altında kalmasın); kişiler iki yana dağılmışsa alt orta. */
  side: ThumbnailSide;
}

/**
 * Küçük resmin arka planı olacak çekim. Vektör çekimde kişisi ve nesnesi olan dolu sahne öne çıkar (en çok 2 kişi,
 * 3 nesne sayılır); harita/bayrak (gerçek veri) arka planı geri düşer: küçük resimde insan yüzü tıklatır. Eşitlikte
 * videonun ~%40'ına en yakın çekim (açılış genelde tanıtım, son sahne kapanış). Vektör yoksa durağan kareler; hiçbiri
 * yoksa (yalnız klip) küçük resim çıkarılmaz.
 */
export function thumbnailShot(timeline: Timeline): ThumbnailPick | undefined {
  const assets = timeline.vectorAssets;
  const kind = (id: string) => assets[id]?.kind;
  const near = (v: Timeline["visuals"][number]) => -Math.abs(v.fromFrame + v.durationInFrames / 2 - timeline.durationInFrames * 0.4);
  const vectors = timeline.visuals.filter((v) => v.vector);
  if (vectors.length) {
    const score = (v: (typeof vectors)[number]) => {
      const layers = v.vector!.layers;
      const people = new Set(layers.filter((l) => kind(l.asset) === "character").map((l) => l.asset)).size;
      const props = layers.filter((l) => kind(l.asset) && kind(l.asset) !== "character").length;
      const exact = v.vector!.background && assets[v.vector!.background]?.meta.exact ? 3 : 0;
      return Math.min(people, 2) * 3 + Math.min(props, 3) - exact;
    };
    const best = vectors.reduce((a, b) => (score(b) > score(a) || (score(b) === score(a) && near(b) > near(a)) ? b : a));
    const people = best.vector!.layers.filter((l) => kind(l.asset) === "character");
    const xs = people.map((l) => l.x);
    // İki yanda da kişi var: yan başlık birinin üstüne düşer; yüzler üst yarıda, başlık alta.
    if (xs.some((x) => x < 760) && xs.some((x) => x > 1160)) return { shotId: best.shotId, side: "bottom" };
    const x = xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 960;
    return { shotId: best.shotId, side: x > 960 ? "left" : "right" };
  }
  const stills = timeline.visuals.filter((v) => v.kind === "still_motion" && v.assetUrl);
  if (!stills.length) return undefined;
  return { shotId: stills.reduce((a, b) => (near(b) > near(a) ? b : a)).shotId, side: "left" };
}

/** Küçük resim başlığının yazı boyu: kısa başlık iri, uzun başlık üç satıra sığacak kadar küçük. */
export function thumbnailTitleSize(title: string): number {
  const n = [...title].length;
  return n <= 14 ? 120 : n <= 26 ? 96 : n <= 44 ? 78 : 64;
}

/**
 * Küçük resim metni: başlık iki nokta/tire/dikey çizgiyle bölünmüşse en az iki kelimelik en kısa parça (YouTube küçük
 * resminde 3–5 kelime okunur; tam başlık zaten videonun adında). Bölünmemişse başlığın kendisi.
 */
export function thumbnailTitle(title: string): string {
  const parts = title
    .split(/\s*[:|–—]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= 2);
  return parts.length ? parts.reduce((a, b) => (b.length < a.length ? b : a)) : title.trim();
}
