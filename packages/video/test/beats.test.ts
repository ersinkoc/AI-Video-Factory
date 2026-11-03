import { describe, expect, it } from "vitest";
import { armBeats, BEAT, pulseAt, speechBeats, strokeAt } from "../src/beats.ts";

const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

describe("konuşma vurguları", () => {
  it("öbek başı (ilk kelime, duraklamadan sonraki) güçlü, uzun kelime zayıf vurgudur; kısa kelime vurgu değildir", () => {
    // "bilgisayarın" 4 hece: vurgulu; "hikâyesi" duraklamadan sonra: öbek başı; 3 heceli kelime vurgu değil.
    const beats = speechBeats([
      w("Bugün", 0, 300),
      w("bir", 320, 700),
      w("bilgisayarın", 720, 1300),
      w("hikâyesi", 1600, 1900),
      w("anlatılır", 1920, 2500),
    ]);
    expect(beats).toEqual([
      { at: 0, strength: 1, phrase: true },
      { at: 720, strength: 0.6, phrase: false },
      { at: 1600, strength: 1, phrase: true },
    ]);
  });

  it("iki vurgu çok yakınsa güçlü olan kalır; ünlüsüz kelime vurgu taşımaz ama öbeği sürdürür; süresiz kelime atlanır", () => {
    // Uzun kelimeden 680 ms sonra öbek başı: öbek başı kalır. Öbek başından hemen sonraki uzun kelime düşer.
    expect(
      speechBeats([w("a", 0, 100), w("ve", 120, 900), w("anlatılacaktı", 920, 1300), w("tekrar", 1600, 1800), w("anlatılacaktı", 1820, 2400)]),
    ).toEqual([
      { at: 0, strength: 1, phrase: true },
      { at: 1600, strength: 1, phrase: true },
    ]);
    expect(speechBeats([w("bilgisayar", 0, 200), w("anlatılacaktı", 210, 600)])).toEqual([{ at: 0, strength: 1, phrase: true }]);
    expect(speechBeats([w("42", 0, 300), w("ve", 310, 400), w("x", 900, 900), w("ve", 1000, 1100)])).toEqual([{ at: 1000, strength: 1, phrase: true }]);
    expect(speechBeats([])).toEqual([]);
  });

  it("el vurguları öbek başlarıdır, aralarında en az armGap", () => {
    const beats = [
      { at: 0, strength: 1, phrase: true },
      { at: 500, strength: 0.6, phrase: false },
      { at: 1500, strength: 1, phrase: true },
      { at: 2400, strength: 1, phrase: true },
    ];
    expect(armBeats(beats).map((b) => b.at)).toEqual([0, 2400]);
    expect(BEAT.armGap).toBe(2200);
  });

  it("tümsek kelimeden lead önce başlar, ortasında güç kadar, süresi bitince sıfır", () => {
    const beats = [
      { at: 1000, strength: 1, phrase: true },
      { at: 3000, strength: 0.6, phrase: false },
    ];
    expect(pulseAt(beats, 500, BEAT.nod)).toBe(0);
    expect(pulseAt(beats, 1000 - BEAT.lead, BEAT.nod)).toBe(0);
    expect(pulseAt(beats, 1000 - BEAT.lead + BEAT.nod / 2, BEAT.nod)).toBeCloseTo(1, 6);
    expect(pulseAt(beats, 3000 - BEAT.lead + BEAT.nod / 2, BEAT.nod)).toBeCloseTo(0.6, 6);
    expect(pulseAt(beats, 1000 - BEAT.lead + BEAT.nod, BEAT.nod)).toBe(0);
    expect(pulseAt([], 1000, BEAT.nod)).toBe(0);
  });

  it("el vurgusu: kelimeden önce kalkar, kelimede en uçta, tutulur, iner", () => {
    const beats = [{ at: 1000, strength: 1, phrase: true }];
    expect(strokeAt(beats, 0)).toEqual({ k: 0, index: -1 });
    expect(strokeAt(beats, 1000 - BEAT.prep / 2)).toEqual({ k: 0.5, index: 0 });
    expect(strokeAt(beats, 1000).k).toBe(1);
    expect(strokeAt(beats, 1000 + BEAT.hold - 1).k).toBe(1);
    expect(strokeAt(beats, 1000 + BEAT.hold + BEAT.retract / 2).k).toBeCloseTo(0.5, 6);
    expect(strokeAt(beats, 1000 + BEAT.hold + BEAT.retract)).toEqual({ k: 0, index: 0 });
  });
});
