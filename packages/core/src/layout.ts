import { READABLE_SIDE } from "./rules.ts";
import type { VectorAsset, VectorLayer, VectorShot } from "./vector.ts";

/**
 * Sahne fiziği: Claude katmanları derinlik ve ilişkilerle tarif eder, bu modül ayağın bastığı noktayı, perspektif
 * ölçeğini, gerçek boyu ve çizim sırasını hesaplar. Saf fonksiyondur (render ve doğrulama aynı sonucu görür).
 * 30 Eki geri bildirimi: "ayaklar masa üstünde kalıyor, katmanlar alt üst, her şey fiziğe uymalı".
 */

export const STAGE = {
  width: 1920,
  height: 1080,
  /** Derinlik 0'daki (kameraya en yakın) ayak çizgisi. */
  floorNear: 1050,
  /** Arka plan zemin çizgisini bildirmezse. */
  defaultFloorY: 700,
  /** Derinlik 0'da 1 metrenin piksel karşılığı: 1,7 m insan ≈ 680 px. */
  pxPerMeter: 400,
  /** Derinlik 1'deki (odanın dibi) ölçek. */
  farScale: 0.5,
} as const;

const DEFAULT_REAL_HEIGHT: Record<VectorAsset["kind"], number> = { character: 1.7, prop: 0.8, background: 0 };
/** Elde tutulan nesnenin varsayılan boyu (m). */
const HELD_REAL_HEIGHT = 0.3;
/** Duvardaki/havadaki öğe arkada durur: gerçek boyunun bu kesriyle çizilir. */
const WALL_SCALE = 0.8;

/** Nesnenin boyunu, en uzun kenarı okunabilir sınırın altına düşmeyecek şekilde büyütür. */
function readableHeight(h: number, aspect: number, minSide: number, fixes: string[]): number {
  const min = minSide / Math.max(aspect, 1);
  if (h >= min) return h;
  fixes.push("okunamayacak kadar küçüktü, büyütüldü");
  return min;
}

