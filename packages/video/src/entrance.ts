import { styleCraftOf, type StyleCraft, type Timeline, type VectorAnim, type VectorAnimType, type VectorShot } from "@ys/core";
import { SCENE_CUT } from "./cut.ts";

type Visual = Timeline["visuals"][number];
type Assets = Timeline["vectorAssets"];

/** Yalnız render hazırlığında: malzeme girişi anlatıdaki yer değiştirme sayılıp son kadrajı değiştirmesin. */
const MATERIAL_ENTRANCE = Symbol("material-entrance");
export const isMaterialEntrance = (a: VectorAnim): boolean => (a as VectorAnim & { [MATERIAL_ENTRANCE]?: true })[MATERIAL_ENTRANCE] === true;

/**
 * Sahnenin parça parça kurulması (sn): geçişten pause sonra ilk katman belirir, sonrakiler gap arayla; her biri length
 * sürer. Hepsi çekimin within kesrinde biter (kısa çekimde aralar sıkışır). Gerçek boyu big metreden uzun nesne (makine, araç,
 * dolap) büyüyerek değil solarak gelir: bütün kanatlarıyla sıçrayan uçak çizgi film gibi duruyordu.
 */
export const ENTER = { pause: 0.15, gap: 0.15, length: 0.35, within: 0.4, big: 1.2 } as const;

/** Katmanın kendi girişi (yönetmen verdi ya da sahneye yürüyerek giriyor): kurulma ona dokunmaz. */
const OWN = new Set<VectorAnimType>(["fade_in", "slide_in", "pop", "draw_on", "walk", "move"]);

/**
 * Sahnenin ilk çekiminde katmanlar sırayla belirir (4 Kas, kullanıcı: "karakterleri ekrana anında getirme ile parça parça
 * getirme gibi şeyler, daha video olduğu belli edecek şeyler"; her çekim ilk karesinden bütün katmanlarıyla hazır
 * başlıyordu). Geçişte oda boş gelir; önce üstünde bir şey duran eşya (masa), sonra öteki nesneler (küçükse yerinde büyüyerek, pop),
 * en son kişiler (solarak) belirir; aynı türde arkadan öne, soldan sağa. Elde tutulan nesne tutanla birlikte solarak gelir.
 * Kendi girişi olan katmana dokunulmaz. Set eşyası (fixed, varlık kimlikleri) odanın parçasıdır: odayla birlikte gelir.
 */
export function buildIn(spec: VectorShot, assets: Assets, dur: number, fps: number, fixed: readonly string[] = [], craft?: StyleCraft): VectorShot {
  const kind = (i: number) => assets[spec.layers[i]!.asset]?.kind;
  const bases = new Set(spec.layers.flatMap((l) => (l.on === undefined ? [] : [l.on])));
  const rank = (i: number) => (kind(i) === "character" ? 2 : bases.has(i) ? 0 : 1);
  const own = (i: number) => spec.layers[i]!.anims.some((a) => OWN.has(a.type));
  const order = spec.layers
    .map((_, i) => i)
    .filter((i) => kind(i) !== undefined && spec.layers[i]!.heldBy === undefined && !own(i) && !fixed.includes(spec.layers[i]!.asset))
    .sort((a, b) => rank(a) - rank(b) || (spec.layers[b]!.depth ?? 0) - (spec.layers[a]!.depth ?? 0) || spec.layers[a]!.x - spec.layers[b]!.x);
  if (!order.length) return spec;
  const length = craft?.entranceSec ?? ENTER.length;
  const after = SCENE_CUT.frames / fps + ENTER.pause;
  const k = Math.min(1, (ENTER.within * dur) / (after + (order.length - 1) * ENTER.gap + length));
  const at = new Map(order.map((i, n) => [i, (after + n * ENTER.gap) * k]));
  const entrance = (type: VectorAnimType, s: number): VectorAnim => ({ type, start: s / dur, end: (s + length * k) / dur, ...(craft ? { [MATERIAL_ENTRANCE]: true as const } : {}) });
  const layers = spec.layers.map((l, i) => {
    const s = at.get(i);
    // Eski zaman çizelgelerindeki varlıkta meta olmayabilir.
    const big = kind(i) === "character" || (assets[l.asset]?.meta?.realHeight ?? 0) >= ENTER.big;
    if (s !== undefined) return { ...l, anims: [...l.anims, entrance(kind(i) === "character" ? "fade_in" : (craft?.entrance ?? (big ? "fade_in" : "pop")), s)] };
    const holder = l.heldBy === undefined ? undefined : at.get(l.heldBy);
    return holder === undefined || own(i) ? l : { ...l, anims: [...l.anims, entrance("fade_in", holder)] };
  });
  return { ...spec, layers };
}

/**
 * Giriş ve çıkışın en uzun süresi (sn; 6 Kas, Elon Musk son incelemesi: "çek yarı saydam, hayalet bir katman gibi"). İlerleme
 * yönetmenin verdiği pencereye yayılıyordu ve yönetmen pencereyi çoğu kez anlatımın cümlesi kadar uzun veriyordu: 1584
 * çekimde pop ortanca 1,25 sn (en çok 16,5), slide_in 2,1 sn (21,7), fade_in 1,6 sn; 195 çekimde bir şey saniyelerce
 * büyüyor, kayıyor ya da yarı saydam duruyordu. Hareket tasarımında bunlar 0,3–1 sn sürer. Girişin başı (anlatımla
 * zamanlanmış) kalır, süresi kısalır; çıkışın sonu kalır. draw_on elle çizim gibi sürer, dokunulmaz.
 */
export const PACE: Readonly<Partial<Record<VectorAnimType, number>>> = { pop: 0.45, fade_in: 0.8, slide_in: 0.9, fade_out: 0.8 };

const brisk = (a: VectorAnim, dur: number): VectorAnim => {
  const most = PACE[a.type];
  if (most === undefined || (a.end - a.start) * dur <= most) return a;
  return a.type === "fade_out" ? { ...a, start: a.end - most / dur } : { ...a, end: a.start + most / dur };
};

/** Katman ve yazıların girişleri/çıkışları en çok PACE kadar sürer. */
export function briskAnims(spec: VectorShot, dur: number): VectorShot {
  const anims = <T extends { anims: VectorAnim[] }>(x: T): T => ({ ...x, anims: x.anims.map((a) => brisk(a, dur)) });
  return { ...spec, layers: spec.layers.map(anims), texts: spec.texts.map(anims) };
}

/**
 * Çekimin çizilen tarifi: girişler PACE'e kısalmış, sahnenin ilk çekimiyse (enter) kurulma girişleriyle. Render, denetim,
 * inceleme anı ve sesler bunu kullanır.
 */
export function visualVector(visual: Visual, assets: Assets, fps: number): VectorShot | undefined {
  if (!visual.vector) return undefined;
  const dur = visual.durationInFrames / fps;
  const spec = briskAnims(visual.vector, dur);
  return visual.enter ? buildIn(spec, assets, dur, fps, [...(visual.dressing ?? []), ...(visual.carried ?? [])], styleCraftOf(visual.stylePack)) : spec;
}
