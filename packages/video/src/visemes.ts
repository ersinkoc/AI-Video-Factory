import type { WordTiming } from "@ys/core";

/**
 * Ağız şekilleri (vizem, 3 Kas): konuşan ağız eskiden çizimin gülümsemesini hecelerle büyütüp küçültüyordu; dudaklar
 * sese hiç uymuyordu. Klasik 2D animasyonun Preston Blair seti (Rhubarb Lip Sync'in A–H + X harfleri): A kapalı
 * (M, B, P), B dişler hafif açık (çoğu ünsüz, İ), C açık (E), D çok açık (A), E yuvarlak (O, Ö), F büzük (U, Ü, W),
 * G üst dişler alt dudakta (F, V), H dil yukarıda (L), X dinlenme. Türkçe yazım sese çok yakın olduğu için ses analizi
 * gerekmez: şekiller anlatımın kelime zamanlarından ve harflerinden çıkar (İngilizcede de yaklaşık doğru).
 */
export type Viseme = "X" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface VisemeCue {
  /** Bölüm başından ms. */
  start: number;
  end: number;
  value: Viseme;
}

const LETTER: Record<string, Viseme> = {
  a: "D",
  â: "D",
  e: "C",
  i: "B",
  î: "B",
  ı: "B",
  y: "B",
  o: "E",
  ö: "E",
  u: "F",
  û: "F",
  ü: "F",
  w: "F",
  m: "A",
  b: "A",
  p: "A",
  f: "G",
  v: "G",
  l: "H",
};

const VOWEL = /[aâeiîıoöuûü]/;

export const VISEME_TIMING = {
  /** Ağız sesi bu kadar önden karşılar (ms): dudak sesten önce şekil alır. */
  lead: 40,
  /**
   * Bundan kısa şekil bir kareye bile denk gelmeyebilir, titrer: öncekine katılır (ms, ~1 kare). Eskiden 60: normal
   * konuşmada ünsüzler ~58 ms sürüyor, hepsi yutuluyor, dudaklar M/B/P'de hiç kapanmıyordu (Google bölümü, 3 Kas).
   */
  min: 35,
  /** Kelimeler arası bundan uzun boşlukta ağız dinlenmeye döner (ms). */
  rest: 140,
  /** Ünlü, ünsüzden bu kat uzun sürer. */
  vowel: 1.6,
} as const;

/** Bir kelimenin harf sırasıyla vizemleri ve süre ağırlıkları. */
function letters(text: string): { value: Viseme; weight: number }[] {
  const chars = [...text.toLocaleLowerCase("tr")].filter((c) => /[a-zâçğıîöşûü]/.test(c));
  return chars.map((c) => ({ value: LETTER[c] ?? "B", weight: VOWEL.test(c) ? VISEME_TIMING.vowel : 1 }));
}

/** Kelime zamanlarından vizem dizisi: kelime süresi harflere ağırlıkla bölünür, kısa şekiller birleşir, uzun boşlukta X. */
export function visemeCues(words: readonly WordTiming[]): VisemeCue[] {
  const raw: VisemeCue[] = [];
  let last = -Infinity;
  for (const w of words) {
    const parts = letters(w.text);
    if (!parts.length || w.endMs <= w.startMs) continue;
    const from = Math.max(0, last);
    if (w.startMs - last > VISEME_TIMING.rest && w.startMs > from) raw.push({ start: from, end: w.startMs, value: "X" });
    const total = parts.reduce((s, x) => s + x.weight, 0);
    let at = w.startMs;
    for (const x of parts) {
      const end = at + ((w.endMs - w.startMs) * x.weight) / total;
      raw.push({ start: at, end, value: x.value });
      at = end;
    }
    last = w.endMs;
  }
  if (raw.length) raw.push({ start: last, end: last + 1e9, value: "X" });
  // Aynı şekil art arda birleşir; çok kısa şekil öncekine katılır.
  const merged: VisemeCue[] = [];
  for (const c of raw) {
    const prev = merged.at(-1);
    if (prev && (prev.value === c.value || c.end - c.start < VISEME_TIMING.min)) prev.end = c.end;
    else merged.push({ ...c });
  }
  return merged.map((c, i) => ({ ...c, start: i ? c.start - VISEME_TIMING.lead : c.start, end: c.end - VISEME_TIMING.lead }));
}

/** Bu anın ağız şekli (ikili arama); dizinin dışında dinlenme. */
export function visemeAt(cues: readonly VisemeCue[], ms: number): Viseme {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid]!;
    if (ms < c.start) hi = mid - 1;
    else if (ms >= c.end) lo = mid + 1;
    else return c.value;
  }
  return "X";
}
