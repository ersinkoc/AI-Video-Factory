import type { EpisodeState } from "./state.ts";

/** Credits describe the image sources in the successful export, not pending edits or reference-only research. */
export function archiveCredits(state: EpisodeState): string[] {
  const used = state.render?.archiveSources ?? [];
  const unique = [...new Map(used.map((u) => [u.source.id, u.source])).values()];
  return unique.length ? [state.input.lang.startsWith("tr") ? "Görsel kaynakları:" : "Image sources:", ...unique.map((s) => `${s.title}${s.creator ? ` — ${s.creator}` : ""}${s.date ? ` (${s.date})` : ""} — ${s.sourceUrl}`)] : [];
}
