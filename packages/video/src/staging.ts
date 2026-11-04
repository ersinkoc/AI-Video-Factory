import { isWritable, workBoard, workSurface, workTopOf, type PlacedLayer, type VectorAnim, type VectorAsset, type VectorShot } from "@ys/core";
import { ARM_GESTURES } from "./motion.ts";

/**
 * Sahneleme denetimi (3 Kas, kullanıcı: "animasyonda sıfır hata, anlamsız hata olmasın"): yönetmen planının izleyiciye
 * saçma görünecek jestleri render'dan önce kodla düzeltilir ya da düşürülür. Boş elle "okuyor/gösteriyor", masadan uzakta
 * havaya yazıyor, yanında hiçbir şey yokken boşluğu gösteriyor, aynı anda iki kol jesti kolları çekiştiriyor. Anlam
 * korunarak düzeltilebilen (yakındaki kitap ele verilir, işaret anlatmaya döner, jestler sıraya girer) render'da kalır;
 * anlamı kaybolan (anlatılan iş gösterilemedi) düşürülür ve denetim (lint.ts) sahneyi yeniden planlatır. Saf fonksiyonlar:
 * render ve denetim aynı sonucu görür.
 */

export type StagingCode = "point_at_nothing" | "action_without_prop" | "gesture_clash" | "gesture_too_long" | "unsupported_staging";

export interface StagingProblem {
  layer: number;
  code: StagingCode;
  detail: string;
  /** Kod anlamı koruyarak düzeltemedi (jest düştü ya da sahnelenemiyor): sahne yeniden planlanmalı. */
  replan: boolean;
}

/** Elde nesne isteyen jestler. */
export const IN_HAND = new Set<VectorAnim["type"]>(["reading", "show"]);
/**
 * Kol jestlerinin çakışması: en az sec saniye üst üste binen iki kol jesti kolları iki pozun arasında çekiştirir. Kırpılan
 * jestin kalan süresi min saniyeden kısaysa düşer (kalkıp hemen inen kol anlamsız).
 */
export const CLASH = { sec: 0.5, min: 0.8 } as const;
/**
 * Patlama jestlerinin en uzun süresi (sn): sevinç, el sallama ve irkilme bir anlık tepkidir; yönetmen bütün çekime
 * verince (PHP s4-sh6: iki kişi 13 sn kolları havada) insan kollarını o kadar havada tutmaz. Daha uzunu bu süreye kısalır,
 * sonra kişi doğal duruşuna döner.
 */
export const BURST: Partial<Record<VectorAnim["type"], number>> = { cheer: 3.5, wave: 3.5, surprised: 2.5 };
/** Kişinin eline verilebilecek en büyük nesne (m): kitap, tabak, levha; dolap ya da araba verilmez. */
export const PORTABLE_M = 0.8;
/** Ele verilecek nesnenin kişiye en uzak mesafesi (yönetmenin x'iyle, px; derinlik 0'da ~2,5 m). */
const HAND_REACH = 1000;

const isArm = (a: VectorAnim) => ARM_GESTURES.includes(a.type);

/**
 * Yerleşimden önce (elde tutma yerleşimi değiştirir): elde nesne isteyen jest yakındaki taşınabilir nesneyi ele alır ya da
 * düşer; çakışan kol jestleri sıraya girer; bir kişinin üstüne binen kişi (at sırtı desteklenmiyor) bildirilir.
 * dur: çekim süresi (sn).
 */
