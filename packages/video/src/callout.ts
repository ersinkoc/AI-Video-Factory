import type { PlacedLayer, VectorShot } from "@ys/core";

/**
 * Büyütme balonu (3 Kas): geniş çekimde anlatılan küçük nesne (kâğıt, ekran, çip, kart) birkaç piksel kalıyordu;
 * inceleme karelerinin %60'ında "ana nesne küçük, içeriği okunmuyor" vardı. Nesne yuvarlak bir pencerede büyük
 * gösterilir, ince bir çizgiyle sahnedeki yerine bağlanır. Fizik değişmez (nesne gerçek boyunda kalır), yalnız okunur.
 */
export const CALLOUT = {
  /** Balon yarıçapı (1920×1080 tuval). */
  r: 175,
  /** Yönetmen istemeden balon: elde tutulan nesne ekranda kare yüksekliğinin bundan azıysa. */
  autoBelow: 0.1,
  /** Yönetmen istese de bundan büyük görünen nesneye balon açılmaz (zaten okunuyor). */
  askedBelow: 0.25,
  /** Bu zoom'dan itibaren yakın çekim: nesne zaten büyük. */
  closeUp: 1.5,
  /** Belirme: çekimin bu oranında başlar, bu sürede (oran) tamamlanır. */
  appear: 0.1,
  grow: 0.08,
} as const;

const W = 1920;
const H = 1080;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Balonla gösterilecek katman: yönetmenin seçtiği küçük nesne, yoksa elde tutulan küçük nesne. Yakın çekimde, haritada ve
 * Manim tahtalı çekimde balon yok (nesne zaten büyük ya da orta alan dolu).
 */
export function calloutTarget(spec: VectorShot, placed: PlacedLayer[], isProp: (index: number) => boolean, zoom: number): number | undefined {
  if (zoom >= CALLOUT.closeUp || spec.math) return undefined;
  const small = (pl: PlacedLayer, below: number) => pl.height * zoom < below * H;
  if (spec.callout !== undefined) {
    const asked = placed.find((pl) => pl.index === spec.callout);
    return asked && isProp(asked.index) && small(asked, CALLOUT.askedBelow) ? asked.index : undefined;
  }
  return placed.find((pl) => pl.heldBy !== undefined && isProp(pl.index) && small(pl, CALLOUT.autoBelow))?.index;
}

/** İki kutunun kesişim alanı. */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Balonun merkezi: üst yarıda, kenarlardan içeride (dikey videoda kırpılan kenarlar dahil) aday noktalar arasından
 * yüzleri, yazıları ve nesnenin kendisini en az örten; eşitlikte nesneye yakın olan. Altyazı bandına inmez.
 */
export function calloutSpot(target: readonly [number, number], avoid: Box[]): [number, number] {
  const { r } = CALLOUT;
  const candidates: [number, number][] = [
    [W - 400, 330],
    [400, 330],
    [W - 400, 560],
    [400, 560],
    [W / 2 + 380, 290],
    [W / 2 - 380, 290],
  ];
  let best = candidates[0]!;
  let score = Infinity;
  for (const c of candidates) {
    const box = { x: c[0] - r, y: c[1] - r, w: 2 * r, h: 2 * r };
    const covered = avoid.reduce((n, a) => n + overlap(box, a), 0);
    const dist = Math.hypot(c[0] - target[0], c[1] - target[1]);
    // Nesnenin üstüne binen balon onu saklar: ağır ceza.
    const s = covered + (dist < r + 60 ? 1e7 : 0) + dist * 2;
    if (s < score) {
      score = s;
      best = c;
    }
  }
  return best;
}

/** Belirme ölçeği (0–1, küçük bir taşmayla): yaylanarak açılır. */
export function calloutScale(p: number): number {
  const q = Math.min(1, Math.max(0, (p - CALLOUT.appear) / CALLOUT.grow));
  const c = 1.70158;
  return q === 0 ? 0 : 1 + (c + 1) * (q - 1) ** 3 + c * (q - 1) ** 2;
}
