import { describe, expect, it } from "vitest";
import { AgentError, pronouncer, PronounceOut, toOutputSchema, type QueryFn } from "../src/index.ts";

describe("telaffuz ajanı", () => {
  it("anlatımı ve bilinen terimleri verir, dile göre okunuş ister; ucuz modelle çalışır", async () => {
    let params: { prompt: string | AsyncIterable<{ message: { content: { type: string; text?: string }[] } }>; options: Record<string, unknown> } | undefined;
    const queryFn = ((p: typeof params) => {
      params = p;
      return (async function* () {
        yield { type: "result", subtype: "error_max_turns", duration_ms: 1, total_cost_usd: 0 };
      })();
    }) as unknown as QueryFn;
    const text = async () => {
      if (typeof params!.prompt === "string") return params!.prompt;
      const parts: string[] = [];
      for await (const m of params!.prompt) parts.push(...m.message.content.map((c) => c.text ?? ""));
      return parts.join("");
    };
    await expect(pronouncer({ language: "tr", text: "C++ ve Steve Jobs", known: ["C++", "Java"] }, { queryFn })).rejects.toThrow(AgentError);
    expect(await text()).toBe("Already handled, do not list: C++, Java\n\nNarration:\nC++ ve Steve Jobs");
    expect(params!.options.systemPrompt).toContain('language "tr"');
    expect(params!.options.systemPrompt).toContain("si pılas pılas");
    await expect(pronouncer({ language: "en", text: "Gürel", known: [] }, { queryFn })).rejects.toThrow(AgentError);
    expect(await text()).toBe("Narration:\nGürel");
  });

  it("çıktı şeması: yazılış ve okunuş zorunlu", () => {
    const schema = toOutputSchema(PronounceOut) as { required: string[] };
    expect(schema.required).toEqual(["terms"]);
    expect(PronounceOut.safeParse({ terms: [{ written: "C++" }] }).success).toBe(false);
    expect(PronounceOut.parse({ terms: [{ written: "C++", spoken: "si pılas pılas" }] }).terms).toHaveLength(1);
  });
});
