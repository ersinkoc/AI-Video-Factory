import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import type { Timeline } from "@ys/core";

/**
 * Bölüm kompozisyonunun (Episode.tsx) zamanlamaları; render önbelleği (chunks.ts) de bunlara bakar: bir parçanın
 * görüntüsünü hangi çekimlerin ve altyazı sayfalarının belirlediğini aynı hesaptan bilir. Tarayıcı paketine girer:
 * Node modülü içe aktarmaz.
 */

/** Geçişte ardışık çekimler bu kadar kare üst üste biner (crossfade). */
export const CROSSFADE = 8;

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
