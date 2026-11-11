import { describe, expect, it } from "vitest";
import { STYLE_CRAFTS, styleCraftBlock, styleCraftOf } from "../src/style-craft.ts";

describe("style craft policies", () => {
  it("only enables the registered material presets, including safe unknown-id handling", () => {
    expect(Object.keys(STYLE_CRAFTS)).toEqual(["paper-cutout", "risograph", "isometric", "paper-poster"]);
    for (const key of [undefined, "unknown", "toString", "__proto__"]) {
      expect(styleCraftOf(key)).toBeUndefined();
      expect(styleCraftBlock(key)).toBe("");
      expect(styleCraftBlock(key, true)).toBe("");
    }
  });
  it.each(["paper-cutout", "risograph", "isometric", "paper-poster"])("%s supplies executable direction and evidence-limited visible checks", (id) => {
    expect(styleCraftBlock(id)).toContain(styleCraftOf(id)!.motion);
    expect(styleCraftBlock(id)).toContain("Use only supported schema values");
    expect(styleCraftBlock(id, true)).toContain(styleCraftOf(id)!.checks[0]);
    expect(styleCraftBlock(id, true)).toContain("A still does not prove motion");
  });
});
