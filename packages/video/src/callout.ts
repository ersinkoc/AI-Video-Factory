import type { PlacedLayer, VectorAsset, VectorShot } from "@ys/core";

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
  /**
   * İçerikli ekranlı (layer.screen) öznede ölçü nesne değil ekranın kendisi: ekranın ekrandaki boyu kare yüksekliğinin
   * bundan azıysa balon, balonda ekran büyür (6 Kas, Elon s3-sh2 ve Yapay zekâ ajanları s9-sh1: kamera dizüstüne 2,7 kata
   * yaklaştı, nesne karenin %19'u oldu ama sayfa ve gelen kutusu okunmuyordu; "minik, okunmuyor").
   */
  screenBelow: 0.12,
  /** Belirme: çekimin bu oranında başlar, bu sürede (oran) tamamlanır. */
  appear: 0.1,
  grow: 0.08,
  /** Kişinin üst gövdesinden örtülen alanın bedeldeki payı (yüz, yazı ve nesne 1). */
  body: 0.5,
  /** Seçilen yer bir kişinin üst gövdesinin bundan fazlasını örtecekse balon açılmaz (kişiyi örtmektense balonsuz). */
  bodyMax: 0.25,
  /**
   * İşaret çizgisi (6 Kas, Antik Mısır s1-sh2/s3-sh2: "noktalı çizgi sahneyi kesiyor, dikkat dağıtıyor"; 101 balonun
   * 7'sinde çizgi bir yüzden, 12'sinde bir gövdeden geçiyordu): yüzü bundan uzun (px) kesen yer seçilmez; gövdeden geçen
   * her px, leader kadar enli bir şeridi örtmüş sayılır (body ağırlığıyla).
   */
  graze: 6,
  /** Balonun kenarı nesneden en az bu kadar (px) uzakta: nesneyi örten yer seçilmez. */
  clear: 60,
  /**
   * Geniş çekimde de bir yüzün bundan fazlasını örten yer seçilmez (6 Kas, C s5-sh2: çizgisi yüzden geçmeyen tek yer
   * ikinci adamın başının tam üstündeydi; yüz örtmek eskiden yalnız bedeldi).
   */
  faceMax: 0.15,
  leader: 60,
  /**
   * Mobilya balona girmez (6 Kas, Antik Mısır s3-sh2: anlatılan nesne katibin alçak masasıydı, balon "minik bir masa
   * kopyası" gösteriyordu): üstüne bir şey konabilen (meta.surface) ve gerçek en uzun kenarı bundan uzun (m) nesne
   * okunacak bir şey değil, sahnenin eşyası. Küçük kutular, çip paketi, dizüstü aday kalır.
   */
  furniture: 0.6,
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
export function calloutTarget(
  spec: VectorShot,
  placed: PlacedLayer[],
  isProp: (index: number) => boolean,
  zoom: number,
  subject?: number,
  /** İçerikli ekranın katman boyundaki payı (bulunamazsa undefined). */
  screenShare: (index: number) => number | undefined = () => undefined,
): number | undefined {
  if (spec.math) return undefined;
  if (zoom >= CALLOUT.closeUp) {
    // Kamerayı yakına geniş çekimi dolduran ya da kişileri kadraja alan geçiş getirdiyse özne yok: anlatılan nesne (key)
    // sayılır (6 Kas, Elon s3-sh2: kamera 1,8'e geldi, PayPal sayfalı dizüstü karenin %12'siydi, balon açılmadı; "minik").
    const pl = placed.find((p) => p.index === (subject ?? spec.key));
    if (!pl || !isProp(pl.index)) return undefined;
    const share = spec.layers[pl.index]!.screen ? screenShare(pl.index) : undefined;
    const size = share === undefined ? Math.sqrt(pl.width * pl.height) * zoom < CALLOUT.closeBelow * H : pl.height * share * zoom < CALLOUT.screenBelow * H;
    return size ? pl.index : undefined;
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

/** Mobilya mı: üstüne bir şey konabilen ve gerçek en uzun kenarı CALLOUT.furniture'dan uzun (boyu bilinmiyorsa değil). */
export function isFurniture(asset: Pick<VectorAsset, "width" | "height" | "meta">): boolean {
  const { surface, realHeight } = asset.meta;
  return surface !== undefined && realHeight !== undefined && realHeight * Math.max(1, asset.width / asset.height) > CALLOUT.furniture;
}

/** İki kutunun kesişim alanı. */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Balonun aday merkezleri: üst yarıda, kenarlardan içeride (dikey videoda kırpılan kenarlar dahil); altyazı bandına inmez. */
export const CALLOUT_SPOTS: readonly (readonly [number, number])[] = [
  [W - 400, 330],
  [400, 330],
  [W - 400, 560],
  [400, 560],
  [W / 2 + 380, 290],
  [W / 2 - 380, 290],
];

type Point = readonly [number, number];

/** a→b doğru parçasının kutunun içinde kalan aralığı [t0, t1] (0–1, Liang–Barsky); kesmiyorsa undefined. */
export function clipSegment(a: Point, b: Point, box: Box): [number, number] | undefined {
  const d = [b[0] - a[0], b[1] - a[1]] as const;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-d[0], a[0] - box.x],
    [d[0], box.x + box.w - a[0]],
    [-d[1], a[1] - box.y],
    [d[1], box.y + box.h - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  return t0 < t1 ? [t0, t1] : undefined;
}

/**
 * İşaret çizgisinin görünen kısmı: balonun kenarından nesnenin kutusuna girdiği yere (nesnenin kendi üstündeki ucu,
 * elde tutulan telefon yüzün yanındaysa, yüzü kesiyor sayılmasın). Hedef balonun içindeyse çizgi yok.
 */
export function leaderOf(c: Point, target: Point, prop?: Box): [Point, Point] | undefined {
  const dist = Math.hypot(target[0] - c[0], target[1] - c[1]);
  if (dist <= CALLOUT.r) return undefined;
  const start: Point = [c[0] + ((target[0] - c[0]) * CALLOUT.r) / dist, c[1] + ((target[1] - c[1]) * CALLOUT.r) / dist];
  const enter = prop ? (clipSegment(start, target, prop)?.[0] ?? 1) : 1;
  return [start, [start[0] + (target[0] - start[0]) * enter, start[1] + (target[1] - start[1]) * enter]];
}

/**
 * Çizilen işaret çizgisinin ucu (balonun ortasından nesnenin noktasına giden çizgi): ekran yazısı olan nesnede çizgi
 * ekranın kenarında durur, nokta da orada (8 Kas, Linux s1-sh1 ve s4-sh5: çizgi nesnenin ortasındaki noktaya kadar
 * uzanıp yazının üstünden geçiyordu, "the dashed pointer line runs across the screen text"; incelemelerde 6 not). Çizgi
 * ekrana değmiyorsa ya da balon ekranın içindeyse uç nesnenin noktasıdır.
 */
export function leaderTip(at: Point, target: Point, screen?: Box): [number, number] {
  const t = screen ? clipSegment(at, target, screen)?.[0] : undefined;
  return t === undefined || t === 0 ? [target[0], target[1]] : [at[0] + (target[0] - at[0]) * t, at[1] + (target[1] - at[1]) * t];
}

/** Çizginin kutuların içinde kalan toplam boyu (px). */
export function leaderIn(line: [Point, Point] | undefined, boxes: Box[]): number {
  if (!line) return 0;
  const [a, b] = line;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return boxes.reduce((n, box) => {
    const t = clipSegment(a, b, box);
    return n + (t ? (t[1] - t[0]) * len : 0);
  }, 0);
}

/**
 * Bir adayın bir andaki bedeli: örttüğü yüz, yazı ve nesne alanı, kişilerin üst gövdesinden örttüğü alanın body'si
 * (5 Kas: balon kişilerin gövdesini örtüyordu, yalnız yüzleri sayılıyordu), işaret çizgisinin gövdelerden geçen boyu
 * (leader enli şerit, body ağırlığıyla; prop nesnenin kutusu), nesnenin üstüne biniyorsa ağır ceza (onu saklar) ve
 * nesneye uzaklığın iki katı.
 */
export function calloutCost(c: Point, target: Point, avoid: Box[], bodies: Box[] = [], prop?: Box): number {
  const { r } = CALLOUT;
  const box = { x: c[0] - r, y: c[1] - r, w: 2 * r, h: 2 * r };
  const covered = avoid.reduce((n, a) => n + overlap(box, a), 0) + CALLOUT.body * bodies.reduce((n, a) => n + overlap(box, a), 0);
  const line = CALLOUT.body * CALLOUT.leader * leaderIn(leaderOf(c, target, prop), bodies);
  const dist = Math.hypot(c[0] - target[0], c[1] - target[1]);
  return covered + line + (dist < r + CALLOUT.clear ? 1e7 : 0) + dist * 2;
}

/**
 * Seçilen yerde balon açılamaz mı: yakın çekimde (close) bir yüze değiyor, geniş çekimde bir yüzün faceMax'ından
 * çoğunu örtüyor, bir kişinin üst gövdesinin bodyMax'ından
 * çoğunu örtüyor (kişiyi örtmektense balonsuz) ya da, leader verilirse, nesnenin üstüne biniyor (clear) veya işaret
 * çizgisi bir yüzü graze'den uzun kesiyor.
 */
export function calloutBlocked(c: Point, faces: Box[], bodies: Box[], close: boolean, leader?: { target: Point; prop?: Box }): boolean {
  const { r } = CALLOUT;
  const box = { x: c[0] - r, y: c[1] - r, w: 2 * r, h: 2 * r };
  const line = leader ? leaderOf(c, leader.target, leader.prop) : undefined;
  return (
    faces.some((f) => overlap(box, f) > (close ? 0 : CALLOUT.faceMax * f.w * f.h)) ||
    bodies.some((b) => overlap(box, b) > CALLOUT.bodyMax * b.w * b.h) ||
    (leader !== undefined && Math.hypot(c[0] - leader.target[0], c[1] - leader.target[1]) < r + CALLOUT.clear) ||
    faces.some((f) => leaderIn(line, [f]) > CALLOUT.graze)
  );
}

/** Balonun merkezi: bedeli en düşük aday; eşitlikte listede önce gelen. */
export function calloutSpot(target: readonly [number, number], avoid: Box[], bodies: Box[] = []): [number, number] {
  let best = CALLOUT_SPOTS[0]!;
  let score = Infinity;
  for (const c of CALLOUT_SPOTS) {
    const s = calloutCost(c, target, avoid, bodies);
    if (s < score) {
      score = s;
      best = c;
    }
  }
  return [best[0], best[1]];
}

/** Belirme ölçeği (0–1, küçük bir taşmayla): from'dan (en erken appear) sonra yaylanarak açılır. */
export function calloutScale(p: number, from: number = CALLOUT.appear): number {
  const q = Math.min(1, Math.max(0, (p - Math.max(CALLOUT.appear, from)) / CALLOUT.grow));
  const c = 1.70158;
  return q === 0 ? 0 : 1 + (c + 1) * (q - 1) ** 3 + c * (q - 1) ** 2;
}
