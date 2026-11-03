import type { WordTiming } from "@ys/core";

/**
 * Konuşma vurguları (3 Kas): konuşan karakterin başı, kaşları ve elleri sabit sinüs ritmiyle ve rastgele zamanlı
 * jestlerle oynuyordu; ağız sese uyduktan sonra gövdenin sesten kopukluğu daha çok göze battı. İnsan baş sallamasını,
 * kaş kaldırmasını ve el vurgusunu cümlenin vurgulu yerine denk getirir (jest vurgusu vurgulu heceyle aynı anda ya da
 * biraz önce gelir; McNeill, "Hand and Mind", 1992). Vurgular kelime zamanlarından çıkar: duraklamadan sonraki ilk kelime
 * öbek başıdır (güçlü), uzun kelime vurguludur (zayıf).
 */
export interface Beat {
  /** Vurgulu kelimenin başı (bölüm başından ms). */
  at: number;
  /** 1 öbek başı, 0,6 uzun kelime. */
  strength: number;
  /** Duraklamadan sonra yeni öbek başlıyor. */
  phrase: boolean;
}

export const BEAT = {
  /** Bundan uzun sessizlikten sonraki kelime yeni öbek başıdır (ms). */
  pause: 250,
  /**
   * Bu kadar heceli kelime vurgulu sayılır. Türkçede içerik kelimelerinin çoğu 3 hecelidir ("şirketinin"): 3'te
   * neredeyse her kelime vurgu oluyor, baş durmadan sallanıyordu (Google anlatımı: dakikada 48).
   */
  syllables: 4,
  /** İki vurgu arası en az (ms): sık vurgu titreme gibi durur, güçlü olan kalır (konuşmada ana vurgu ~1–2 sn'de bir). */
  gap: 700,
  /** Hareket sesi önden karşılar (ms). */
  lead: 80,
  /** Baş vurgusu (aşağı inip kalkma) süresi (ms). */
  nod: 380,
  /** Öbek başında kaşın kalkıp inme süresi (ms). */
  brow: 650,
  /** İki el vurgusu arası en az (ms): her öbekte el kalkmaz. */
  armGap: 2200,
  /** El vurgusu: hazırlık (kelimeden önce), tutma, bırakma (ms). */
  prep: 350,
  hold: 500,
  retract: 450,
} as const;

const syllablesOf = (text: string) => text.match(/[aeıioöuüâîûy]+/giu)?.length ?? 0;

/** Kelime zamanlarından vurgular (zamana göre sıralı, aralarında en az BEAT.gap). */
export function speechBeats(words: readonly WordTiming[]): Beat[] {
  const out: Beat[] = [];
  let last = -Infinity;
  for (const w of words) {
    if (w.endMs <= w.startMs) continue;
    const phrase = w.startMs - last >= BEAT.pause;
    last = w.endMs;
    // Ünlüsüz "kelime" (rakam, kısaltma) vurgu taşımaz ama öbeği sürdürür.
    const n = syllablesOf(w.say ?? w.text);
    if (!n || (!phrase && n < BEAT.syllables)) continue;
    const beat = { at: w.startMs, strength: phrase ? 1 : 0.6, phrase };
    const prev = out.at(-1);
    if (prev && beat.at - prev.at < BEAT.gap) {
      if (beat.strength > prev.strength) out[out.length - 1] = beat;
    } else out.push(beat);
  }
  return out;
}

/** El vurgusu olacak vurgular: öbek başları, aralarında en az BEAT.armGap. */
export function armBeats(beats: readonly Beat[]): Beat[] {
  const out: Beat[] = [];
  for (const b of beats) if (b.phrase && (!out.length || b.at - out.at(-1)!.at >= BEAT.armGap)) out.push(b);
  return out;
}

/** Hareketin başladığı an ms'den önceki son vurgu (ikili arama); yoksa -1. */
function lastBefore(beats: readonly Beat[], ms: number, early: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]!.at - early <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Vurgudan doğan tek tümsek (0–1): kelimeden lead önce başlar, dur sürer, güçle ölçeklenir. */
export function pulseAt(beats: readonly Beat[], ms: number, dur: number): number {
  const i = lastBefore(beats, ms, BEAT.lead);
  if (i < 0) return 0;
  const b = beats[i]!;
  const x = (ms - (b.at - BEAT.lead)) / dur;
  return x < 1 ? Math.sin(Math.PI * x) * b.strength : 0;
}

const ease = (x: number) => x * x * (3 - 2 * x);

/**
 * El vurgusunun genliği (0–1) ve hangi vurgu olduğu: el kelimeden önce kalkar (hazırlık), vurgulu kelimede en uçtadır,
 * bir süre tutulur, sonra iner.
 */
export function strokeAt(beats: readonly Beat[], ms: number): { k: number; index: number } {
  const i = lastBefore(beats, ms, BEAT.prep);
  if (i < 0) return { k: 0, index: -1 };
  const d = ms - (beats[i]!.at - BEAT.prep);
  const k = d < BEAT.prep ? ease(d / BEAT.prep) : d < BEAT.prep + BEAT.hold ? 1 : d < BEAT.prep + BEAT.hold + BEAT.retract ? 1 - ease((d - BEAT.prep - BEAT.hold) / BEAT.retract) : 0;
  return { k, index: i };
}
