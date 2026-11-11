import { describe, expect, it } from "vitest";
import { paperPosterRecipe, customStyleBlock, SavedStyle, StyleRecipe } from "../src/custom-style.ts";
import { RECIPE } from "./style-recipe-fixture.ts";
describe("custom style recipe", () => {
 it("accepts bounded design data and rejects code-like unsupported runtime names", () => {
   expect(StyleRecipe.parse(RECIPE)).toEqual(RECIPE);
   expect(StyleRecipe.safeParse({ ...RECIPE, craftPreset: "arbitrary-shader" }).success).toBe(false);
   expect(StyleRecipe.safeParse({ ...RECIPE, palette: ["red"] }).success).toBe(false);
   expect(StyleRecipe.safeParse({ ...RECIPE, name: "" }).success).toBe(false);
   expect(SavedStyle.safeParse({ id: "../x", createdAt: "", recipe: RECIPE }).success).toBe(false);
 });
 it("keeps direction and still-image evidence boundaries separate", () => {
   expect(customStyleBlock(undefined)).toBe("");
   expect(customStyleBlock({})).toBe("");
   expect(customStyleBlock(undefined, true)).toBe("");
   expect(customStyleBlock({ reviewRules: [] }, true)).toBe("");
   expect(customStyleBlock({ typographyRules: "Keep titles steady" })).toContain("Keep titles steady");
   expect(customStyleBlock(RECIPE)).toContain("supported output fields");
   expect(customStyleBlock(RECIPE, true)).toContain("do not infer motion from one still");
 });
});

it("creates independent editable Paper Poster recipes with the supplied inks and no cutout renderer", () => {
 const first = paperPosterRecipe();
 expect(StyleRecipe.parse(first)).toEqual(first);
 expect(first.palette).toEqual(["#F3F0E6", "#111410", "#68725F", "#D5FA73"]);
 expect(first.craftPreset).toBe("paper-poster");
 first.palette[0] = "#FFFFFF"; first.reviewRules.length = 0;
 const next = paperPosterRecipe();
 expect(next.palette[0]).toBe("#F3F0E6");
 expect(next.reviewRules.length).toBeGreaterThan(0);
});
