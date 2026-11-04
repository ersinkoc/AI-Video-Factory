import type { Timeline, VectorAnim, VectorAnimType, VectorShot } from "@ys/core";
import { SCENE_CUT } from "./cut.ts";

type Visual = Timeline["visuals"][number];
type Assets = Timeline["vectorAssets"];

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
 * Kendi girişi olan katmana dokunulmaz.
 */
export function buildIn(spec: VectorShot, assets: Assets, dur: number, fps: number): VectorShot {
  const kind = (i: number) => assets[spec.layers[i]!.asset]?.kind;
  const bases = new Set(spec.layers.flatMap((l) => (l.on === undefined ? [] : [l.on])));
  const rank = (i: number) => (kind(i) === "character" ? 2 : bases.has(i) ? 0 : 1);
  const own = (i: number) => spec.layers[i]!.anims.some((a) => OWN.has(a.type));
  const order = spec.layers
    .map((_, i) => i)
    .filter((i) => kind(i) !== undefined && spec.layers[i]!.heldBy === undefined && !own(i))
    .sort((a, b) => rank(a) - rank(b) || (spec.layers[b]!.depth ?? 0) - (spec.layers[a]!.depth ?? 0) || spec.layers[a]!.x - spec.layers[b]!.x);
  if (!order.length) return spec;
  const after = SCENE_CUT.frames / fps + ENTER.pause;
  const k = Math.min(1, (ENTER.within * dur) / (after + (order.length - 1) * ENTER.gap + ENTER.length));
  const at = new Map(order.map((i, n) => [i, (after + n * ENTER.gap) * k]));
  const entrance = (type: VectorAnimType, s: number): VectorAnim => ({ type, start: s / dur, end: (s + ENTER.length * k) / dur });
  const layers = spec.layers.map((l, i) => {
    const s = at.get(i);
    // Eski zaman çizelgelerindeki varlıkta meta olmayabilir.
    const big = kind(i) === "character" || (assets[l.asset]?.meta?.realHeight ?? 0) >= ENTER.big;
    if (s !== undefined) return { ...l, anims: [...l.anims, entrance(big ? "fade_in" : "pop", s)] };
    const holder = l.heldBy === undefined ? undefined : at.get(l.heldBy);
    return holder === undefined || own(i) ? l : { ...l, anims: [...l.anims, entrance("fade_in", holder)] };
  });
  return { ...spec, layers };
}

/** Çekimin çizilen tarifi: sahnenin ilk çekimiyse (enter) kurulma girişleriyle. Render, denetim, inceleme anı ve sesler bunu kullanır. */
export function visualVector(visual: Visual, assets: Assets, fps: number): VectorShot | undefined {
  return visual.vector && visual.enter ? buildIn(visual.vector, assets, visual.durationInFrames / fps, fps) : visual.vector;
}
