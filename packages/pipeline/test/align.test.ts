import { describe, expect, it } from "vitest";
import { ALIGN, alignWords, parseSilences } from "../src/align.ts";

const gaps = (words: { startMs: number; endMs: number }[]) => words.slice(1).flatMap((w, i) => (w.startMs > words[i]!.endMs ? [[words[i]!.endMs, w.startMs]] : []));

describe("kelime zamanlarının sessizliklere hizalanması", () => {
  it("noktalama duraklamaları sesteki sessizliklere oturur; sessiz virgül boşluksuz kalır; baş ve sondaki sessizlikte kelime yok", () => {
    // "aaaa bbbb, cccc. dddd, eeee": nokta ve ilk virgül duraklar, ikinci virgülde ses durmaz.
    const words = alignWords("aaaa bbbb, cccc. dddd, eeee", 3000, [
      { start: 0, end: 100 },
      { start: 1000, end: 1200 },
      { start: 1700, end: 2100 },
      { start: 2900, end: 3000 },
    ]);
    expect(words.map((w) => w.text)).toEqual(["aaaa", "bbbb,", "cccc.", "dddd,", "eeee"]);
    expect(words[0]!.startMs).toBe(100);
    expect(words[1]!.endMs).toBe(1000);
    expect(words[2]!).toEqual({ text: "cccc.", startMs: 1200, endMs: 1700 });
    expect(words[3]!.startMs).toBe(2100);
    expect(words[4]!.endMs).toBe(2900);
    expect(gaps(words)).toEqual([
      [1000, 1200],
      [1700, 2100],
    ]);
    // Öbek içinde süre harf sayısıyla bölünür.
    expect(words[0]!.endMs).toBe(550);
  });

  it("noktalamayla eşleşmeyen kısa sessizlik yok sayılır; nefesle bölünmüş sessizlik birleşir; ters sıralı ve boş sessizlik sorun olmaz", () => {
    const words = alignWords("aaaa bbbb. cccc dddd", 2000, [
      { start: 1550, end: 1600 },
      { start: 900, end: 1000 },
      { start: 1050, end: 1100 },
      { start: 400, end: 400 },
    ]);
    expect(gaps(words)).toEqual([[900, 1100]]);
    expect(words.at(-1)!.endMs).toBe(2000);
  });

  it("aynı sayıda sessizlik ve noktalama varken hız en düzgün kalan eşleşme seçilir", () => {
    // İki nokta, iki sessizlik: sırayla eşleşir (çapraz eşleşme konuşma hızını bozardı).
    const words = alignWords("aaaaaaaa bbbbbbbb. cccccccc dddddddd. eeeeeeee ffffffff", 3000, [
      { start: 1000, end: 1150 },
      { start: 2000, end: 2150 },
    ]);
    expect(words[1]!.endMs).toBe(1000);
    expect(words[3]!.endMs).toBe(2000);
    // Uzun sessizlik eşleşmeyecekse (noktalama yok) yine de yol bulunur; kelimeler sessizliğin üstüne yayılır.
    const none = alignWords("aaaa bbbb cccc", 3000, [{ start: 1000, end: 1600 }]);
    expect(gaps(none)).toEqual([]);
    expect([none[0]!.startMs, none.at(-1)!.endMs]).toEqual([0, 3000]);
  });

  it("sessizlik yoksa noktalamadan tahmini duraklama (en çok sürenin %30'u); noktalamasız metin harflerle bölünür", () => {
    const est = alignWords("aaaa, bbbb. cccc", 2000, []);
    expect(gaps(est)).toEqual([
      [Math.round(5 * ((2000 - 560) / 15)), Math.round(5 * ((2000 - 560) / 15) + 180)],
      [Math.round(10 * ((2000 - 560) / 15) + 180), Math.round(10 * ((2000 - 560) / 15) + 560)],
    ]);
    expect(est.at(-1)!.endMs).toBe(2000);
    // Kısa klipte duraklamalar sürenin %30'una sığdırılır.
    const short = alignWords("a. b. c", 600, []);
    const paused = gaps(short).reduce((s, [a, b]) => s + b! - a!, 0);
    expect(paused).toBeLessThanOrEqual(600 * ALIGN.maxPauseShare + 1);
    // Ağırlık harf + 1: 4, 4, 3.
    expect(alignWords("bir iki üç", 1500, [])).toEqual([
      { text: "bir", startMs: 0, endMs: 545 },
      { text: "iki", startMs: 545, endMs: 1091 },
      { text: "üç", startMs: 1091, endMs: 1500 },
    ]);
    expect(alignWords("   ", 1000, [])).toEqual([]);
  });

  it("rakamlar harften uzun okunur; tırnak ve parantez noktalamayı gizlemez; bütünüyle sessiz klip", () => {
    const words = alignWords("1999 yılında. (Sonra) geldi", 3000, []);
    expect(words[0]!.endMs - words[0]!.startMs).toBeGreaterThan(words[1]!.endMs - words[1]!.startMs);
    expect(gaps(words)).toHaveLength(1);
    expect(gaps(alignWords('"Evet." dedi', 1000, []))).toHaveLength(1);
    const silent = alignWords("aaaa bbbb", 1000, [{ start: 0, end: 1000 }]);
    expect(silent.at(-1)!.endMs).toBe(1001);
  });
});

describe("silencedetect çıktısı", () => {
  it("başlangıç-bitiş çiftleri ms'ye çevrilir; kapanmamış son sessizlik klip sonuna kadar; eşsiz bitiş yok sayılır", () => {
    const out = "silence_end: 0.5\nsilence_start: -0.01\nsilence_end: 0.2 | silence_duration: 0.21\nsilence_start: 1.25\nsilence_end: 1.5\nsilence_start: 2.9\n";
    expect(parseSilences(out, 3000)).toEqual([
      { start: 0, end: 200 },
      { start: 1250, end: 1500 },
      { start: 2900, end: 3000 },
    ]);
    expect(parseSilences("silence_start: 3", 3000)).toEqual([]);
    expect(parseSilences("", 3000)).toEqual([]);
  });
});
