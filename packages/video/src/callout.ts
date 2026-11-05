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
  /** Masaya/rafa konan nesneye yönetmen istemeden balon: yalnız gerçekten okunmayacak kadar küçükse. */
  restingBelow: 0.06,
  /** Yönetmen istese de bundan büyük görünen nesneye balon açılmaz (zaten okunuyor). */
  askedBelow: 0.25,
  /** Bu zoom'dan itibaren yakın çekim: balon yalnız kameranın okunur boya getiremediği özne nesneye açılır. */
  closeUp: 1.5,
  /** Yakın çekimin öznesi olan nesne ekranda (alanın karekökü) kare yüksekliğinin bundan azıysa balon. */
  closeBelow: 0.15,
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
 * Balonla gösterilecek katman: yönetmenin seçtiği küçük nesne, yoksa anlatılan nesne (key) hâlâ küçükse o, yoksa elde
 * tutulan küçük nesne, o da yoksa masaya/rafa
 * konan çok küçük nesnelerin en küçüğü (3 Kas, Java planı: yönetmen 27 çekimde hiç balon seçmedi; C# incelemesi: "zarf
 * masada minik", "Java penceresi küçük"). Üstünde bir şey duran yüzey aday değil. Haritada ve Manim tahtalı çekimde balon
 * yok. Yakın çekimde yalnız özne nesne (closeUpCamera'nın subject'i), kamera onu okunur boya getiremediyse: başı kadrajda
 * tutulan kişinin masasındaki çek, kâğıt, disket hâlâ minikti (4 Kas yakın çekim denetimi, 131 çekimin 18'i).
 */
export function calloutTarget(spec: VectorShot, placed: PlacedLayer[], isProp: (index: number) => boolean, zoom: number, subject?: number): number | undefined {
  if (spec.math) return undefined;
  if (zoom >= CALLOUT.closeUp) {
    const pl = placed.find((p) => p.index === subject);
    return pl && isProp(pl.index) && Math.sqrt(pl.width * pl.height) * zoom < CALLOUT.closeBelow * H ? pl.index : undefined;
  }
  const small = (pl: PlacedLayer, below: number) => pl.height * zoom < below * H;
  if (spec.callout !== undefined) {
    const asked = placed.find((pl) => pl.index === spec.callout);
    return asked && isProp(asked.index) && small(asked, CALLOUT.askedBelow) ? asked.index : undefined;
  }
  // Anlatılan nesne (VectorShot.key) kamera yaklaştıktan sonra hâlâ küçükse; değilse öteki adaylara bakılır.
  const key = placed.find((pl) => pl.index === spec.key && isProp(pl.index) && small(pl, CALLOUT.askedBelow));
  if (key) return key.index;
  const held = placed.find((pl) => pl.heldBy !== undefined && isProp(pl.index) && small(pl, CALLOUT.autoBelow));
  if (held) return held.index;
  const surfaces = new Set(placed.map((pl) => pl.on));
  const resting = placed.filter((pl) => pl.on !== undefined && !surfaces.has(pl.index) && isProp(pl.index) && small(pl, CALLOUT.restingBelow));
  return resting.sort((a, b) => a.height - b.height || a.index - b.index)[0]?.index;
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

/** Belirme ölçeği (0–1, küçük bir taşmayla): from'dan (en erken appear) sonra yaylanarak açılır. */
export function calloutScale(p: number, from: number = CALLOUT.appear): number {
  const q = Math.min(1, Math.max(0, (p - Math.max(CALLOUT.appear, from)) / CALLOUT.grow));
  const c = 1.70158;
  return q === 0 ? 0 : 1 + (c + 1) * (q - 1) ** 3 + c * (q - 1) ** 2;
}
