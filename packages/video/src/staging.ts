import { ARM_GESTURES, isWritable, keepShotLayers, workBoard, workSurface, workTopOf, type PlacedLayer, type VectorAnim, type VectorAsset, type VectorShot } from "@ys/core";

/**
 * Sahneleme denetimi (3 Kas, kullanıcı: "animasyonda sıfır hata, anlamsız hata olmasın"): yönetmen planının izleyiciye
 * saçma görünecek jestleri render'dan önce kodla düzeltilir ya da düşürülür. Boş elle "okuyor/gösteriyor", masadan uzakta
 * havaya yazıyor, yanında hiçbir şey yokken boşluğu gösteriyor, aynı anda iki kol jesti kolları çekiştiriyor. Anlam
 * korunarak düzeltilebilen (yakındaki kitap ele verilir, işaret anlatmaya döner, jestler sıraya girer) render'da kalır;
 * anlamı kaybolan (anlatılan iş gösterilemedi) düşürülür ve denetim (lint.ts) sahneyi yeniden planlatır. Saf fonksiyonlar:
 * render ve denetim aynı sonucu görür.
 */

export type StagingCode = "point_at_nothing" | "action_without_prop" | "gesture_clash" | "gesture_too_long" | "unsupported_staging" | "empty_bubble";

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

/** Kalite kapısının körlemesine tahmininin ana adı bir konuşma balonu (ilk birkaç sözcükte; "balonlu dizüstü" değil). */
const BUBBLE_GUESS = /^\s*(?:an?|the|one)?\s*(?:[\w'-]+\s+){0,3}(?:speech|thought|chat|comic|dialog(?:ue)?|talk|word|text|message)[\s-]+(?:bubble|balloon)/i;
/** Tahminde balonun içi boş (yazısız ya da yer tutucu çizgilerle). */
const EMPTY_GUESS = /\b(?:empty|blank|placeholder|plain|unfilled|no (?:text|words|content)|without (?:text|words))\b/i;

/**
 * Boş konuşma balonu nesnesi (5 Kas, Yapay zeka ajanları: Commons'tan "boş konuşma balonu simgesi" 8 çekimde; inceleme
 * her birinde "balon boş"). Kapı tahmininden: ana ad balon ve içi boş. İçinde resim olan balon (soru işareti, ampul,
 * yazıyor üç noktası) ne gösterdiğini söylüyor, kalır.
 */
export function emptyBubble(asset: VectorAsset | undefined): boolean {
  const guess = asset?.kind === "prop" ? asset.meta.check?.guess : undefined;
  return guess !== undefined && BUBBLE_GUESS.test(guess) && EMPTY_GUESS.test(guess);
}

/**
 * Boş balon nesneleri atılır: sözü olmayan balon izleyiciye "boş" görünür; balonu artık kod çizer (konuşanın `say`'i).
 * Sahne yeniden planlanmalı (yönetmen sözü konuşana verir). Katman başvuruları (üstünde, elinde, işaret) yeniden eşlenir.
 */
export function dropEmptyBubbles(spec: VectorShot, assets: Record<string, VectorAsset>): { spec: VectorShot; problems: StagingProblem[] } {
  const keep = spec.layers.map((l) => !emptyBubble(assets[l.asset]));
  if (keep.every(Boolean)) return { spec, problems: [] };
  const problems = keep.flatMap((k, i) =>
    k ? [] : [{ layer: i, code: "empty_bubble" as const, detail: "an empty speech-bubble prop was dropped: code draws bubbles; give the speaking character \"say\" with the words", replan: true }],
  );
  return { spec: keepShotLayers(spec, keep), problems };
}

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

    // Elde nesne isteyen jest: tutulan yoksa en yakın taşınabilir, serbest nesne ele alınır; yoksa jest düşer. Masadaki
    // nesne de alınır (8 Kas: masasındaki patenti, tomarı okuyan kişinin jesti düşüyor, sahne boşuna yeniden
    // planlanıyordu); ekran yazısı verilen (okunsun diye masada duran monitör) ve üstünde bir şey duran alınmaz.
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
            (q.on === undefined || !q.screen) &&
            !bases.has(j) &&
            a.meta.surface === undefined &&
            (a.meta.realHeight ?? Infinity) <= PORTABLE_M &&
            Math.abs(q.x - l.x) <= HAND_REACH
          );
        })
        .sort((a, b) => Math.abs(a.q.x - l.x) - Math.abs(b.q.x - l.x))[0]?.j;
      if (j !== undefined) {
        const { on: _left, ...rest } = layers[j]!;
        layers[j] = { ...rest, heldBy: i };
        problems.push({ layer: i, code: "action_without_prop", detail: `${wants.type} without holding anything: now holds layer ${j}`, replan: false });
      } else {
        l.anims = l.anims.filter((a) => !IN_HAND.has(a.type));
        problems.push({ layer: i, code: "action_without_prop", detail: `${wants.type} without holding anything and nothing small to hold nearby: gesture dropped`, replan: true });
      }
    }

    // Hedefi kendisi, elindeki, olmayan ya da çizilmemiş bir katman olan işaret (8 Kas, Linux s7-sh1: Linus kendini gösteriyordu, el
    // en yakın şeye, pencereye gitti; "gestures at the window, not at the modem"; tüm planlarda 426 işaretin 15'i): hedef
    // çekimin anahtar nesnesi olur, o da yoksa ya da kişinin elindeyse hedef silinir (render yanındakini gösterir).
    const invalid = (t: number) => t === i || !layers[t] || !assets[layers[t]!.asset] || layers[t]!.heldBy === i;
    if (l.anims.some((a) => a.type === "point" && a.target !== undefined && invalid(a.target))) {
      const key = spec.key !== undefined && !invalid(spec.key) ? spec.key : undefined;
      l.anims = l.anims.map((a) => {
        if (a.type !== "point" || a.target === undefined || !invalid(a.target)) return a;
        const { target: _bad, ...rest } = a;
        return key === undefined ? rest : { ...rest, target: key };
      });
      const to = key === undefined ? "now points at what stands beside it" : `now points at the key prop, layer ${key}`;
      problems.push({ layer: i, code: "point_at_nothing", detail: `points at itself, at what it holds or at a missing layer: ${to}`, replan: false });
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
