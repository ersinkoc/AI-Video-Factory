import { z } from "zod";

export const pronunciationTermKey = (text: string) => text.trim().replace(/\s+/gu, " ").toLowerCase();
const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
export const PronunciationWritten = text(120).refine((value) => !["__proto__", "constructor", "prototype"].includes(pronunciationTermKey(value)));
export const PronunciationEntry = z.object({ lang: z.string().trim().toLowerCase().regex(/^[a-z]{2,3}$/), written: PronunciationWritten, spoken: text(240) });
export type PronunciationEntry = z.infer<typeof PronunciationEntry>;
export const PronunciationBook = z.object({ version: z.literal(1), revision: z.number().int().nonnegative(), updatedAt: z.string(), entries: z.array(PronunciationEntry).max(1000) }).refine((book) => new Set(book.entries.map((e) => `${e.lang}:${pronunciationTermKey(e.written)}`)).size === book.entries.length);
export type PronunciationBook = z.infer<typeof PronunciationBook>;
export const PronunciationMutation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("put"), entry: PronunciationEntry }),
  z.object({ type: z.literal("remove"), lang: PronunciationEntry.shape.lang, written: PronunciationWritten }),
]);
