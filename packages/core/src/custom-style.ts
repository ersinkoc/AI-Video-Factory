import { z } from "zod";
import { LineStyle } from "./vector.ts";
import { Texture } from "./texture.ts";
import { ImageProfile } from "./image-profile.ts";

/** Yeniden kullanılabilen özel stil: çalıştırılabilir kod değil, sınırlı tasarım verisi. */
export const StyleRecipe = z.object({
  name: z.string().trim().min(1).max(80),
  artStyle: z.string().trim().min(1).max(300),
  promptPrefix: z.string().trim().min(1).max(1500),
  negativeRules: z.array(z.string().trim().min(1).max(300)).max(12),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3).max(8),
  lighting: z.string().trim().min(1).max(500),
  lensLanguage: z.string().trim().min(1).max(500),
  designNotes: z.string().trim().min(1).max(3000),
  lineStyle: LineStyle,
  texture: Texture,
  motionRules: z.string().trim().min(1).max(1600),
  typographyRules: z.string().trim().min(1).max(800),
  reviewRules: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  craftPreset: z.enum(["paper-cutout", "risograph", "isometric", "paper-poster"]).optional(),
});
export type StyleRecipe = z.infer<typeof StyleRecipe>;
export const CUSTOM_STYLE_ID = /^[a-f0-9]{32}$/;
export const STYLE_REFERENCE_KEY = /^library\/style-references\/[a-f0-9]{64}\.jpg$/;
export const SavedStyle = z.object({
  id: z.string().regex(CUSTOM_STYLE_ID),
  createdAt: z.string(),
  referenceKey: z.string().regex(STYLE_REFERENCE_KEY).optional(),
  referenceProfile: ImageProfile.optional(),
  recipe: StyleRecipe,
});
export type SavedStyle = z.infer<typeof SavedStyle>;

/** Ayrı veriler olarak sınırlandırılır: referanstaki yazılar uygulama talimatı sayılmaz. */
export function customStyleBlock(style: { motionRules?: string; typographyRules?: string; reviewRules?: string[] } | undefined, review = false): string {
  if (review) return style?.reviewRules?.length ? "\nCustom style visible checks (do not infer motion from one still): " + JSON.stringify(style.reviewRules) : "";
  return style?.motionRules || style?.typographyRules
    ? "\nCustom style direction (use supported output fields only): " + JSON.stringify({ motion: style.motionRules, typography: style.typographyRules })
    : "";
}

/** Kullanıcının Kâğıt Poster brief'inden düzenlenebilir başlangıç; model ve görsel bağımlılığı yok. */
export function paperPosterRecipe(): StyleRecipe {
  return StyleRecipe.parse({
    name: "Paper Poster",
    artStyle: "Flat ink poster illustration on warm cream paper, one large narrative illustration per idea",
    promptPrefix: "Flat printed poster illustration on cream #F3F0E6 paper; dark #111410 and olive #68725F ink, lime #D5FA73 only as a small accent or inside dark areas. One large clear hero illustration, generous negative space, matte flat fills, extremely sparse stipple, no lettering.",
    negativeRules: ["Readable text, letters, captions or logos inside illustration assets", "Glossy 3D, gradients, folded paper, cutout layer shadows", "Busy dot patterns or animated grain", "Lime as a full light-background field", "Multiple panels, slideshow cards or competing hero illustrations"],
    palette: ["#F3F0E6", "#111410", "#68725F", "#D5FA73"],
    lighting: "Even flat printed ink; no photographic lighting or dimensional cast shadows",
    lensLanguage: "Frontal graphic composition with motivated camera reveals; hold the hero clearly",
    designNotes: "Cream paper dominates. Dark ink carries the main silhouette, olive supports it, and lime marks only the key detail or sits within dark ink. Use one large illustration per idea, drawn with the same inks throughout. Leave quiet space for separate text layers. Fine subtle paper grain stays fixed, with almost no stipple. Do not borrow the composition or subject of an existing poster.",
    lineStyle: "flat", texture: "paper", craftPreset: "paper-poster",
    motionRules: "Give each shot a subject, narrated action, reveal and readable hold. Let a recognizable object or visual relationship connect consecutive ideas. Prefer direct cuts or motivated camera moves for most scene changes. Reserve special transitions for a few major story moments, only through supported runtime fields. Keep movement calm enough to follow narration; avoid idle orbit, float and pulse decoration. Never describe arbitrary folds or shape morphs as implemented. Keep paper grain stationary. Do not repeat a slide-in for every scene.",
    typographyRules: "Short bold narrow headings in the episode language, using available fonts. Text is a separate layer, fixed after its entrance and long enough to read. Do not put narration sentences on screen or generate letters inside drawings. Prioritize contrast; lime type belongs inside a dark field. Respect the selected runtime's text capabilities.",
    reviewRules: ["One dominant readable illustration per idea", "Cream, dark and olive ink with lime only as an accent or inside dark areas", "Flat matte printing without glossy depth or cutout shadows", "Subtle paper texture and almost no stipple", "Separate short legible headings; no narration paragraphs or lettering in assets", "Use a sequence of frames to assess holds, continuity and stationary grain; a still proves only visible appearance"],
  });
}
