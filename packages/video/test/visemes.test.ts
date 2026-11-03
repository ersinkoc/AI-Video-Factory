import { describe, expect, it } from "vitest";
import { VISEME_TIMING, visemeAt, visemeCues } from "../src/visemes.ts";

const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });
const lead = VISEME_TIMING.lead;

describe("ağız şekilleri (vizem)", () => {
  it("harfler şekle döner: kapalı M/B/P, açık A, yuvarlak O, büzük U, F/V dişte, L dil yukarıda; ünlü uzun sürer", () => {
    const cues = visemeCues([w("Mavi", 1000, 1500), w("lof", 1520, 1900)]);
    expect(cues.map((c) => c.value)).toEqual(["X", "A", "D", "G", "B", "H", "E", "G", "X"]);
    // İlk kelimeden önce dinlenme; şekiller sesi önden karşılar.
    expect(cues[0]).toEqual({ start: 0, end: 1000 - lead, value: "X" });
    // "Mavi": M(1) a(1,6) v(1) i(1,6) = 5,2 birim, 500 ms.
    expect(cues[1]!.end - cues[1]!.start).toBeCloseTo(500 / 5.2, 6);
    expect(cues[2]!.end - cues[2]!.start).toBeCloseTo((500 * 1.6) / 5.2, 6);
    expect(visemeAt(cues, 1001)).toBe("A");
    expect(visemeAt(cues, 1100)).toBe("D");
    expect(visemeAt(cues, 99_999)).toBe("X");
    expect(visemeAt(cues, -5)).toBe("X");
    expect(visemeAt([], 500)).toBe("X");
  });

  it("kısa boşlukta ağız açık kalır, uzun boşlukta dinlenir; aynı şekil birleşir, çok kısa şekil öncekine katılır", () => {
    const close = visemeCues([w("aa", 0, 300), w("ee", 350, 600)]);
    expect(close.map((c) => c.value)).toEqual(["D", "C", "X"]);
    const far = visemeCues([w("aa", 0, 300), w("ee", 600, 900)]);
    expect(far.map((c) => c.value)).toEqual(["D", "X", "C", "X"]);
    // "pa" 80 ms: p (~31 ms) çok kısa, öncekine (dinlenme) katılır.
    const quick = visemeCues([w("pa", 1000, 1080)]);
    expect(quick.map((c) => c.value)).toEqual(["X", "D", "X"]);
    // İlk şekil kısa olsa da kalır.
    expect(visemeCues([w("pa", 0, 100)])[0]!.value).toBe("A");
  });

  it("noktalama ve rakam sayılmaz; boş ya da süresiz kelime atlanır; Türkçe büyük harf (İ, I) doğru", () => {
    expect(visemeCues([w("42!", 0, 300), w("x", 300, 300)])).toEqual([]);
    expect(visemeCues([w("İ", 0, 200)])[0]!.value).toBe("B");
    expect(visemeCues([w("IŞIK", 0, 400)]).map((c) => c.value)).toEqual(["B", "X"]);
    expect(visemeCues([w("Ünlü", 0, 400)]).map((c) => c.value)).toEqual(["F", "B", "H", "F", "X"]);
  });

  it("okunuşu farklı terimde ağız okunuşu izler: C++ 'si plas plas' diye söylenir", () => {
    const said = visemeCues([{ ...w("C++", 0, 900), say: "si plas plas" }]).map((c) => c.value);
    expect(said).toEqual(visemeCues([w("si plas plas", 0, 900)]).map((c) => c.value));
    expect(said).toContain("A");
    expect(visemeCues([w("C++", 0, 900)]).map((c) => c.value)).not.toContain("A");
  });
});
