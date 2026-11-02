import { describe, expect, it } from "vitest";
import { AgentError, figureDesigner, FigureOut, toOutputSchema, type QueryFn } from "../src/index.ts";

const IMG = { data: new Uint8Array([1, 2, 3]), mimeType: "image/png" };

describe("3D figür ajanı", () => {
  it("çizimi ve en çok iki referansı gösterir, karakteri tarif eder; ucuz modelle çalışır", async () => {
    let params: { prompt: AsyncIterable<{ message: { content: { type: string; text?: string }[] } }>; options: Record<string, unknown> } | undefined;
    const queryFn = ((p: typeof params) => {
      params = p;
      return (async function* () {
        yield { type: "result", subtype: "error_max_turns", duration_ms: 1, total_cost_usd: 0 };
      })();
    }) as unknown as QueryFn;
    await expect(figureDesigner({ name: "Ada", description: "Victorian mathematician", drawing: IMG, references: [IMG, IMG, IMG] }, { queryFn })).rejects.toThrow(AgentError);
    const content: { type: string; text?: string }[] = [];
    for await (const m of params!.prompt) content.push(...m.message.content);
    expect(content.filter((c) => c.type === "image")).toHaveLength(3);
    expect(content.at(-1)!.text).toBe("Character: Ada\nVictorian mathematician");
    expect(params!.options.systemPrompt).toContain("The first image is the drawing");
    // Referanssız: yalnız çizim.
    await expect(figureDesigner({ name: "Ada", description: "x", drawing: IMG }, { queryFn })).rejects.toThrow(AgentError);
    const only: unknown[] = [];
    for await (const m of params!.prompt) only.push(...m.message.content.filter((c) => c.type === "image"));
    expect(only).toHaveLength(1);
  });

  it("çıktı şeması figür seçeneklerini zorunlu ister (yüzey hariç: paketten gelir)", () => {
    const schema = toOutputSchema(FigureOut) as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required.sort()).toEqual(["beard", "bottom", "build", "glasses", "hair", "shoes", "skin", "top"]);
    expect(schema.properties).not.toHaveProperty("finish");
    expect(FigureOut.safeParse({ skin: "#ffffff" }).success).toBe(false);
  });
});
