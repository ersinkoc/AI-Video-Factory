import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import type { Timeline } from "@ys/core";

/**
 * Bölüm kompozisyonunun (Episode.tsx) zamanlamaları; render önbelleği (chunks.ts) de bunlara bakar: bir parçanın
 * görüntüsünü hangi çekimlerin ve altyazı sayfalarının belirlediğini aynı hesaptan bilir. Tarayıcı paketine girer:
 * Node modülü içe aktarmaz.
 */

/** Sahne içinde ardışık çekimler bu kadar kare üst üste biner (crossfade). */
export const CROSSFADE = 8;

/**
 * Sahne geçişi (4 Kas, kullanıcı: "sahneler arası geçişler lazım bize ... daha video olduğu belli edecek şeyler"; her kesme
 * aynı 8 karelik çapraz geçişti, sahne değişince de): sahne değişirken frames kare (30 fps'te 0,6 sn) süren belirgin geçiş.
 * Türler gelen çekimin üstünde oynar (giden altında durur): wipe (perde gibi bir yandan silinir), slide (gelen yandan
 * kayarak üstüne gelir, kenarında gölge), iris (ortadan daire açılır), zoom (gelen biraz yakından yerine oturarak belirir).
 */
export const SCENE_CUT = { frames: 18, kinds: ["wipe", "slide", "iris", "zoom"] } as const;
export type CutKind = "dissolve" | (typeof SCENE_CUT.kinds)[number];
export interface Cut {
  kind: CutKind;
  frames: number;
  /** wipe ve slide yönü: 1 soldan sağa (slide sağdan gelir), −1 tersi. */
  dir: 1 | -1;
}

/** Çekimin sahnesi: kimliğin sahne öneki ("s3-sh2" → "s3"); başka biçimde kimliğin kendisi. */
export const sceneOf = (shotId: string) => shotId.replace(/-sh\d+$/, "");

/** Tohumdan küçük, kararlı bir sayı (FNV-1a; tarayıcı paketinde Node modülü yok). */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * Her çekime girişin geçişi (ilk çekimde yok: video siyahtan açılmasın). Sahne içinde kısa çapraz geçiş; sahne değişince
 * tür bölüm kimliğinden başlayıp sahne sırasıyla döner (art arda aynısı gelmez), yön her sahnede değişir. Episode ve render
 * önbelleği (chunks.ts) aynı hesabı kullanır.
 */
export function cutsOf(visuals: readonly { shotId: string }[], seed: string): (Cut | undefined)[] {
  const start = seedOf(seed) % SCENE_CUT.kinds.length;
  let n = 0;
  return visuals.map((v, i) => {
    if (i === 0) return undefined;
    if (sceneOf(v.shotId) === sceneOf(visuals[i - 1]!.shotId)) return { kind: "dissolve", frames: CROSSFADE, dir: 1 };
    const k = n++;
    return { kind: SCENE_CUT.kinds[(start + k) % SCENE_CUT.kinds.length]!, frames: SCENE_CUT.frames, dir: k % 2 ? -1 : 1 };
  });
}

/** Geçişin q (0–1) anındaki gelen çekim biçemi; sonunda boş (biçem yok). Çapraz geçiş doğrusal, sahne geçişleri yumuşak. */
export function cutStyle(cut: Cut, q: number): Record<string, string | number> {
  if (q >= 1) return {};
  switch (cut.kind) {
    case "dissolve":
      return { opacity: q };
    case "wipe":
      return { clipPath: cut.dir > 0 ? `inset(0 ${(1 - q) * 100}% 0 0)` : `inset(0 0 0 ${(1 - q) * 100}%)` };
    case "slide":
      return { transform: `translateX(${cut.dir * (1 - q) * 100}%)`, boxShadow: `${-cut.dir * 24}px 0 48px rgba(0,0,0,0.35)` };
    case "iris":
      // %72 köşelere yetişir (16:9 ve 9:16).
      return { clipPath: `circle(${q * 72}% at 50% 50%)` };
    case "zoom":
      return { opacity: q, transform: `scale(${1 + 0.18 * (1 - q)})` };
  }
}

