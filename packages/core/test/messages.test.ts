import { describe, expect, it } from "vitest";
import { errorText, formatText, isLocalizedError, isMsg, LocalizedError, MESSAGES, msg, trText, type MessageId } from "../src/messages/index.ts";

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("mesaj kataloğu", () => {
  it("her anahtarın Türkçesi ve İngilizcesi var, değişkenleri aynı", () => {
    for (const [key, { tr, en }] of Object.entries(MESSAGES)) {
      expect(tr.trim(), key).not.toBe("");
      expect(en.trim(), key).not.toBe("");
      expect(vars(en), key).toEqual(vars(tr));
    }
  });

  it("biçimlendirme: dil, iç içe mesaj, eksik değişken, düz metin, bilinmeyen anahtar", () => {
    const unknown = "err.unknown" as MessageId;
    expect(formatText("en", msg(unknown))).toBe("Unknown error");
    expect(formatText("tr", msg(unknown))).toBe("Bilinmeyen hata");
    expect(formatText("en", "düz")).toBe("düz");
    expect(formatText("en", undefined)).toBe("");
    expect(formatText("en", { key: "yok.boyle" as MessageId })).toBe("yok.boyle");
    // Katalog dışı şablonla iç içe ve eksik değişken davranışı.
    const MESSAGES_ANY = MESSAGES as Record<string, { tr: string; en: string }>;
    MESSAGES_ANY["test.wrap"] = { tr: "{a} / {b} / {c}", en: "{a} | {b} | {c}" };
    try {
      expect(formatText("en", msg("test.wrap" as MessageId, { a: 1, b: msg(unknown) }))).toBe("1 | Unknown error | {c}");
    } finally {
      delete MESSAGES_ANY["test.wrap"];
    }
    expect(trText(msg(unknown))).toBe("Bilinmeyen hata");
    expect(msg(unknown)).toEqual({ key: unknown });
    expect(msg(unknown, { x: 1 })).toEqual({ key: unknown, params: { x: 1 } });
  });

  it("isMsg ve çevrilebilir hata", () => {
    expect(isMsg(msg("err.unknown"))).toBe(true);
    expect(isMsg({ key: "yok.boyle" })).toBe(false);
    expect(isMsg("x")).toBe(false);
    expect(isMsg(null)).toBe(false);
    const e = new LocalizedError(msg("err.unknown"), { cause: "c" });
    expect(e.message).toBe("Bilinmeyen hata");
    expect(e.cause).toBe("c");
    expect(errorText(e)).toEqual({ key: "err.unknown" });
    expect(errorText(new Error("düz"))).toBe("düz");
    expect(errorText("metin")).toBe("metin");
    // Başka modül kopyasının sınıfından gelen hata (Stüdyo'nun öbür katmanı) yapısından tanınır.
    const foreign = Object.assign(new Error("Bölüm bulunamadı: x"), { text: msg("err.episode.notFound", { id: "x" }) });
    expect(foreign instanceof LocalizedError).toBe(false);
    expect(isLocalizedError(foreign)).toBe(true);
    expect(errorText(foreign)).toEqual({ key: "err.episode.notFound", params: { id: "x" } });
    // `text` alanı mesaj değilse düz hatadır; Error olmayan nesne de tanınmaz.
    expect(errorText(Object.assign(new Error("düz"), { text: "not" }))).toBe("düz");
    expect(isLocalizedError({ text: msg("err.unknown") })).toBe(false);
  });
});
