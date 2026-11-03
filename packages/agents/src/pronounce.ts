import { z } from "zod";
import { models, runStructured, type AgentDeps, type AgentResult } from "./runner.ts";

/**
 * Seslendirme öncesi okunuşlar (3 Kas, kullanıcı: Gemini TTS Türkçe anlatımda "C++"yı "si artı artı" okudu). Ses motoru
 * her kelimeyi anlatım dilinin yazımıyla okur; yabancı ad, marka, programlama dili, kısaltma ve simgeler yanlış çıkar.
 * Ajan yalnız bunları ve o dilin harfleriyle okunuşlarını verir; metni değiştirmez, çevirmez. Yerleşik sözlükteki
 * terimler (known) atlanır.
 */
export const PronounceOut = z.object({
  terms: z
    .array(
      z.object({
        written: z.string().max(60).describe("The term exactly as written in the narration, without a suffix after an apostrophe (C++, not C++'ın); a full name may be several words"),
        spoken: z.string().max(80).describe("A respelling in the narration language's alphabet that makes a voice for that language say it the way fluent speakers say it aloud; letters and spaces only, no symbols"),
      }),
    )
    .max(80)
    .describe("Only words, names, abbreviations and symbols a voice for this language would mispronounce when reading them by its own spelling rules; empty if none"),
});
export type PronounceOut = z.infer<typeof PronounceOut>;

export interface PronounceInput {
  /** Anlatım dili (tr, en…). */
  language: string;
  /** Seslendirilecek anlatım (sahneler art arda). */
  text: string;
  /** Okunuşu zaten bilinen terimler (yerleşik sözlük, önceki sonuçlar): yeniden verilmez. */
  known: string[];
}

export function pronouncer(input: PronounceInput, deps?: AgentDeps): Promise<AgentResult<PronounceOut>> {
  return runStructured(
    {
      name: "pronouncer",
      model: models().cheap,
      effort: "low",
      schema: PronounceOut,
      system: `You prepare a narration for a text-to-speech voice of language "${input.language}". The voice reads every word by that language's spelling rules, so foreign names, brands, programming languages, abbreviations and symbols come out wrong (a Turkish voice reads "C++" as "ce artı artı" and "Jobs" as "jobs" with a Turkish j). List each such term with a respelling in the narration language's alphabet that makes the voice say it the way fluent speakers of that language say it in conversation. Examples for Turkish: C++ → si plas plas, JavaScript → cavaskript, Steve Jobs → Stiv Cobs, iPhone → ayfon, GitHub → githab, Wozniak → Vozniyak; abbreviations become the letter names locals use (PHP → pi eyç pi, NASA stays as a word if it is said as one). Skip native words and names the voice already reads correctly. Never translate, never change meaning, keep names recognisable.`,
      prompt: `${input.known.length ? `Already handled, do not list: ${input.known.join(", ")}\n\n` : ""}Narration:\n${input.text}`,
    },
    deps,
  );
}
