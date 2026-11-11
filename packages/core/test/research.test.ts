import { describe, expect, it } from "vitest";
import { EvidenceUrl, ResearchMutation, ResearchSourceInput, ScriptClaim } from "../src/research.ts";

describe("research input contracts", () => {
  it.each(["not a URL", "http://", "", "javascript:alert(1)", "data:text/plain,fact", "file:///private", "https://user:password@example.org/"])("rejects invalid, executable or credential-bearing source URLs: %s", (url) => {
    expect(EvidenceUrl.safeParse(url).success).toBe(false);
  });
  it("accepts bounded source metadata and strips client-supplied review/retrieval claims", () => {
    const source = ResearchSourceInput.parse({ title: "  Lab note  ", url: "https://example.org/lab", excerpt: "The rig completed 48 cycles.", origin: "web-verified", recordedAt: "forged" });
    expect(source.title).toBe("Lab note"); expect(source).not.toHaveProperty("origin");
    expect(ResearchSourceInput.safeParse({ ...source, excerpt: "x".repeat(3001) }).success).toBe(false);
    expect(ResearchMutation.safeParse({ type: "verify-all", approved: true }).success).toBe(false);
    expect(ScriptClaim.parse({ quote: "48 cycles", kind: "fact", sourceIds: [], review: "supported" })).not.toHaveProperty("review");
  });
});