/**
 * Geçişin hareket bulanıklığı (5 Kas; kullanıcı: "videoya çok yakın görüntü"): kamera obtüratörü açıkken hareket eden
 * görüntü hareket yönünde iz bırakır. Kayan kare 0,6 sn'de tuvali geçer (ortasında kare başına ~160 px); izsiz keskin
 * kare çizgi film gibi görünüyordu. Kare başına yer değiştirmenin shutter kadarı iz olur (180° obtüratör): kayma (slide)
 * yatay Gauss bulanıklığı alır (σ = iz × sigma, en çok max px; SVG feGaussianBlur yalnız x'te, CSS'in yönlü bulanıklığı
 * yok), perde (wipe) ve iris kenarı iz kadar yumuşar (maske gradyanı; sert clip-path yerine), yakınlaşma (zoom) köşedeki
 * yer değiştirmeyle hafif genel bulanıklık alır (en çok zoom px). Bulanıklık hızla gelir gider: geçişin ilk ve son
 * karelerinde (yavaş) yoktur, min'in altında hiç çizilmez. Çapraz geçişte hareket yok.
 */
export const MOTION_BLUR = { shutter: 0.5, sigma: 0.5, max: 36, zoom: 4, min: 0.6 } as const;

/** Geçişin bu karedeki biçemi, hareket bulanıklığıyla: dq bir önceki kareden bu yana ilerleme; sigmaX yatay bulanıklık (px). */
export function cutLook(cut: Cut, q: number, dq: number, w: number, h: number): { style: Record<string, string | number>; sigmaX: number } {
  const style = cutStyle(cut, q);
  if (q >= 1 || cut.kind === "dissolve") return { style, sigmaX: 0 };
  const smear = (px: number) => MOTION_BLUR.shutter * Math.abs(dq) * px;
  const px = (v: number) => `${v.toFixed(1)}px`;
  if (cut.kind === "slide") {
    const sigma = Math.min(MOTION_BLUR.max, smear(w) * MOTION_BLUR.sigma);
    return { style, sigmaX: sigma >= MOTION_BLUR.min ? sigma : 0 };
  }
  if (cut.kind === "zoom") {
    const r = Math.min(MOTION_BLUR.zoom, smear((0.18 * Math.hypot(w, h)) / 2) * MOTION_BLUR.sigma);
    return { style: r >= MOTION_BLUR.min ? { ...style, filter: `blur(${px(r)})` } : style, sigmaX: 0 };
  }
  // Perde ve iris: kenar iz kadar yumuşar.
  const reach = cut.kind === "wipe" ? w : 0.72 * Math.sqrt((w * w + h * h) / 2);
  const soft = smear(reach);
  if (soft < MOTION_BLUR.min) return { style, sigmaX: 0 };
  const edge = q * reach;
  const mask =
    cut.kind === "wipe"
      ? `linear-gradient(to ${cut.dir > 0 ? "right" : "left"}, #000 ${px(edge - soft / 2)}, transparent ${px(edge + soft / 2)})`
      : `radial-gradient(circle at 50% 50%, #000 ${px(edge - soft / 2)}, transparent ${px(edge + soft / 2)})`;
  return { style: { maskImage: mask, WebkitMaskImage: mask }, sigmaX: 0 };
}

/** Altyazı sayfaları: kelimeler 1,4 sn içinde birleşir (TikTok tarzı). */
export function captionPages(captions: Timeline["captions"]) {
  const tokens: Caption[] = captions.map((w, i) => ({
    text: i === 0 ? w.text : ` ${w.text}`,
    startMs: w.startMs,
    endMs: w.endMs,
    timestampMs: w.startMs,
    confidence: null,
  }));
  return createTikTokStyleCaptions({ captions: tokens, combineTokensWithinMilliseconds: 1400 }).pages;
}
