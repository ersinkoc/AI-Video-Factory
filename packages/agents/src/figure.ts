import { FigureSpec } from "@ys/core";
import { z } from "zod";
import { models, runStructured, type AgentDeps, type AgentImage, type AgentResult } from "./runner.ts";

/**
 * 3D figür tarifi: kalite kapısından geçmiş SVG çizim (ve varsa gerçek kişinin fotoğrafları) koddan kurulan 3D
 * figürün parametrelerine çevrilir. Model geometri yazmaz; yalnız sabit seçeneklerden seçer ve renkleri çizimden alır,
 * böylece figür onaylı çizimle aynı kişi olur. Yüzey (mat, kil…) stil paketinden gelir.
 */
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const { hair, top, bottom } = FigureSpec.shape;

export const FigureOut = z.object({
  skin: Hex.describe("Skin colour as drawn (#rrggbb)"),
  hair: z.object({
    style: hair.shape.style.describe("Nearest hair style; bald if no hair, buzz for a very short crop"),
    color: Hex.describe("Hair colour as drawn (#rrggbb)"),
  }),
  beard: FigureSpec.shape.beard.unwrap().describe("Facial hair: stubble = a light shadow, short = a trimmed beard with moustache, full = a long thick beard"),
  glasses: z.boolean().describe("true if the character wears glasses"),
  top: z.object({
    style: top.shape.style.describe("The outer garment on the upper body; dress for a one-piece dress"),
    color: Hex.describe("Colour of that garment (#rrggbb)"),
    inner: Hex.optional().describe("Colour of the shirt under an open vest or jacket, or of a hood lining; omit otherwise"),
  }),
  bottom: z.object({
    style: bottom.shape.style.describe("Trousers, shorts or skirt (for a dress, the dress colour as a skirt)"),
    color: Hex.describe("Colour of the bottom garment (#rrggbb)"),
  }),
  shoes: Hex.describe("Shoe colour (#rrggbb)"),
  build: FigureSpec.shape.build.unwrap().describe("Body build as drawn"),
});
export type FigureOut = z.infer<typeof FigureOut>;

export interface FigureInput {
  name: string;
  description: string;
  /** Onaylı SVG çizimin PNG'si. */
  drawing: AgentImage;
  /** Gerçek kişinin referans fotoğrafları (en çok iki); çizimin belirsiz kaldığı yerde. */
  references?: AgentImage[];
}

export function figureDesigner(input: FigureInput, deps?: AgentDeps): Promise<AgentResult<FigureOut>> {
  const refs = (input.references ?? []).slice(0, 2);
  return runStructured(
    {
      name: "figure-designer",
      model: models().cheap,
      effort: "low",
      schema: FigureOut,
      system:
        "You convert an approved flat vector drawing of a character into the parameters of a code-built, stylised 3D toy figure (soft rounded shapes, a big head). Copy what the drawing shows: skin tone, hair style and colour, facial hair, glasses, the outer top garment and its colour, the shirt or lining under it, the bottom garment, the shoe colour and the body build. Pick the nearest option for each and take the colours from the drawing as #rrggbb. The first image is the drawing; any further images are real photos of the same person, use them only where the drawing is unclear.",
      prompt: `Character: ${input.name}\n${input.description}`,
      images: [input.drawing, ...refs],
    },
    deps,
  );
}
