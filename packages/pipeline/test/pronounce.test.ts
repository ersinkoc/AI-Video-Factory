import { describe, expect, it } from "vitest";
import { LEXICON, restoreWords, sayPlan } from "../src/pronounce.ts";

const tr = LEXICON.tr!;
/** Okunuş metninin her kelimesine eşit süre veren sahte sağlayıcı zamanları. */
const timed = (text: string, step = 300) => text.split(/\s+/).map((t, k) => ({ text: t, startMs: k * step, endMs: k * step + step - 20 }));

describe("seslendirmede yabancı terimlerin okunuşu", () => {
  it("Türkçe seste C++ 'si plas plas' okunur; ek ve noktalama korunur, harf duyarsız, kelimenin tamamı", () => {
    const plan = sayPlan("1985'te C++'ın ilk sürümü çıktı, (C#) sonra geldi. JAVA değil Java'yı; JavaScript ayrı.", tr);
    expect(plan.spoken).toBe("1985'te si plas plas'ın ilk sürümü çıktı, (si şarp) sonra geldi. cava değil cava'yı; cavaskript ayrı.");
    expect(plan.used).toEqual({ "C++": "si plas plas", "C#": "si şarp", Java: "cava", JavaScript: "cavaskript" });
    // Kelimenin içinde geçen terim değişmez.
    expect(sayPlan("Javanese Applesauce", tr).spoken).toBe("Javanese Applesauce");
  });

  it("çok kelimelik ad bütün olarak eşleşir; iç kelimede noktalama ya da ek varsa eşleşmez; en uzun önce", () => {
    const terms = { "Steve Jobs": "Stiv Cobs", Steve: "Stiv", "Visual Basic": "vijuıl beysik", BASIC: "beysik" };
    expect(sayPlan("Steve Jobs'un garajı. Steve, Jobs ve Visual Basic.", terms).spoken).toBe("Stiv Cobs'un garajı. Stiv, Jobs ve vijuıl beysik.");
    expect(sayPlan("Steve 'Jobs", terms).spoken).toBe("Stiv 'Jobs");
    // Metnin sonunda yarım kalan ad: tek kelimelik eşleşmeye düşer.
    expect(sayPlan("Merhaba Steve", { "Steve Jobs": "Stiv Cobs" }).spoken).toBe("Merhaba Steve");
    // Boş okunuş ya da boş yazılış yok sayılır.
    expect(sayPlan("a b", { a: " ", "": "x" }).spoken).toBe("a b");
    expect(sayPlan("", tr)).toEqual({ spoken: "", groups: [], used: {} });
  });

  it("zamanlar yazılışın kelimelerine döner: tek terim tek kelime (okunuşu say'de), eşit sayılı ad kelime kelime", () => {
    const plan = sayPlan("O dev, IBM. Steve Jobs geldi", { ...tr, "Steve Jobs": "Stiv Cobs" });
    const words = restoreWords(timed(plan.spoken), plan);
    expect(words).toEqual([
      { text: "O", startMs: 0, endMs: 280 },
      { text: "dev,", startMs: 300, endMs: 580 },
      { text: "IBM.", startMs: 600, endMs: 1480, say: "ay bi em." },
      { text: "Steve", startMs: 1500, endMs: 1780, say: "Stiv" },
      { text: "Jobs", startMs: 1800, endMs: 2080, say: "Cobs" },
      { text: "geldi", startMs: 2100, endMs: 2380 },
    ]);
    expect(restoreWords([], plan)).toEqual([]);
  });

  it("sağlayıcının kelime sınırları farklıysa harf konumundan bulunur", () => {
    const plan = sayPlan("C++ güzel", tr);
    // Sağlayıcı okunuşu iki kelimede verdi ("si plas" + "plas güzel").
    const words = restoreWords(
      [
        { text: "si plas", startMs: 0, endMs: 600 },
        { text: "plas güzel", startMs: 600, endMs: 1500 },
      ],
      plan,
    );
    expect(words[0]).toMatchObject({ text: "C++", startMs: 0, say: "si plas plas" });
    expect(words[1]).toMatchObject({ text: "güzel", endMs: 1500 });
    expect(words[0]!.endMs).toBe(words[1]!.startMs);
    // Sağlayıcının metni daha kısa (harfleri normalleştirdi): son kelime son zamana kadar uzar.
    const short = restoreWords([{ text: "", startMs: 0, endMs: 900 }], sayPlan("a b", {}));
    expect(short.at(-1)!.endMs).toBe(900);
  });
});
