import { createHash, randomUUID } from "node:crypto";
import { LocalizedError, msg, ResearchBook, ResearchMutation, type ResearchClaim, type ResearchContext } from "@ys/core";
import { getJson, putJson, type AssetStore } from "@ys/storage";
import type { EpisodeState } from "./state.ts";
import { acquireLock } from "./lock.ts";

export const researchKey = (id: string) => `episodes/${id}/research/book.json`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const narrationHash = (text: string) => hash(text);
export function emptyResearch(): ResearchBook { return { version: 1, revision: 0, updatedAt: "", sources: [], claims: [] }; }
export async function loadResearch(store: AssetStore, id: string): Promise<ResearchBook> {
  const value = await getJson<unknown>(store, researchKey(id));
  return value === null || value === undefined ? emptyResearch() : ResearchBook.parse(value);
}
export function claimFingerprint(book: ResearchBook, claim: ResearchClaim): string {
  const { review: _review, updatedAt: _at, ...content } = claim;
  return hash([content, claim.links.map((link) => book.sources.find((s) => s.id === link.sourceId) ?? null)]);
}
export interface ClaimView extends ResearchClaim {
  fingerprint: string; status: "unreviewed" | "stale" | "supported" | "disputed" | "needs-source" | "excluded";
  anchorCurrent: boolean; dependentShots: string[];
}
export function researchView(book: ResearchBook, state: Pick<EpisodeState, "script" | "shots">) {
  const claims: ClaimView[] = book.claims.map((claim) => {
    const scene = state.script?.scenes.find((s) => s.id === claim.sceneId);
    const anchorCurrent = Boolean(scene && narrationHash(scene.narration) === claim.narrationHash && scene.narration.includes(claim.quote));
    const fingerprint = claimFingerprint(book, claim);
    const status = !anchorCurrent || claim.review && claim.review.fingerprint !== fingerprint ? "stale" : claim.review?.status ?? "unreviewed";
    return { ...claim, fingerprint, anchorCurrent, status, dependentShots: (state.shots ?? []).filter((s) => s.sceneId === claim.sceneId).map((s) => s.id) };
  });
  return { ...book, claims, unresolved: claims.filter((c) => !["supported", "excluded"].includes(c.status)).length };
}

/** Hem HTTP kararları hem yazar adayları geçmişi korur; çağıran üretici kilidini tutar. */
async function saveResearch(store: AssetStore, id: string, book: ResearchBook): Promise<void> {
  if (!ResearchBook.safeParse(book).success) throw new LocalizedError(msg("err.research.invalid"));
  await putJson(store, `episodes/${id}/research/history/${hash(book)}.json`, book);
  await putJson(store, researchKey(id), book);
}

export async function mutateResearch(opts: { id: string; store: AssetStore; load: () => Promise<EpisodeState>; expectedRevision: number; mutation: unknown }): Promise<void> {
  const parsed = ResearchMutation.safeParse(opts.mutation);
  if (!parsed.success) throw new LocalizedError(msg("err.research.invalid"));
  const release = await acquireLock(opts.store, opts.id);
  try {
    const state = await opts.load(), book = await loadResearch(opts.store, opts.id), mutation = parsed.data;
    if (opts.expectedRevision !== book.revision) throw new LocalizedError(msg("err.research.changed"));
    const at = new Date().toISOString();
    if (mutation.type === "put-source") {
      const existing = mutation.source.id ? book.sources.find((s) => s.id === mutation.source.id) : undefined;
      if (mutation.source.id && !existing) throw new LocalizedError(msg("err.research.missing"));
      const source = { ...mutation.source, id: existing ? existing.id : randomUUID(), recordedAt: at, origin: "editor" as const };
      if (existing) book.sources[book.sources.indexOf(existing)] = source; else book.sources.push(source);
    } else if (mutation.type === "put-claim") {
      const input = mutation.claim, scene = state.script?.scenes.find((s) => s.id === input.sceneId);
      if (!scene || !scene.narration.includes(input.quote)) throw new LocalizedError(msg("err.research.anchor"));
      if (input.links.some((l) => !book.sources.some((s) => s.id === l.sourceId)) || new Set(input.links.map((l) => l.sourceId)).size !== input.links.length) throw new LocalizedError(msg("err.research.missing"));
      const existing = input.id ? book.claims.find((c) => c.id === input.id) : undefined;
      if (input.id && !existing) throw new LocalizedError(msg("err.research.missing"));
      const claim: ResearchClaim = { ...input, id: existing ? existing.id : randomUUID(), narrationHash: narrationHash(scene.narration), updatedAt: at, origin: "editor", ...(existing?.review ? { review: existing.review } : {}) };
      if (existing) book.claims[book.claims.indexOf(existing)] = claim; else book.claims.push(claim);
    } else {
      const claim = book.claims.find((c) => c.id === mutation.claimId);
      const current = researchView(book, state).claims.find((c) => c.id === mutation.claimId);
      if (!claim || !current) throw new LocalizedError(msg("err.research.missing"));
      if (current.fingerprint !== mutation.fingerprint || !current.anchorCurrent) throw new LocalizedError(msg("err.research.changed"));
      if (mutation.status === "excluded" && !["interpretation", "reconstruction"].includes(claim.kind)) throw new LocalizedError(msg("err.research.exemption"));
      if (mutation.status === "supported" && (!claim.links.some((l) => l.relation === "supports" && book.sources.find((s) => s.id === l.sourceId)?.excerpt.trim()) || claim.links.some((l) => l.relation === "contradicts"))) throw new LocalizedError(msg("err.research.support"));
      claim.review = { status: mutation.status, fingerprint: current.fingerprint, at };
    }
    book.revision++; book.updatedAt = at;
    await saveResearch(opts.store, opts.id, book);
  } finally { await release(); }
}

