import { describe, expect, it } from "vitest";
import { PronunciationBook, PronunciationEntry, PronunciationMutation, pronunciationTermKey } from "../src/pronunciations.ts";

describe("pronunciation contracts", () => {
  it("normalizes language and term identity while stripping forged priority fields", () => {
    expect(PronunciationEntry.parse({ lang: " TR ", written: " C++ ", spoken: " si pılas pılas ", origin: "verified", priority: 999 })).toEqual({ lang: "tr", written: "C++", spoken: "si pılas pılas" });
    expect(pronunciationTermKey(" Steve   Jobs ")).toBe("steve jobs");
    expect(PronunciationMutation.safeParse({ type: "overwrite-all", entries: [] }).success).toBe(false);
  });
  it.each(["__proto__", "constructor", "PROTOTYPE", "", "a\nb", "x".repeat(121)])("rejects invalid written entries: %s", (written) => {
    expect(PronunciationEntry.safeParse({ lang: "tr", written, spoken: "speech" }).success).toBe(false);
  });
  it("rejects duplicate case variants, unbounded data and invalid spoken forms", () => {
    const entry = { lang: "tr", written: "C++", spoken: "see plus plus" };
    expect(PronunciationBook.safeParse({ version: 1, revision: 0, updatedAt: "", entries: [entry, { ...entry, written: "c++" }] }).success).toBe(false);
    expect(PronunciationEntry.safeParse({ ...entry, spoken: "x".repeat(241) }).success).toBe(false);
    expect(PronunciationEntry.safeParse({ ...entry, spoken: "a\nb" }).success).toBe(false);
    expect(PronunciationEntry.safeParse({ ...entry, lang: "../tr" }).success).toBe(false);
  });
});
