import type { Timeline } from "@ys/core";

/**
 * Bölümden dikey Short: ardışık sahnelerden oluşan bir aralık 9:16 olarak yeniden render edilir (API yok). Aralığı
 * yayın paketi ajanı seçer; süre sınırı ve kesim kodda. Müzik ve efekt izleri bölümün izinden kesilmez, kısa için
 * yeniden üretilir (baş ve son yumuşak, ducking yerinde).
 */
export const SHORT = {
  /** YouTube Shorts 3 dk'ya kadar kabul eder; izlenme en çok bir dakikaya kadar tutuyor. */
  maxSec: 60,
  /** Bundan kısa seçim sonraki sahnelerle uzatılır (sınırı aşmadan). */
  minSec: 15,
  /** YouTube'un Shorts sınırı: tek sahne bir dakikayı aşsa da cümle ortasında kesilmez, bu sınıra kadar. */
  limitSec: 180,
  width: 1080,
  height: 1920,
};

export interface ShortRange {
  scenes: string[];
  fromMs: number;
  toMs: number;
}

/**
 * Seçilen sahne aralığı (dahil) ms cinsinden; seçim yoksa ya da bilinmeyen sahne varsa baştan. Uzun aralık sondan
 * kısaltılır (en az bir sahne kalır), kısa aralık sonraki sahnelerle uzatılır. Anlatım sahne başında başladığı için
 * ses izleri kesilmez.
 */
export function shortRange(sceneIds: string[], startsMs: Record<string, number>, totalMs: number, pick?: { from: string; to: string }): ShortRange {
  const ids = sceneIds.filter((id) => startsMs[id] !== undefined);
  const start = (i: number) => startsMs[ids[i]!]!;
  const end = (i: number) => (i + 1 < ids.length ? start(i + 1) : totalMs);
  let i = pick ? ids.indexOf(pick.from) : -1;
  let j = pick ? ids.indexOf(pick.to) : -1;
  if (i < 0 || j < i) {
    i = 0;
    j = ids.length - 1;
  }
  const len = () => end(j) - start(i);
  while (j > i && len() > SHORT.maxSec * 1000) j--;
  while (len() < SHORT.minSec * 1000 && j + 1 < ids.length && end(j + 1) - start(i) <= SHORT.maxSec * 1000) j++;
  return { scenes: ids.slice(i, j + 1), fromMs: start(i), toMs: Math.min(end(j), start(i) + SHORT.limitSec * 1000) };
}

/**
 * Bölüm timeline'ından Short timeline'ı: aralıktaki çekimler, anlatım ve kelimeler başa kaydırılır, tuval dikey olur.
 * Aralığın başından önce başlayan çekim aralığın başına kırpılır. Müzik ve efekt izleri atılır (çağıran yeniden üretir).
 */
export function shortTimeline(timeline: Timeline, fromMs: number, toMs: number): Timeline {
  const frame = (ms: number) => Math.round((ms / 1000) * timeline.fps);
  const from = frame(fromMs);
  const to = Math.max(from + 1, frame(toMs));
  const clip = <T extends { fromFrame: number; durationInFrames: number }>(x: T): T[] => {
    const a = Math.max(from, x.fromFrame);
    const b = Math.min(to, x.fromFrame + x.durationInFrames);
    return b > a ? [{ ...x, fromFrame: a - from, durationInFrames: b - a }] : [];
  };
  const words = (list: Timeline["captions"]) =>
    list.filter((w) => w.startMs >= fromMs && w.startMs < toMs).map((w) => ({ ...w, startMs: w.startMs - fromMs, endMs: Math.min(w.endMs, toMs) - fromMs }));
  return {
    ...timeline,
    width: SHORT.width,
    height: SHORT.height,
    durationInFrames: to - from,
    visuals: timeline.visuals.flatMap(clip),
    audio: timeline.audio.filter((a) => a.role === "voice").flatMap(clip),
    captions: words(timeline.captions),
    speech: words(timeline.speech),
  };
}
