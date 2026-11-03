import { describe, expect, it } from "vitest";
import { AssetPlan, Likeness } from "@ys/core";
import { AgentError, figureDesigner, gateDescription, likenessAnalyst, LikenessOut, models, toOutputSchema, vectorDesigner, type QueryFn } from "../src/index.ts";

const IMG = { data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };
const style = { artStyle: "flat", palette: ["#112233"], lighting: "soft", designNotes: "" } as never;

/** İsteği yakalar (sonuç hatayla biter): metin, görsel sayısı, talimat ve model. */
async function capture(run: (d: { queryFn: QueryFn }) => Promise<unknown>) {
  let params: { prompt: string | AsyncIterable<{ message: { content: { type: string; text?: string }[] } }>; options: Record<string, unknown> } | undefined;
  const queryFn = ((p: typeof params) => {
    params = p;
    return (async function* () {
      yield { type: "result", subtype: "error_max_turns", duration_ms: 1, total_cost_usd: 0 };
    })();
  }) as unknown as QueryFn;
  await expect(run({ queryFn })).rejects.toThrow(AgentError);
  const content: { type: string; text?: string }[] = [];
  if (typeof params!.prompt === "string") content.push({ type: "text", text: params!.prompt });
  else for await (const m of params!.prompt) content.push(...m.message.content);
  return {
    text: content.filter((c) => c.type === "text").map((c) => c.text).join(""),
    images: content.filter((c) => c.type === "image").length,
    system: params!.options.systemPrompt as string,
    model: params!.options.model,
  };
}

const LIKENESS = Likeness.parse({
  status: "ok",
  rejection: null,
  observation: {
    image: { medium: "bw_photo", view: "frontal", quality: "medium" },
    apparentAge: { value: 60, confidence: 0.7 },
    build: { weight: { value: null, confidence: 0 }, muscle: { value: null, confidence: 0 }, shoulders: { value: null, confidence: 0 } },
    head: {
      shape: { value: "oval", confidence: 0.8 },
      faceLength: { value: null, confidence: 0 },
      faceWidth: { value: null, confidence: 0 },
      foreheadHeight: { value: 0.85, confidence: 0.8 },
      jawWidth: { value: null, confidence: 0 },
      jawDefinition: { value: null, confidence: 0 },
      chin: { value: null, confidence: 0 },
      chinProjection: { value: null, confidence: 0 },
    },
    eyes: { size: { value: null, confidence: 0 }, spacing: { value: null, confidence: 0 }, tilt: { value: null, confidence: 0 }, depth: { value: null, confidence: 0 }, shape: { value: null, confidence: 0 }, color: { value: null, confidence: 0 } },
    brows: { thickness: { value: null, confidence: 0 }, arch: { value: null, confidence: 0 }, shape: { value: null, confidence: 0 }, gap: { value: null, confidence: 0 }, heightAboveEyes: { value: null, confidence: 0 }, color: { hex: null, confidence: 0 } },
    nose: { size: { value: null, confidence: 0 }, length: { value: null, confidence: 0 }, bridgeWidth: { value: null, confidence: 0 }, tipWidth: { value: null, confidence: 0 }, tip: { value: null, confidence: 0 }, profile: { value: null, confidence: 0 } },
    mouth: { width: { value: null, confidence: 0 }, upperLip: { value: null, confidence: 0 }, lowerLip: { value: null, confidence: 0 } },
    ears: { size: { value: null, confidence: 0 }, protrusion: { value: null, confidence: 0 } },
    skin: { tone: { hex: null, confidence: 0 }, wrinkles: { value: null, confidence: 0 } },
    hair: {
      length: { value: "short", confidence: 0.9 },
      texture: { value: "wavy", confidence: 0.8 },
      volume: { value: null, confidence: 0 },
      baldness: { value: null, confidence: 0 },
      hairline: { value: "receding", confidence: 0.85 },
      part: { value: null, confidence: 0 },
      style: [],
      color: { hex: null, confidence: 0 },
      gray: { value: null, confidence: 0 },
    },
    facialHair: { beard: { value: "full", confidence: 0.9 }, moustache: { value: null, confidence: 0 }, color: { hex: null, confidence: 0 } },
    accessories: { glasses: { value: "none", confidence: 0.9 }, glassesShape: { value: null, confidence: 0 }, glassesFrame: { value: null, confidence: 0 }, headwear: { value: null, confidence: 0 } },
    distinctive: ["high bare forehead", "full beard"],
    notes: ["black-and-white photo: colours unknown"],
  },
});

