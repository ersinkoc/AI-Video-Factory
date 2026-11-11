import { z } from "zod";

export const ArchiveCandidate = z.object({
  id: z.string().regex(/^(aic|cleveland|nasa)-[a-f0-9]{24}$/),
  provider: z.enum(["aic", "cleveland", "nasa"]),
  title: z.string().min(1).max(400), creator: z.string().max(400), date: z.string().max(120),
  sourceUrl: z.string().url(), imageUrl: z.string().url(),
  sourceId: z.string().min(1).max(200),
});
export type ArchiveCandidate = z.infer<typeof ArchiveCandidate>;
export interface ArchiveImage {
  key: string; mimeType: "image/jpeg"; source: ArchiveCandidate;
  width: number; height: number; originalSha256: string; downloadedAt: string;
}
export interface ArchiveSearch {
  query: string; items: ArchiveCandidate[];
  errors: { provider: ArchiveCandidate["provider"]; message: string }[];
  at: string;
}
