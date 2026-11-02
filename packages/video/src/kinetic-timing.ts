/**
 * Kinetik yazının zaman çizelgesi (sn; çizelge ilerlemeye oranlanır): plaka silinmesi, ilk kelimenin başlangıcı,
 * kelimeler arası gecikme, kelime süresi. Render (GSAP) ve efekt sesleri aynı sabitleri kullanır.
 */
export const KINETIC = { wipe: 0.35, words: 0.15, stagger: 0.07, word: 0.45 } as const;

/** n kelimelik çizelgenin toplam süresi (GSAP'in hesapladığıyla aynı). */
export const kineticLength = (n: number) => Math.max(KINETIC.wipe, KINETIC.words + KINETIC.stagger * Math.max(0, n - 1) + KINETIC.word);