export function stageBefore(spec: VectorShot, assets: Record<string, VectorAsset>, dur: number): { spec: VectorShot; problems: StagingProblem[] } {
  const problems: StagingProblem[] = [];
  const layers = spec.layers.map((l) => ({ ...l, anims: [...l.anims] }));
  const kind = (i: number) => (layers[i] ? assets[layers[i]!.asset]?.kind : undefined);
  const bases = new Set(layers.flatMap((l) => (l.on === undefined ? [] : [l.on])));
  layers.forEach((l, i) => {
    if (kind(i) !== "character") return;
    if (l.on !== undefined && l.on !== i && kind(l.on) === "character")
      problems.push({ layer: i, code: "unsupported_staging", detail: `rides layer ${l.on} (a character); riding is not supported, the two figures overlap`, replan: true });

    // Elde nesne isteyen jest: tutulan yoksa en yakın taşınabilir, serbest nesne ele alınır; yoksa jest düşer.
    const wants = l.anims.find((a) => IN_HAND.has(a.type));
    if (wants && !layers.some((q) => q.heldBy === i)) {
      const j = layers
        .map((q, j) => ({ q, j }))
        .filter(({ q, j }) => {
          const a = assets[q.asset];
          return (
            j !== i &&
            a?.kind === "prop" &&
            q.heldBy === undefined &&
            q.on === undefined &&
            !bases.has(j) &&
            a.meta.surface === undefined &&
            (a.meta.realHeight ?? Infinity) <= PORTABLE_M &&
            Math.abs(q.x - l.x) <= HAND_REACH
          );
        })
        .sort((a, b) => Math.abs(a.q.x - l.x) - Math.abs(b.q.x - l.x))[0]?.j;
      if (j !== undefined) {
        layers[j] = { ...layers[j]!, heldBy: i };
        problems.push({ layer: i, code: "action_without_prop", detail: `${wants.type} without holding anything: now holds layer ${j}`, replan: false });
      } else {
        l.anims = l.anims.filter((a) => !IN_HAND.has(a.type));
        problems.push({ layer: i, code: "action_without_prop", detail: `${wants.type} without holding anything and nothing small to hold nearby: gesture dropped`, replan: true });
      }
    }

    // Patlama jesti en çok BURST saniye sürer.
    l.anims = l.anims.map((a) => {
      const max = BURST[a.type];
      if (max === undefined || (a.end - a.start) * dur <= max) return a;
      problems.push({ layer: i, code: "gesture_too_long", detail: `${a.type} held for ${((a.end - a.start) * dur).toFixed(1)} s: shortened to ${max} s`, replan: false });
      return { ...a, end: a.start + max / dur };
    });

    // Çakışan kol jestleri: sonra başlayan oynar; öncekinin sonu onun başına çekilir (yeterince kalıyorsa), olmazsa
    // sonraki öncekinin bitişine kayar, o da olmazsa düşer.
    const order = l.anims.map((a, n) => ({ a, n })).filter(({ a }) => isArm(a)).sort((x, y) => x.a.start - y.a.start || x.n - y.n);
    const drop = new Set<number>();
    for (let k = 1; k < order.length; k++) {
      const b = order[k]!;
      for (const prev of order.slice(0, k)) {
        const a = prev;
        if (drop.has(a.n)) continue;
        const shared = (Math.min(a.a.end, b.a.end) - Math.max(a.a.start, b.a.start)) * dur;
        if (shared < CLASH.sec) continue;
        if ((b.a.start - a.a.start) * dur >= CLASH.min) {
          a.a = { ...a.a, end: b.a.start };
          problems.push({ layer: i, code: "gesture_clash", detail: `${a.a.type} and ${b.a.type} overlapped ${shared.toFixed(1)} s: ${a.a.type} now ends when ${b.a.type} starts`, replan: false });
        } else if ((b.a.end - a.a.end) * dur >= CLASH.min) {
          b.a = { ...b.a, start: a.a.end };
          problems.push({ layer: i, code: "gesture_clash", detail: `${a.a.type} and ${b.a.type} overlapped ${shared.toFixed(1)} s: ${b.a.type} now starts after ${a.a.type}`, replan: false });
        } else {
          drop.add(b.n);
          problems.push({ layer: i, code: "gesture_clash", detail: `${b.a.type} overlapped ${a.a.type} for its whole length: dropped`, replan: false });
          break;
        }
      }
    }
    if (order.length > 1) {
      const fixed = new Map(order.map(({ a, n }) => [n, a]));
      l.anims = l.anims.flatMap((a, n) => (drop.has(n) ? [] : [fixed.get(n) ?? a]));
    }
  });
  return { spec: { ...spec, layers }, problems };
}

/**
 * Yerleşimden sonra: hedefi olmayan işaret anlatmaya döner (yanında gösterecek bir şey yok, el boşluğu gösteriyordu);
 * iş jesti yapan kişinin elleri yerleşimden sonra da el hizasında bir masaya değmiyorsa (workSurface: duvar eşyası,
 * makine ya da oturduğu sandalye sayılmaz) jest düşer; yazı jesti kolunun yettiği bir panoyla da kalır (workBoard),
 * klavye yalnız masada. aims: katmanın işaret edeceği bir şey var mı (Vector.tsx focusOf).
 */
export function stageAfter(
  spec: VectorShot,
  placed: PlacedLayer[],
  assets: Record<string, VectorAsset>,
  aims: (index: number) => boolean,
): { spec: VectorShot; problems: StagingProblem[] } {
  const problems: StagingProblem[] = [];
  const kind = (pl: PlacedLayer) => assets[spec.layers[pl.index]!.asset]!.kind;
  const surfaces = placed.flatMap((o) => {
    const top = workTopOf(o, assets[spec.layers[o.index]!.asset]);
    return top === undefined ? [] : [{ pl: o, top }];
  });
  const boards = placed.filter((o) => isWritable(spec.layers[o.index]!.asset, assets[spec.layers[o.index]!.asset]));
  const layers = spec.layers.map((l, i) => {
    const pl = placed.find((p) => p.index === i);
    if (!pl || kind(pl) !== "character") return l;
    let anims = l.anims;
    if (anims.some((a) => a.type === "point") && !aims(i)) {
      anims = anims.map((a) => {
        if (a.type !== "point") return a;
        const { target: _target, ...rest } = a;
        return { ...rest, type: "explain" as const };
      });
      problems.push({ layer: i, code: "point_at_nothing", detail: "points with nothing beside it and no label to point at: explains instead", replan: false });
    }
    const desk = workSurface(pl, surfaces) !== undefined;
    const cannot = (a: VectorAnim) => (a.type === "typing" && !desk) || (a.type === "writing" && !desk && !workBoard(pl, boards));
    const work = anims.find(cannot);
    if (work) {
      anims = anims.filter((a) => !cannot(a));
      const where = work.type === "writing" ? "desk or board" : "desk";
      problems.push({ layer: i, code: "action_without_prop", detail: `${work.type} with no ${where} within reach: gesture dropped`, replan: true });
    }
    return anims === l.anims ? l : { ...l, anims };
  });
  return { spec: { ...spec, layers }, problems };
}
