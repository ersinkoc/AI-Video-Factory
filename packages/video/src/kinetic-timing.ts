import type { VectorAnim } from "@ys/core";

/**
 * Kinetik yazının zaman çizelgesi (sn; çizelge ilerlemeye oranlanır): plaka silinmesi, ilk kelimenin başlangıcı,
 * kelimeler arası gecikme, kelime süresi. Render (GSAP) ve efekt sesleri aynı sabitleri kullanır.
 */
export const KINETIC = { wipe: 0.35, words: 0.15, stagger: 0.07, word: 0.45 } as const;

/** n kelimelik çizelgenin toplam süresi (GSAP'in hesapladığıyla aynı). */
export const kineticLength = (n: number) => Math.max(KINETIC.wipe, KINETIC.words + KINETIC.stagger * Math.max(0, n - 1) + KINETIC.word);

/** Okunur hız: kinetik çizelge bu kat yavaş oynar, daktilo saniyede bu kadar harf yazar, sayaç en çok bu kadar sürer (sn). */
export const TEXT_PACE = { kinetic: 1.25, typeCps: 16, countSec: 2.2 } as const;

/**
 * Yazı animasyonunun gerçekte oynadığı pencere (3 Kas, C# incelemesi: yönetmen pencereyi çoğu kez bütün çekim verince
 * altı kelimelik başlık 6–8 sn'de açılıyor, karelerin çoğunda yazı yarım görünüyordu). Kinetik yazı, daktilo ve sayaç
 * doğal hızında oynayıp biter, sonra yazı durur; pencere daha kısaysa ona sığar. Diğer animasyonların penceresi aynı
 * kalır. Render (Vector.tsx) ve efekt sesleri (sfx.ts) aynı pencereyi kullanır.
 */
export function revealWindow<A extends Pick<VectorAnim, "type" | "start" | "end">>(a: A, text: string, shotSec: number): A {
  const natural =
    a.type === "kinetic"
      ? kineticLength(text.split(/\s+/).filter(Boolean).length) * TEXT_PACE.kinetic
      : a.type === "typewriter"
        ? text.length / TEXT_PACE.typeCps
        : a.type === "count_up"
          ? TEXT_PACE.countSec
          : Infinity;
  const window = (a.end - a.start) * shotSec;
  return natural >= window ? a : { ...a, end: a.start + natural / shotSec };
}
