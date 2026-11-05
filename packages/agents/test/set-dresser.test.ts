import { describe, expect, it } from "vitest";
import { SET_PIECES } from "@ys/core";
import { AgentError, SetDressOut, setDresser, toOutputSchema, type QueryFn } from "../src/index.ts";

describe("set düzenleyici", () => {
  it("konuyu ve mekânları (yönetmenin nesneleriyle) verir; döneme uygun, yere basan eşya ister", async () => {
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
    const places = [
      { id: "l1", name: "Garaj", description: "A 1970s suburban garage.", props: ["p-bench: a workbench"] },
      { id: "b-sea", name: "Open sea", description: "Endless water.", props: [] },
    ];
    await expect(setDresser({ topic: "Apple tarihi", places }, { queryFn })).rejects.toThrow(AgentError);
    expect(await text()).toBe("Episode: Apple tarihi\n\nPlaces:\n- l1: Garaj. A 1970s suburban garage.\n  Director's props here: p-bench: a workbench\n- b-sea: Open sea. Endless water.");
    const system = String(params!.options.systemPrompt);
    expect(system).toContain(`up to ${SET_PIECES} pieces`);
    expect(system).toContain("Fit the era and region exactly");
    expect(system).toContain("never a table, desk");
    expect(system).toContain("open sea, sky");
  });

  it("çıktı şeması: mekân başına en çok iki eşya, ad, tarif ve referans zorunlu", () => {
    const schema = toOutputSchema(SetDressOut) as { required: string[] };
    expect(schema.required).toEqual(["locations"]);
    const piece = { name: "oak bookcase", description: "A tall oak bookcase.", reference: "oak bookcase" };
    expect(SetDressOut.safeParse({ locations: [{ id: "l1", pieces: [piece, piece, piece] }] }).success).toBe(false);
    expect(SetDressOut.safeParse({ locations: [{ id: "l1", pieces: [{ name: "x" }] }] }).success).toBe(false);
    expect(SetDressOut.parse({ locations: [{ id: "l1", pieces: [piece] }, { id: "l2", pieces: [] }] }).locations).toHaveLength(2);
  });
});