describe("benzerlik ajanı", () => {
  it("fotoğrafları gösterir, adı vermez; kimlik, hassas çıkarım ve reşit olmayan kuralları; siyah-beyazda renk yok", async () => {
    const c = await capture((d) => likenessAnalyst({ references: [IMG, IMG], description: "bearded Victorian engineer in a frock coat" }, d));
    expect(c.images).toBe(2);
    expect(c.text).toBe(
      "Subject description (use it only to pick the subject when several people are visible): bearded Victorian engineer in a frock coat\nAnalyse the 2 attached image(s) and fill in the observation.",
    );
    expect(c.system).toContain("Never identify the person");
    expect(c.system).toContain("Never infer or output ethnicity");
    expect(c.system).toContain('rejection "possible_minor"');
    expect(c.system).toContain("A black-and-white or sepia photo has no hue");
    expect(c.model).toBe(models().fast);
  });

  it("çıktı şeması: durum, ret nedeni ve gözlem zorunlu; gözlem reddedilince boş", () => {
    const schema = toOutputSchema(LikenessOut) as { required: string[] };
    expect(schema.required.sort()).toEqual(["observation", "rejection", "status"]);
    expect(LikenessOut.parse(LIKENESS).observation?.distinctive).toEqual(["high bare forehead", "full beard"]);
  });

  it("tasarımcı benzerlik kaydını plandan sonra alır; reddedilen kayıt hiçbir şey eklemez", async () => {
    const plan = AssetPlan.parse({ subject: "an engineer", moved: [], cues: ["beard"] });
    const a = await capture((d) => vectorDesigner({ kind: "character", name: "Brunel", description: "engineer", plan, likeness: LIKENESS }, style, d));
    expect(a.text).toMatch(/Drawing plan[\s\S]*\n\nLikeness sheet \(measured from the reference photos/);
    expect(a.text).toContain("- Hair: short, wavy, receding hairline");
    expect(a.text).toContain("- Facial hair: full beard");
    expect(a.text).not.toContain("- Glasses");
    const rejected = await capture((d) =>
      vectorDesigner({ kind: "character", name: "Brunel", description: "engineer", likeness: { status: "rejected", rejection: "possible_minor", observation: null } }, style, d),
    );
    expect(rejected.text).toBe("Character: Brunel\nengineer");
  });

  it("kapı benzerlik ipuçlarını arar (planla ve plansız)", () => {
    const plan = AssetPlan.parse({ subject: "an engineer", moved: [], cues: ["beard"] });
    const cues = "Likeness measured from the reference photos (the drawing should show these, simplified): high bare forehead; full beard; hair: short, wavy, receding hairline; facial hair: full beard";
    expect(gateDescription("engineer", plan, LIKENESS)).toBe(`an engineer\nMust show: beard\n${cues}\nOriginal request (the drawing must still be this kind of thing): engineer`);
    expect(gateDescription("engineer", undefined, LIKENESS)).toBe(`engineer\n${cues}`);
  });

  it("3D figür ajanı ölçülen benzerliği çizimin belirsiz kaldığı yer için alır", async () => {
    const c = await capture((d) => figureDesigner({ name: "Brunel", description: "engineer", drawing: IMG, likeness: "Likeness sheet: x" }, d));
    expect(c.text).toBe("Character: Brunel\nengineer\n\nLikeness sheet: x\nUse it only where the drawing is unclear; the drawing wins.");
  });
});
