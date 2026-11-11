import { StyleRecipe } from "../src/custom-style.ts";
export const RECIPE = StyleRecipe.parse({
 name: "Warm paper", artStyle: "matte paper illustration", promptPrefix: "matte cut paper, warm spot colours,",
 negativeRules: ["text inside drawings", "glossy plastic"], palette: ["#111410", "#F3F0E6", "#D5FA73"],
 lighting: "soft top light", lensLanguage: "frontal graphic framing", designNotes: "Separate matte layers and generous negative space.",
 lineStyle: "flat", texture: "paper", motionRules: "Assemble objects with short horizontal slide_in; hold the result.", typographyRules: "Bold short headings, steady after arrival.",
 reviewRules: ["Recognizable matte layers", "Readable short headings"], craftPreset: "paper-cutout",
});