export interface PlacedLayer {
  index: number;
  /** Alt-orta nokta ve boyut (px). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Perspektif ölçeği (derinlik 0 = 1). */
  scale: number;
  /** Çizim sırası: büyük olan önde. */
  z: number;
  /** Karakter bir şeyin üstünde oturuyor. */
  sitting: boolean;
  /**
   * Yerde ya da bir yüzeyin üstünde duruyor (karakter, mobilya, masadaki nesne): yerçekimine uyar, render'da havaya
   * kalkmaz (yalnız yatay hareket, süzülme yok). Duvardaki/havadaki ve elde tutulan nesnelerde false.
   */
  grounded: boolean;
  /** Bu nesneyi tutan karakter katmanı; konum her karede eline göre hesaplanır. */
  heldBy?: number;
  /** Üstünde durduğu/oturduğu katman (masa, sandalye). */
  on?: number;
  /** Yerleşimi koddan düzeltildiyse nedeni (inceleme ve testler için). */
  fixes: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Arka planın zemin çizgisi (duvar–zemin birleşimi). */
export function floorYOf(spec: VectorShot, assets: Record<string, VectorAsset>): number {
  const bg = spec.background ? assets[spec.background] : undefined;
  return clamp(bg?.meta.floorY ?? STAGE.defaultFloorY, 480, 900);
}

/** Derinlikten ayak çizgisi ve ölçek. */
export function depthToFloor(depth: number, floorY: number): { y: number; scale: number } {
  const d = clamp(depth, 0, 1);
  return {
    y: STAGE.floorNear - (STAGE.floorNear - (floorY + 20)) * d,
    scale: 1 - (1 - STAGE.farScale) * d,
  };
}

/** Ayak çizgisinden derinlik (eski, pikselle verilmiş katmanları fiziğe çevirmek için). */
export function floorToDepth(y: number, floorY: number): number {
  return clamp((STAGE.floorNear - y) / (STAGE.floorNear - (floorY + 20)), 0, 1);
}

const isGrounded = (layer: VectorLayer, asset: VectorAsset, floorY: number) =>
  asset.kind === "character" ||
  asset.meta.grounded === true ||
  (asset.meta.grounded === undefined && layer.depth !== undefined) ||
  (asset.meta.grounded === undefined && layer.y !== undefined && layer.y > floorY);

const entering = (layer: VectorLayer) => layer.anims.some((a) => a.type === "walk" || a.type === "slide_in" || a.type === "move");
/**
 * Kişinin yüzünü örten, yere basan eşya: ayaktaki kişi kenara çekilir; oturanın önündeki eşya en çok lower kesri kadar
 * alçaltılır (kürsü 1,5 m → 0,98 m), daha fazlası gerçek ölçüye aykırı. Tezgâhın (üstü olan eşya) ardında ayakta duran ve
 * ayakları tezgâhın ardında kalan kişi önce yükselir: göğsü (boyunun chest kesri) tezgâhın üstüne gelene dek, en çok boyunun
 * lift kesri kadar.
 */
export const FURNITURE = {
  lower: 0.35,
  lift: 0.6,
  chest: 0.6,
  aside: "önündeki eşya yüzünü örtüyordu, kenara çekildi",
  lowered: "önündeki oturanın yüzünü örtüyordu, alçaltıldı",
  lifted: "tezgâhın ardında yüzü görünmüyordu, yükseltildi",
} as const;

/**
 * Konuşma mesafesi (m, iki kişinin ortaları arası) ve geçişin sınırları: aynı derinlikte sayılan z farkı, geçişin
 * uygulandığı en büyük yönetmen zoom'u (altı geniş çekim), kişinin gövde yarı genişliği (çizim genişliğinin kesri; kollar
 * hariç).
 */
export const CONVERSE = { max: 1.1, depth: 25, zoom: 1.5, body: 0.22, note: "konuşma mesafesinden uzaktı, yaklaştırıldı" } as const;

/**
 * Ayaktaki iki kişi konuşma mesafesine gelir (3 Kas, inceleme notları: "stand far apart, not interacting" bölüm başına
 * onlarca kez; ölçüm: yan yana duran çiftlerin %37'si 2 m'den, %17'si 2,5 m'den uzaktı). Aynı derinlikte x sırasıyla
 * komşu iki kişi CONVERSE.max'tan uzaksa aradaki fazlayı ikisi yarı yarıya kapatır. Aralarındaki eşya (masa, pano,
 * duvardaki ekran: gövdeleriyle aynı yükseklikteyse) aşılmaz, kişi onun kenarında durur. Kendi dışındaki bir nesneyi
 * gösteren kişi yerinde kalır, yaklaşmayı öbürü yapar. Yalnız geniş çekimde (yakın kadraj yönetmenin konumlarına göre
 * kurulmuş) ve Manim tahtası yokken (tahta ortada, kişiler yanlarında durur); giren, yürüyen ve oturan kişiye dokunulmaz.
 */
function converse(spec: VectorShot, assets: Record<string, VectorAsset>, list: PlacedLayer[], moved: (p: PlacedLayer) => void): void {
  const zoom = Math.max(spec.camera.zoomFrom, spec.camera.zoomTo);
  if (zoom >= CONVERSE.zoom || spec.math) return;
  const layer = (p: PlacedLayer) => spec.layers[p.index]!;
  const person = (p: PlacedLayer) => assets[layer(p).asset]!.kind === "character";
  const talkers = list.filter((p) => person(p) && !p.sitting && p.heldBy === undefined && !entering(layer(p))).sort((a, b) => a.x - b.x);
  const things = list.filter((o) => !person(o) && o.heldBy === undefined);
  // Yürüyerek giren kişinin vardığı yer (son walk/move hedefi; kayarak giren yerinde durur): iki kişi onun aralarına
  // geleceği yeri kapatmaz (PHP s4-sh5: öğrenciler yaklaşınca aralarına yürüyen Lerdorf ikisinin içinden geçiyordu).
  const arrivals = list
    .filter((p) => person(p) && entering(layer(p)))
    .map((p) => ({ z: p.z, x: layer(p).anims.reduce((x, a) => (a.toX !== undefined && (a.type === "walk" || a.type === "move") ? a.toX : x), p.x) }));
  // Kişi kendi dışında (öbürüne göre arkasında kalan yanda) bir nesneyi gösteriyor mu; iş başındaki (klavye, yazı) da
  // yerinde kalır, yoksa yanına geçtiği masadan/tahtadan uzaklaşırdı.
  const anchored = (p: PlacedLayer, outward: number) =>
    layer(p).anims.some((a) => {
      if (working(a)) return true;
      const t = a.type === "point" && a.target !== undefined ? list.find((o) => o.index === a.target) : undefined;
      return t !== undefined && !person(t) && (t.x - p.x) * outward >= 0;
    });
  // Üç ve daha çok kişide ortadaki birine yaklaşırken öbüründen uzaklaşır: hiçbir çift kıpırdamayana kadar tekrarlanır
  // (fazla her turda yarılanır). Kişiler birbirinin üstünden geçmez, x sırası korunur.
  for (let round = 0; round < 40; round++) {
    let any = false;
    for (let k = 1; k < talkers.length; k++) any = pull(talkers[k - 1]!, talkers[k]!) || any;
    if (!any) break;
  }
  function pull(a: PlacedLayer, b: PlacedLayer): boolean {
    if (Math.abs(a.z - b.z) > CONVERSE.depth) return false;
    if (arrivals.some((w) => w.x > a.x && w.x < b.x && Math.abs(w.z - a.z) <= CONVERSE.depth)) return false;
    const excess = b.x - a.x - CONVERSE.max * STAGE.pxPerMeter * ((a.scale + b.scale) / 2);
    if (excess < 1) return false;
    // Aradaki, gövde yüksekliğinde duran eşya: kişiler kenarlarına kadar gelir.
    const top = Math.min(a.y - a.height * 0.95, b.y - b.height * 0.95);
    const bottom = Math.max(a.y - a.height * 0.2, b.y - b.height * 0.2);
    const between = things.filter((o) => o.x + o.width / 2 > a.x && o.x - o.width / 2 < b.x && o.y - o.height < bottom && o.y > top);
    const roomA = anchored(a, -1) ? 0 : Math.max(0, Math.min(a.x + excess, ...between.map((o) => o.x - o.width / 2 - a.width * CONVERSE.body)) - a.x);
    const roomB = anchored(b, 1) ? 0 : Math.max(0, b.x - Math.max(b.x - excess, ...between.map((o) => o.x + o.width / 2 + b.width * CONVERSE.body)));
    // Yarı yarıya; biri yer bulamazsa öbürü kalanı (sınırına kadar) üstlenir.
    let da = Math.min(excess / 2, roomA);
    const db = Math.min(excess - da, roomB);
    da = Math.min(excess - db, roomA);
    if (da + db < 1) return false;
    a.x += da;
    b.x -= db;
    if (da >= 1) moved(a);
    if (db >= 1) moved(b);
    return true;
  }
}

/**
 * Önünde iş isteyen jestler (klavye, yazı) ve ellerin bölgesi: kutunun ortadaki 2 × half genişliği, ayaktan boyun
 * low–high kesri yükseklik. reach: kişinin işine yürüyebileceği en uzak mesafe (m). İş yüzeyinin üstü bölgenin içinde
 * ya da en çok below × boy altında olmalı; oturanda seated: uyluk kısalınca gövde boyun ~%9'u iner (Vector.tsx
 * SIT_DROP), eller de onunla. behind: işinin başına geçen kişi yüzeyin kenarlarından bu kesir kadar içeride durur.
 */
export const WORK = {
  gestures: ["typing", "writing"],
  half: 0.3,
  low: 0.38,
  high: 0.62,
  reach: 2.5,
  below: 0.08,
  seated: 0.17,
  behind: 0.3,
  note: "iş jestinin masasından uzaktı, masanın arkasına geçti",
} as const;
const working = (a: VectorLayer["anims"][number]) => (WORK.gestures as readonly string[]).includes(a.type);

/** İş jestinde ellerin tuvaldeki bölgesi. */
export function workZone(p: Pick<PlacedLayer, "x" | "y" | "width" | "height">): { l: number; r: number; t: number; b: number } {
  return { l: p.x - p.width * WORK.half, r: p.x + p.width * WORK.half, t: p.y - p.height * WORK.high, b: p.y - p.height * WORK.low };
}

/** Eşyanın iş yüzeyi (masa, tezgâh): üstü olan mobilyanın (meta.surface) üst yüzeyinin y'si; kişi ve elde tutulan değil. */
export function workTopOf(o: PlacedLayer, asset: VectorAsset | undefined): number | undefined {
  if (!asset || asset.kind === "character" || asset.meta.surface === undefined || o.heldBy !== undefined) return undefined;
  return o.y - o.height * asset.meta.surface;
}

export interface WorkSurface {
  pl: PlacedLayer;
  /** Üst yüzeyin y'si (tuval). */
  top: number;
}

/**
 * Kişinin ellerinin değdiği iş yüzeyi: yatayda ellerin bölgesine giren, üstü el hizasında olan masa/tezgâh; oturanın
 * oturduğu sandalye sayılmaz. Birden çoksa üstü ellere en yakını. 4 Kas: eskiden ellerin bölgesine değen her eşya
 * sayılıyordu; kişi arkasındaki arabaya, duvardaki laptopa, top arabasına "yazıyor", oturan kişi yalnız sandalyesinin
 * oturağıyla "masa başında" sayılıyordu (26 iş jestinin 9'u; incelemede "yazmıyor, elleri kavuşuk duruyor").
 */
export function workSurface(p: PlacedLayer, surfaces: readonly WorkSurface[]): WorkSurface | undefined {
  const z = workZone(p);
  const low = z.b + p.height * (p.sitting ? WORK.seated : WORK.below);
  return surfaces
    .filter(({ pl, top }) => pl.index !== p.on && pl.x - pl.width / 2 < z.r && pl.x + pl.width / 2 > z.l && top >= z.t && top <= low)
    .sort((a, b) => Math.abs(a.top - z.b) - Math.abs(b.top - z.b))[0];
}

/**
 * Panoya yazma (4 Kas; "tahtaya yazıyor" denilen kişi tahtanın yanında boş duruyordu: yazı jesti masa istediği için
 * düşüyor, sahne yeniden planlanıyordu). Yazılabilir pano (tahta, kara tahta, kâğıt sehpası): çizimin işareti
 * (meta.writable), işareti olmayan eski çizimde katmanın adı (WRITABLE_NAME). Yazma bandı ayaktan boyun low–high kesri
 * (omuzla göz arası); pano bu bandı kesmeli ve kişinin ortasından en çok reach × boy + shoulder × genişlik (omuz)
 * uzakta olmalı. Kalem panonun yakın kenarından inset × boy içeride (çerçevede değil, yazı alanında), ayaktan at × boy
 * yükseklikte yazar. Panosuna giden kişi kenarında, gövde ortası kenardan stand × genişlik dışarıda durur; panonun
 * önündeki de kenarına geçer, kenar yürünemeyecek kadar uzaksa önünde kalıp gövdesinin yanına yazar.
 */
export const BOARD = { low: 0.62, high: 0.8, at: 0.7, reach: 0.22, shoulder: 0.15, inset: 0.1, stand: 0.3, note: "panoya yazıyordu, panonun yanına geçti" } as const;
export const WRITABLE_NAME = /white-?board|black-?board|chalk|flip-?chart|easel|tahta/i;

/** Üstüne ayakta yazılan pano mu: çizimin işareti, yoksa katmanın adı. */
export function isWritable(id: string, asset: VectorAsset | undefined): boolean {
  return asset?.kind === "prop" && (asset.meta.writable ?? WRITABLE_NAME.test(id));
}

export interface WorkBoard {
  pl: PlacedLayer;
  /** Kalemin panodaki yeri (tuval). */
  at: [number, number];
}

/** Yazma bandını kesen, kişinin uzanabildiği panolar (z'ye bakmadan) ve panoya uzaklık. */
function boardsInReach(p: PlacedLayer, boards: readonly PlacedLayer[], reach: number): PlacedLayer[] {
  const t = p.y - p.height * BOARD.high;
  const b = p.y - p.height * BOARD.low;
  return boards.filter((o) => o.heldBy === undefined && o.y - o.height < b && o.y > t && boardGap(p, o) <= reach).sort((x, y) => boardGap(p, x) - boardGap(p, y));
}
const boardGap = (p: PlacedLayer, o: PlacedLayer) => Math.max(0, Math.abs(o.x - p.x) - o.width / 2);

/**
 * Kişinin yazdığı pano ve kalemin yeri: yazma bandını kesen, kişiden önce (arkasında) çizilen, kolunun yettiği en yakın
 * pano. Pano yanındaysa kalem yakın kenarından içeride; kişi panonun önündeyse gövdesinin pano ortası yanında.
 */
export function workBoard(p: PlacedLayer, boards: readonly PlacedLayer[]): WorkBoard | undefined {
  const o = boardsInReach(
    p,
    boards.filter((o) => o.z < p.z),
    p.height * BOARD.reach + p.width * BOARD.shoulder,
  )[0];
  if (!o) return undefined;
  const inset = p.height * BOARD.inset;
  const side = Math.sign(o.x - p.x) || 1;
  const l = o.x - o.width / 2;
  const r = o.x + o.width / 2;
  const x = boardGap(p, o) > 0 ? (side > 0 ? l + inset : r - inset) : p.x + side * (p.width * BOARD.shoulder + inset);
  const span = (lo: number, hi: number, v: number) => clamp(v, Math.min(lo + inset, (lo + hi) / 2), Math.max(hi - inset, (lo + hi) / 2));
  return { pl: o, at: [span(l, r, x), span(o.y - o.height, o.y, p.y - p.height * BOARD.at)] };
}

/**
 * İş jesti yapan ayaktaki kişi işinin başına, masanın arkasına geçer (3 Kas denetimi: kişi masadan 300–450 px uzakta
 * havaya yazıyordu; 4 Kas: masanın kenarında durunca eller kendi gövdesinin önünde kalıyor, masaya değmiyordu). Elleri
 * bir masaya değiyorsa o, değmiyorsa WORK.reach içindeki el hizasında en yakın masa: gövde masanın ortadaki bölümüne
 * gelir ve masa önde çizilir (bacaklar masanın ardında, eller üstünde). Oturan kişi sandalyesiyle birlikte kayar
 * (PHP s1-sh1: sandalye masanın yanındaydı); yalnız sandalye masanın arkasındaysa ve üstünde başkası yoksa. Ayakta
 * yazan, eli bir masaya değmiyorsa panosuna da gidebilir (BOARD): kolu yetiyorsa yerinde kalıp panonun önüne çizilir,
 * yetmiyorsa en yakın masadan yakın bir panonun kenarına geçer. Masa yoksa yerinde kalır (render jesti düşürür, sahne
 * yeniden planlanır). Giren kişiye dokunulmaz.
 */
function toWork(spec: VectorShot, assets: Record<string, VectorAsset>, list: PlacedLayer[], moved: (p: PlacedLayer, note: string) => void): void {
  const layer = (p: PlacedLayer) => spec.layers[p.index]!;
  const person = (p: PlacedLayer) => assets[layer(p).asset]!.kind === "character";
  const surfaces = list.flatMap((o) => {
    const top = workTopOf(o, assets[layer(o).asset]);
    return top === undefined ? [] : [{ pl: o, top }];
  });
  const boards = list.filter((o) => isWritable(layer(o).asset, assets[layer(o).asset]));
  for (const p of list) {
    if (!person(p) || p.heldBy !== undefined || entering(layer(p)) || !layer(p).anims.some(working)) continue;
    // Oturanın sandalyesi (oturan hep bir şeyin üstündedir); paylaşılan oturak kaymaz.
    const seat = p.sitting ? list.find((o) => o.index === p.on)! : undefined;
    if (seat && (workSurface(p, surfaces) || list.some((o) => o !== p && o.on === seat.index))) continue;
    const zone = workZone(p);
    const low = zone.b + p.height * (seat ? WORK.seated : WORK.below);
    // Yakın kenara uzaklık; masanın üstündeyse 0.
    const gap = (o: PlacedLayer) => Math.max(0, Math.abs(o.x - p.x) - o.width / 2);
    const reach = WORK.reach * STAGE.pxPerMeter * p.scale;
    const touching = workSurface(p, surfaces);
    const at = touching ?? surfaces.filter(({ pl, top }) => pl !== seat && top >= zone.t && top <= low && gap(pl) <= reach).sort((a, b) => gap(a.pl) - gap(b.pl))[0];
    if (!seat && !touching && layer(p).anims.some((a) => a.type === "writing")) {
      const ready = boardsInReach(p, boards, p.height * BOARD.reach + p.width * BOARD.shoulder)[0];
      const far = boardsInReach(p, boards, reach)[0];
      const board = ready ?? (far && (!at || gap(far) < gap(at.pl)) ? far : undefined);
      if (board) {
        const before = [p.x, p.z];
        // Panonun önündeki kişi yazdığını gövdesiyle örtüyordu (C s3-sh4): yakın kenarına geçer (tam ortadaysa sahnede yeri
        // olan yana); kenar yürünemeyecek kadar uzaksa (duvar boyu kara tahta) önünde kalır.
        const side = Math.sign(board.x - p.x) || (board.x < STAGE.width / 2 ? -1 : 1);
        const x = clamp(board.x - side * (board.width / 2 + p.width * BOARD.stand), p.width / 2 + 20, STAGE.width - p.width / 2 - 20);
        if (!ready || (boardGap(p, board) === 0 && Math.abs(x - p.x) <= reach)) p.x = x;
        p.z = Math.max(p.z, board.z + 0.1);
        if (p.x !== before[0] || p.z !== before[1]) moved(p, BOARD.note);
        continue;
      }
    }
    if (!at || (seat && seat.z >= at.pl.z)) continue;
    const span = (at.pl.width / 2) * (1 - 2 * WORK.behind);
    const x = clamp(clamp(p.x, at.pl.x - span, at.pl.x + span), p.width / 2 + 20, STAGE.width - p.width / 2 - 20);
    if (seat) {
      seat.x += x - p.x;
      p.x = x;
      moved(p, WORK.note);
      continue;
    }
    if (Math.abs(x - p.x) < 1 && p.z < at.pl.z) continue;
    p.x = x;
    p.z = Math.min(p.z, at.pl.z - 0.1);
    moved(p, WORK.note);
  }
}

/**
 * Yanından geçme: aynı derinlikte (fark same'den az) birinin durduğu yerden geçen kişi depth kadar öne alınır (önünden
 * geçer; kameranın dibindeyse arkasından). margin: duruş yeri yolun ucundan en az bu kadar (iki genişliğin toplamının
 * kesri) içerideyse geçiş sayılır.
 */
export const PASS = { depth: 0.12, same: 0.1, margin: 0.18, note: "aynı derinlikte birinin içinden geçiyordu, önünden geçiyor" } as const;

/**
 * Yürüyen/kayarak giren kişinin derinliği (3 Kas denetimi: Hesap s3-sh7'de tahtaya yürüyen Hoff aynı derinlikteki
 * Mazor'un içinden geçiyordu; aynı yandan kayarak giren iki kişi birbirinin içinden geçerek yerine oturuyordu). Yerleşimden
 * önce yönetmenin konumlarıyla: katman → yeni derinlik.
 */
function passBy(spec: VectorShot, assets: Record<string, VectorAsset>, floorY: number): Map<number, number> {
  const people = spec.layers.flatMap((l, i) => {
    const a = assets[l.asset];
    if (a?.kind !== "character" || l.on !== undefined || l.heldBy !== undefined) return [];
    const depth = l.depth ?? (l.y !== undefined ? floorToDepth(l.y, floorY) : 0.3);
    const w = (a.meta.realHeight ?? DEFAULT_REAL_HEIGHT.character) * STAGE.pxPerMeter * depthToFloor(depth, floorY).scale * (a.width / a.height);
    let lo = l.x;
    let hi = l.x;
    let end = l.x;
    for (const x of l.anims) {
      if ((x.type === "walk" || x.type === "move") && x.toX !== undefined) [lo, hi, end] = [Math.min(lo, x.toX), Math.max(hi, x.toX), x.toX];
      if (x.type === "slide_in" && (x.from ?? "left") === "left") lo = Math.min(lo, -w);
      if (x.type === "slide_in" && x.from === "right") hi = Math.max(hi, STAGE.width + w);
    }
    return [{ i, depth, w, lo, hi, end }];
  });
  const out = new Map<number, number>();
  for (const a of people) {
    if (a.lo === a.hi) continue;
    for (const b of people) {
      const da = out.get(a.i) ?? a.depth;
      if (b === a || Math.abs(da - (out.get(b.i) ?? b.depth)) >= PASS.same) continue;
      const m = (a.w + b.w) * PASS.margin;
      if (b.end <= a.lo + m || b.end >= a.hi - m) continue;
      out.set(a.i, da >= PASS.depth ? da - PASS.depth : da + PASS.depth);
    }
  }
  return out;
}

export function resolveLayout(spec: VectorShot, assets: Record<string, VectorAsset>): PlacedLayer[] {
  const floorY = floorYOf(spec, assets);
  const passing = passBy(spec, assets, floorY);
  const placed = new Map<number, PlacedLayer>();
  const resolving = new Set<number>();

  const resolve = (i: number): PlacedLayer | undefined => {
    if (placed.has(i)) return placed.get(i);
    const layer = spec.layers[i];
    const asset = layer ? assets[layer.asset] : undefined;
    if (!layer || !asset || resolving.has(i)) return undefined;
    resolving.add(i);

    const aspect = asset.width / asset.height;
    const real = asset.meta.realHeight ?? DEFAULT_REAL_HEIGHT[asset.kind];
    const fixes: string[] = [];
    let out: Omit<PlacedLayer, "width">;

    const holder = layer.heldBy !== undefined && layer.heldBy !== i ? resolve(layer.heldBy) : undefined;
    const holderAsset = holder ? assets[spec.layers[holder.index]!.asset] : undefined;
    const onto = layer.on !== undefined && layer.on !== i ? resolve(layer.on) : undefined;
    // Karakter başka bir karakterin üstüne oturmaz (iskelet ata binemez): binici havada asılı kalıyordu.
    const base = onto && asset.kind === "character" && assets[spec.layers[onto.index]!.asset]!.kind === "character" ? undefined : onto;

    // Karakter elde tutulmaz (iskelet bir insanı taşıyamaz): tutulan karakter kendi yerinde durur; yoksa 1,8 m'lik
    // "çanta karakteri" elde asılı kalıyordu (30 Eki, Pony Express).
    if (holder && holderAsset?.kind === "character" && asset.kind !== "character") {
      // Elde: boy tutanın ölçeğiyle; konum render'da elden gelir, burada el hizası yaklaşık.
      const real = readableHeight(asset.meta.realHeight ?? HELD_REAL_HEIGHT, aspect, READABLE_SIDE.held, fixes);
      const h = real * STAGE.pxPerMeter * holder.scale;
      out = { index: i, x: holder.x, y: holder.y - holder.height * 0.3, height: h, scale: holder.scale, z: holder.z + 0.3, sitting: false, grounded: false, heldBy: holder.index, fixes };
    } else if (base) {
      const baseAsset = assets[spec.layers[base.index]!.asset]!;
      const sized = asset.kind === "character" ? real : readableHeight(real, aspect, READABLE_SIDE.surface, fixes);
      const h = sized * STAGE.pxPerMeter * base.scale;
      if (asset.kind === "character") {
        // Sandalyede/bankta oturur: ayaklar yerde, oturağın önünde.
        out = { index: i, x: base.x, y: base.y + 2, height: h, scale: base.scale, z: base.z + 0.5, sitting: true, grounded: true, on: base.index, fixes };
      } else {
        // Yüzeyin üstünde: yüzey yüksekliği tabanın boyundan; yüzeyden taşmasın.
        const surfaceY = base.y - base.height * (baseAsset.meta.surface ?? (baseAsset.kind === "character" ? 0.5 : 1));
        const halfBase = base.width / 2;
        const x = clamp(layer.x, base.x - halfBase * 0.8, base.x + halfBase * 0.8);
        if (x !== layer.x) fixes.push("yüzeyin dışına taşıyordu, içeri alındı");
        out = { index: i, x, y: surfaceY, height: h, scale: base.scale, z: base.z + 0.4, sitting: false, grounded: true, on: base.index, fixes };
      }
    } else if (isGrounded(layer, asset, floorY)) {
      let depth = layer.depth;
      if (depth === undefined) {
        depth = layer.y !== undefined ? floorToDepth(layer.y, floorY) : 0.3;
        fixes.push("piksel konumu derinliğe çevrildi");
      }
      const pass = passing.get(i);
      if (pass !== undefined) {
        depth = pass;
        fixes.push(PASS.note);
      }
      const { y, scale } = depthToFloor(depth, floorY);
      const sized = asset.kind === "prop" ? readableHeight(real, aspect, READABLE_SIDE.floor, fixes) : real;
      out = { index: i, x: layer.x, y, height: sized * STAGE.pxPerMeter * scale, scale, z: 100 * (1 - depth), sitting: false, grounded: true, fixes };
      if (layer.height !== undefined && Math.abs(layer.height - out.height) > out.height * 0.15) fixes.push("boy gerçek ölçüye göre düzeltildi");
    } else {
      // Duvarda/havada: verilen y ve boy; hepsi yerdeki öğelerin arkasında. Nesne okunur boyun altına düşmez (yönetmenin
      // verdiği boy dahil): öteki yerleşimlerin alt sınırı burada yoktu, havada sunulan telefon minik kalıyordu.
      const given = layer.height ?? real * STAGE.pxPerMeter * WALL_SCALE;
      const least = (READABLE_SIDE.air / Math.max(aspect, 1)) * STAGE.pxPerMeter * WALL_SCALE;
      if (given < least) fixes.push("okunamayacak kadar küçüktü, büyütüldü");
      const h = Math.max(given, least);
      out = { index: i, x: layer.x, y: layer.y ?? floorY - 60, height: h, scale: 1, z: -10 + i * 0.01, sitting: false, grounded: false, fixes };
    }
    if (layer.z !== undefined) out.z = layer.z;
    const result: PlacedLayer = { ...out, width: out.height * aspect };
    placed.set(i, result);
    resolving.delete(i);
    return result;
  };

  spec.layers.forEach((_, i) => resolve(i));
  const list = [...placed.values()];

  // Aynı oturakta birden çok kişi (bank, kanepe): yönetmenin x sırasıyla oturağın üstünde yan yana dizilir. Oturan
  // karakter oturağın ortasına konuyordu; iki kişi aynı noktaya oturup iç içe geçiyordu (Google incelemesi, 3 Kas).
  const seats = new Map<number, PlacedLayer[]>();
  for (const p of list) if (p.sitting) seats.set(p.on!, [...(seats.get(p.on!) ?? []), p]);
  for (const [on, sitters] of seats) {
    if (sitters.length < 2) continue;
    const seat = placed.get(on)!;
    sitters.sort((a, b) => spec.layers[a.index]!.x - spec.layers[b.index]!.x || a.index - b.index);
    const step = Math.min((seat.width * 0.85) / sitters.length, Math.max(...sitters.map((q) => q.width)) * 0.75);
    sitters.forEach((q, n) => {
      q.x = seat.x + (n - (sitters.length - 1) / 2) * step;
      q.fixes.push("aynı oturakta yanındakiyle iç içeydi, yan yana oturtuldu");
    });
  }

  // Aynı derinlikte üst üste binen ayaktaki karakterleri ayır; kadraj dışına taşanları içeri al.
  const standing = list.filter((p) => !p.sitting && p.heldBy === undefined && assets[spec.layers[p.index]!.asset]?.kind === "character");
  // Üç ve daha fazla karakter tek geçişte ayrılmıyordu; kenar sınırı da onları yeniden üst üste itebiliyordu.
  // Ayırma + sınır, hiçbir şey kıpırdamayana kadar (en çok N² tur) tekrarlanır.
  const overlapNote = "yanındaki karakterle üst üste biniyordu";
  const note = (p: (typeof standing)[number], msg: string) => p.fixes.includes(msg) || p.fixes.push(msg);
  for (let round = 0; round < Math.max(1, standing.length ** 2); round++) {
    let moved = false;
    standing.sort((a, b) => a.x - b.x);
    for (let k = 1; k < standing.length; k++) {
      const a = standing[k - 1]!;
      const b = standing[k]!;
      const minGap = (a.width + b.width) * 0.32;
      if (Math.abs(a.z - b.z) < 10 && b.x - a.x < minGap - 0.5) {
        const push = (minGap - (b.x - a.x)) / 2;
        a.x -= push;
        b.x += push;
        note(a, overlapNote);
        note(b, overlapNote);
        moved = true;
      }
    }
    for (const p of standing) {
      if (entering(spec.layers[p.index]!)) continue;
      const half = p.width / 2;
      const x = clamp(p.x, half + 20, STAGE.width - half - 20);
      if (Math.abs(x - p.x) > 0.5) {
        p.x = x;
        note(p, "kadraj dışına taşıyordu");
        moved = true;
      }
    }
    if (!moved) break;
  }

  toWork(spec, assets, list, note);
  converse(spec, assets, list, (p) => note(p, CONVERSE.note));

  // Öndeki karakter arkadakinin yüzünü örtmesin (3 Kas, Pascal incelemesi: masadaki komite üyelerinin yüzü öndeki
  // ayaktaki kişinin arkasında kalıyordu; farklı derinlikte oldukları için yukarıdaki ayırma görmüyordu). Öndeki ayaktaki
  // karakter, arkasındaki hiçbir yüzü örtmediği en yakın x'e kayar; böyle bir yer yoksa yerinde kalır.
  const people = list.filter((p) => p.heldBy === undefined && assets[spec.layers[p.index]!.asset]?.kind === "character");
  for (const front of people) {
    if (front.sitting || entering(spec.layers[front.index]!)) continue;
    const behind = people.filter((q) => q !== front && q.z < front.z);
    const covers = (x: number) =>
      behind.some((q) => {
        // Yüz bandı kutunun üstünden %10–%30 aşağıda; öndekinin gövdesi kutu genişliğinin ortadaki %60'ı.
        const faceTop = q.y - q.height * 0.9;
        const faceBottom = q.y - q.height * 0.7;
        const vertical = front.y - front.height * 0.9 < faceBottom && front.y > faceTop;
        return vertical && Math.abs(x - q.x) < front.width * 0.3 + q.width * 0.18;
      });
    if (!covers(front.x)) continue;
    const half = front.width / 2;
    const free = Array.from({ length: 30 }, (_, n) => front.x + (n % 2 ? 1 : -1) * 40 * Math.ceil((n + 1) / 2)).find(
      (x) => x >= half + 20 && x <= STAGE.width - half - 20 && !covers(x),
    );
    if (free === undefined) continue;
    front.x = free;
    note(front, "arkadaki karakterin yüzünü örtüyordu");
  }

  // Masadaki nesne arkasındaki kişinin yüzünü örtmesin (3 Kas, C# taslağı s1-sh1: masadaki monitör arkadaki kişinin
  // yüzünü örtüyordu, "monitörün üstünden bakıyor"). Nesne yüzeyde yüzü açan en yakın yere kayar; yüzeyde yer yoksa
  // ayaktaki kişi kenara çekilir. Oturan kişi render'da biraz aşağı iner (SIT_DROP, boyunun ~%9'u).
  const faceHidden = (o: Pick<PlacedLayer, "x" | "y" | "width" | "height">, q: PlacedLayer) => {
    const drop = q.sitting ? q.height * 0.09 : 0;
    return o.y - o.height < q.y - q.height * 0.65 + drop && o.y > q.y - q.height * 0.9 + drop && Math.abs(o.x - q.x) < o.width / 2 + q.width * 0.18;
  };
  const nearest = (from: number, ok: (x: number) => boolean, lo: number, hi: number) =>
    Array.from({ length: 80 }, (_, n) => from + (n % 2 ? 1 : -1) * 20 * Math.ceil((n + 1) / 2)).find((x) => x >= lo && x <= hi && ok(x));
  for (const o of list) {
    // Yüzeydeki karakter oturur (sitting); geriye nesneler kalır.
    if (o.on === undefined || o.sitting) continue;
    const faces = people.filter((q) => q.z < o.z);
    const blocks = (x: number) => faces.some((q) => faceHidden({ ...o, x }, q));
    if (!blocks(o.x)) continue;
    const base = placed.get(o.on)!;
    const x = nearest(o.x, (x) => !blocks(x), base.x - base.width * 0.4, base.x + base.width * 0.4);
    if (x !== undefined) {
      o.x = x;
      note(o, "arkasındaki kişinin yüzünü örtüyordu, yüzeyde kaydırıldı");
      continue;
    }
    for (const q of faces.filter((q) => !q.sitting && !entering(spec.layers[q.index]!) && faceHidden(o, q))) {
      const half = q.width / 2;
      const qx = nearest(q.x, (x) => !faceHidden(o, { ...q, x }), half + 20, STAGE.width - half - 20);
      if (qx === undefined) continue;
      q.x = qx;
      note(q, "önündeki nesne yüzünü örtüyordu, kenara çekildi");
    }
  }

  // Önündeki yere basan eşya (tezgâh, raf, kürsü) kişinin yüzünü örtmesin (3 Kas denetimi: Apple s2-sh1'de tezgâhın
  // panosu, s2-sh6'da dükkân tezgâhı yüzü kapatıyordu; Yapay zekâ s5-sh5'te kürsüdeki yargıcın yüzü kürsünün ardındaydı).
  // Ayaktaki kişi yüzünü açan en yakın x'e çekilir; oturan kişinin önündeki eşya en çok FURNITURE_LOWER kadar alçalır,
  // üstündekiler onunla iner. Giren kişiye dokunulmaz (geçerken örtülmek olağan).
  const furniture = list.filter((o) => o.grounded && o.on === undefined && o.heldBy === undefined && assets[spec.layers[o.index]!.asset]!.kind !== "character");
  // Kişinin tezgâhın ardında yükselmesi gereken px (0: tezgâh değil, kişiyi baştan sona örtmüyor ya da gereken çok fazla).
  const counterLift = (o: PlacedLayer, q: PlacedLayer) => {
    const surface = assets[spec.layers[o.index]!.asset]!.meta.surface;
    if (surface === undefined || Math.abs(o.x - q.x) + q.width * 0.3 > o.width / 2) return 0;
    const lift = q.y - q.height * FURNITURE.chest - (o.y - o.height * surface);
    return lift > 0 && lift <= q.height * FURNITURE.lift ? lift : 0;
  };
  for (const q of people) {
    if (entering(spec.layers[q.index]!)) continue;
    const front = furniture.filter((o) => o.z > q.z);
    // Kenara çekilirken öndeki ayaktaki kişinin arkasına da girmesin (gövdesi kutusunun ortadaki %60'ı).
    const ahead = people.filter((p) => p !== q && p.z > q.z && !p.sitting);
    const hides = (x: number) =>
      front.some((o) => faceHidden(o, { ...q, x })) || ahead.some((p) => faceHidden({ ...p, width: p.width * 0.6 }, { ...q, x }));
    if (!hides(q.x)) continue;
    if (!q.sitting) {
      // Tezgâhın ardındaki kısa kişi ya da yüksek tezgâh (5 Kas, Yapay zekâ s2-sh5: 1,1 m'lik robot 1,3 m'lik danışma
      // tezgâhının ardında kayboluyordu; tezgâh 6 m genişti, kenara çekilecek yer de yoktu): ayakları tezgâhın ardında
      // kaldığı sürece kişi göğsü tezgâhın üstüne gelene dek yükselir (canlandırmanın bilinen hilesi). Yönetmenin "tezgâhın
      // arkasında" kurgusu korunur.
      const lift = front.filter((o) => faceHidden(o, q)).map((o) => counterLift(o, q))[0];
      if (lift) {
        q.y -= lift;
        note(q, FURNITURE.lifted);
        continue;
      }
      const half = q.width / 2;
      const x = nearest(q.x, (x) => !hides(x), half + 20, STAGE.width - half - 20);
      if (x === undefined) continue;
      q.x = x;
      note(q, FURNITURE.aside);
      continue;
    }
    for (const o of front.filter((o) => faceHidden(o, q))) {
      // Yüz bandının altı (oturan render'da boyunun ~%9'u kadar iner).
      const h = o.y - (q.y - q.height * 0.65 + q.height * 0.09);
      if (h < o.height * (1 - FURNITURE.lower)) continue;
      const shift = (o.height - h) * (assets[spec.layers[o.index]!.asset]!.meta.surface ?? 1);
      o.width *= h / o.height;
      o.height = h;
      for (const c of list) if (c.on === o.index && !c.sitting) c.y += shift;
      note(o, FURNITURE.lowered);
    }
  }

  // Duvardaki/havadaki öğe (logo, ok, tabela) yerdeki her şeyin arkasında çizilir. Bir mobilya onu yarıdan fazla
  // örtüyorsa (Microsoft incelemesi, 1 Kas: ikiye bölünen logo yakın çekimdeki masanın arkasında kayboldu) o
  // mobilyanın önüne alınır. Karakterin arkasındaki poster yerinde kalır; yönetmen z verdiyse dokunulmaz.
  const box = (p: PlacedLayer) => ({ l: p.x - p.width / 2, r: p.x + p.width / 2, t: p.y - p.height, b: p.y });
  const hidden = (p: PlacedLayer, q: PlacedLayer) => {
    const a = box(p);
    const c = box(q);
    const w = Math.min(a.r, c.r) - Math.max(a.l, c.l);
    const h = Math.min(a.b, c.b) - Math.max(a.t, c.t);
    return w > 0 && h > 0 ? (w * h) / ((a.r - a.l) * (a.b - a.t)) : 0;
  };
  for (const p of list) {
    if (p.grounded || p.heldBy !== undefined || spec.layers[p.index]!.z !== undefined) continue;
    const covers = list.filter((q) => q.grounded && q.z > p.z && assets[spec.layers[q.index]!.asset]!.kind !== "character" && hidden(p, q) > 0.5);
    if (!covers.length) continue;
    p.z = Math.max(...covers.map((q) => q.z)) + 0.1;
    note(p, "mobilyanın arkasında kalıyordu, önüne alındı");
  }

  return list.sort((a, b) => a.z - b.z || a.index - b.index);
}