/** Bütçeli alıntı bağlamı; web okunmuş ya da doğruluk kanıtlanmış sayılmaz. */
export function researchContext(book: ResearchBook): ResearchContext | undefined {
  const usable = book.sources.filter((s) => s.excerpt.trim());
  if (!usable.length) return undefined;
  const sources = usable.slice(0, 12).map(({ id, title, url, excerpt, locator }) => ({ id, title, url, excerpt: excerpt.slice(0, 1200), locator }));
  const claims = book.claims.slice(0, 30).map(({ statement, kind, links }) => ({ statement, kind, links }));
  return { sources, totalSources: book.sources.length, omittedSources: book.sources.length - sources.length, claims, omittedClaims: book.claims.length - claims.length };
}

/** Yazarın kaynak kimlikleri yeni kaynak oluşturmaz; yalnız son metindeki tam alıntılar aday olur. */
export async function collectWriterClaims(store: AssetStore, state: EpisodeState): Promise<number> {
  const book = await loadResearch(store, state.id), before = book.claims.length, at = new Date().toISOString();
  for (const scene of state.script?.scenes ?? []) for (const candidate of scene.claims ?? []) {
    if (!scene.narration.includes(candidate.quote)) continue;
    const links = [...new Set(candidate.sourceIds)].filter((id) => book.sources.some((s) => s.id === id)).map((sourceId) => ({ sourceId, relation: "supports" as const }));
    const id = `writer-${hash([scene.id, candidate.quote, candidate.kind, links]).slice(0, 32)}`;
    if (book.claims.some((c) => c.id === id) || book.claims.length >= 300) continue;
    book.claims.push({ id, sceneId: scene.id, quote: candidate.quote, statement: candidate.quote, kind: candidate.kind, links, narrationHash: narrationHash(scene.narration), origin: "writer", updatedAt: at });
  }
  const added = book.claims.length - before;
  if (added) { book.revision++; book.updatedAt = at; await saveResearch(store, state.id, book); }
  return added;
}

export interface ResearchSnapshotSummary { reportKey: string; revision: number; fingerprint: string; claims: number; sources: number; unresolved: number; exportId?: string }
export async function freezeResearch(store: AssetStore, state: EpisodeState): Promise<ResearchSnapshotSummary | undefined> {
  const book = await loadResearch(store, state.id);
  if (!book.sources.length && !book.claims.length) return undefined;
  const view = researchView(book, state), fingerprint = hash(view), reportKey = `episodes/${state.id}/research/exports/${randomUUID()}.json`;
  await putJson(store, reportKey, { ...view, fingerprint, episodeId: state.id, renderedAt: state.render!.at, exportId: state.render!.exportId });
  return { reportKey, revision: book.revision, fingerprint, claims: view.claims.length, sources: book.sources.length, unresolved: view.unresolved, exportId: state.render!.exportId };
}
export async function researchCredits(store: AssetStore, state: EpisodeState): Promise<string[]> {
  const summary = state.render?.research;
  if (!summary) return [];
  const view = await readResearchExport(store, state);
  const used = new Set(view.claims.filter((c) => c.status === "supported").flatMap((c) => c.links.filter((l) => l.relation === "supports").map((l) => l.sourceId)));
  const lines = view.sources.filter((s) => used.has(s.id)).map((s) => `${s.title}${s.publisher ? ` — ${s.publisher}` : ""}${s.date ? ` (${s.date})` : ""} — ${s.url}`);
  return lines.length ? [state.input.lang.startsWith("tr") ? "Anlatım kaynakları:" : "Narration sources:", ...lines] : [];
}

export async function readResearchExport(store: AssetStore, state: EpisodeState) {
  const summary = state.render?.research, prefix = `episodes/${state.id}/research/exports/`;
  if (!summary || !summary.reportKey.startsWith(prefix) || !/^[a-z0-9-]+\.json$/.test(summary.reportKey.slice(prefix.length))) throw new LocalizedError(msg("err.research.missing"));
  const record = await getJson<ReturnType<typeof researchView> & { fingerprint: string; episodeId: string; renderedAt: string; exportId?: string }>(store, summary.reportKey);
  if (!record) throw new LocalizedError(msg("err.research.missing"));
  const { fingerprint, episodeId, renderedAt, exportId, ...view } = record;
  if (episodeId !== state.id || renderedAt !== state.render!.at || exportId !== state.render!.exportId || fingerprint !== summary.fingerprint || hash(view) !== fingerprint) throw new LocalizedError(msg("err.research.changed"));
  return record;
}
