import { z } from "zod";

export const Typography = z.object({ pair: z.enum(["clear", "editorial", "warm", "poster", "technical"]) });
export type Typography = z.infer<typeof Typography>;
export interface Typeface { id: string; family: string; weight: 600 | 700; generic: "sans-serif" | "serif" | "monospace" }
export interface TypographyPair { heading: Typeface; body: Typeface }
const sans: Typeface = { id: "ibm-plex-sans", family: "IBM Plex Sans", weight: 600, generic: "sans-serif" };
export const TYPOGRAPHY_PAIRS: Readonly<Record<Typography["pair"], TypographyPair>> = {
  clear: { heading: { ...sans, weight: 700 }, body: sans },
  editorial: { heading: { id: "source-serif-4", family: "Source Serif 4", weight: 700, generic: "serif" }, body: sans },
  warm: { heading: { id: "bitter", family: "Bitter", weight: 700, generic: "serif" }, body: { id: "nunito-sans", family: "Nunito Sans", weight: 600, generic: "sans-serif" } },
  poster: { heading: { id: "oswald", family: "Oswald", weight: 700, generic: "sans-serif" }, body: sans },
  technical: { heading: { id: "ibm-plex-mono", family: "IBM Plex Mono", weight: 700, generic: "monospace" }, body: sans },
};

export const TURKISH_FONT_SAMPLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ÇĞİÖŞÜçğıöşü";
export const fontAlias = (face: Typeface, subset: "latin" | "latin-ext") => `YS-${face.id}-${face.weight}-${subset}`;
export const fontAsset = (face: Typeface, subset: "latin" | "latin-ext") => `typography/${face.id}-${subset}-${face.weight}-normal.woff`;
export const fontFamily = (face: Typeface) => `'${fontAlias(face, "latin-ext")}', '${fontAlias(face, "latin")}', ${face.generic}`;

/** Deterministic choices from the existing style identity; no model, network or random selection. */
export function typographyForStyle(style: { pack?: string; craftPreset?: string } | undefined, lang: string): Typography | undefined {
  if (!/^(?:tr|en)(?:-|$)/i.test(lang)) return undefined;
  const pack = style?.craftPreset ?? style?.pack ?? "";
  if (["isometric", "blueprint", "chalkboard", "ascii-crt", "pixel-art", "space-sci-fi", "synthwave"].includes(pack)) return { pair: "technical" };
  if (["paper-poster", "risograph", "comic-pop", "constructivist", "art-deco", "mid-century"].includes(pack)) return { pair: "poster" };
  if (["paper-cutout", "storybook", "kids-cartoon", "watercolor", "claymation", "felt"].includes(pack)) return { pair: "warm" };
  if (["warm-documentary", "vintage-engraving", "ottoman-miniature", "manuscript", "sepia-archive", "nature-doc", "noir", "gothic", "ukiyo-e"].includes(pack)) return { pair: "editorial" };
  return { pair: "clear" };
}
