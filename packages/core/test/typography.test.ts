import { describe, expect, it } from "vitest";
import { fontAlias, fontFamily, Timeline, TYPOGRAPHY_PAIRS, typographyForStyle } from "../src/index.ts";

describe("episode typography", () => {
  it.each([["flat-explainer", "clear"], ["warm-documentary", "editorial"], ["paper-cutout", "warm"], ["paper-poster", "poster"], ["blueprint", "technical"]])("selects %s deterministically", (pack, pair) => {
    expect(typographyForStyle({ pack }, "tr")).toEqual({ pair });
    expect(typographyForStyle({ pack }, "en-US")).toEqual({ pair });
  });
  it("uses a custom style's explicit craft identity and preserves unsupported scripts", () => {
    expect(typographyForStyle({ pack: "custom", craftPreset: "paper-poster" }, "tr")).toEqual({ pair: "poster" });
    expect(typographyForStyle({ pack: "blueprint" }, "ja")).toBeUndefined();
  });
  it("retains absent typography on old timelines and rejects unsupported pairs", () => {
    const old = { episodeId: "old", lang: "tr", durationInFrames: 90, visuals: [], audio: [] };
    expect(Timeline.parse(old).typography).toBeUndefined();
    expect(() => Timeline.parse({ ...old, typography: { pair: "external-font" } })).toThrow();
  });
  it("uses a matching, local extended-Latin and Latin fallback for each role", () => {
    const face = TYPOGRAPHY_PAIRS.editorial.heading;
    expect(fontFamily(face)).toContain(fontAlias(face, "latin-ext"));
    expect(fontFamily(face)).toContain(fontAlias(face, "latin"));
    expect(fontFamily(face)).not.toContain("Segoe");
  });
});
