import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const EvidenceUrl = z.string().max(2048).url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Use an HTTP(S) source URL without credentials");
export const ClaimKind = z.enum(["fact", "estimate", "quotation", "interpretation", "reconstruction"]);
export const EvidenceRelation = z.enum(["supports", "contradicts", "context"]);
export const ResearchSourceInput = z.object({
  id: id.optional(), title: z.string().trim().min(1).max(300), url: EvidenceUrl,
  publisher: z.string().trim().max(200).default(""), date: z.string().trim().max(80).default(""),
  excerpt: z.string().trim().max(3000).default(""), locator: z.string().trim().max(300).default(""),
});
export const ResearchSource = ResearchSourceInput.extend({ id, recordedAt: z.string(), origin: z.literal("editor") });
export type ResearchSource = z.infer<typeof ResearchSource>;
export const ClaimLink = z.object({ sourceId: id, relation: EvidenceRelation });
export const ResearchClaimInput = z.object({
  id: id.optional(), sceneId: z.string().min(1).max(160), quote: z.string().trim().min(1).max(1500),
  statement: z.string().trim().min(1).max(1500), kind: ClaimKind,
  links: z.array(ClaimLink).max(12).default([]),
});
export const ClaimDecision = z.enum(["supported", "disputed", "needs-source", "excluded"]);
export const ResearchClaim = ResearchClaimInput.extend({
  id, narrationHash: z.string(), updatedAt: z.string(), origin: z.enum(["editor", "writer"]),
  review: z.object({ status: ClaimDecision, fingerprint: z.string(), at: z.string() }).optional(),
});
export type ResearchClaim = z.infer<typeof ResearchClaim>;
export const ResearchBook = z.object({ version: z.literal(1), revision: z.number().int().nonnegative(), updatedAt: z.string(), sources: z.array(ResearchSource).max(80), claims: z.array(ResearchClaim).max(300) });
export type ResearchBook = z.infer<typeof ResearchBook>;

// Senaryo ajanı yalnız aday iddialar üretir; karar ya da yeni kaynak uyduramaz.
export const ScriptClaim = z.object({
  quote: z.string().trim().min(1).max(1500).describe("Exact contiguous quote from this scene's narration"),
  kind: ClaimKind,
  sourceIds: z.array(id).max(8).describe("Only source ids from the supplied research context; empty when unsupported"),
});
export type ResearchContext = {
  sources: Pick<ResearchSource, "id" | "title" | "url" | "excerpt" | "locator">[];
  totalSources: number; omittedSources: number;
  claims: Pick<ResearchClaim, "statement" | "kind" | "links">[];
  omittedClaims: number;
};

export const ResearchMutation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("put-source"), source: ResearchSourceInput }),
  z.object({ type: z.literal("put-claim"), claim: ResearchClaimInput }),
  z.object({ type: z.literal("review-claim"), claimId: id, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), status: ClaimDecision }),
]);
export type ResearchMutation = z.infer<typeof ResearchMutation>;
