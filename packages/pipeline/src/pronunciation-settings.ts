import { createHash } from "node:crypto";
import { LocalizedError, msg, PronunciationBook, PronunciationMutation, pronunciationTermKey } from "@ys/core";
import { getJson, putJson, type AssetStore } from "@ys/storage";
import { LEXICON, sayPlan } from "./pronounce.ts";
import { invalidateFrom, type EpisodeRepo } from "./actions.ts";
import { episodeFingerprint } from "./editing.ts";
import { acquireLock } from "./lock.ts";
import { STAGES, type EpisodeState } from "./state.ts";

const BOOK_KEY = "settings/pronunciations.json";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const pronunciationLanguage = (language: string) => language.trim().toLowerCase().split("-")[0]!;
export const emptyPronunciationBook = (): PronunciationBook => ({ version: 1, revision: 0, updatedAt: "", entries: [] });
export async function loadPronunciationBook(store: AssetStore): Promise<PronunciationBook> {
  try { const value = await getJson<unknown>(store, BOOK_KEY); return value === null ? emptyPronunciationBook() : PronunciationBook.parse(value); }
  catch { throw new LocalizedError(msg("err.pronunciation.invalid")); }
}
export async function mutateSharedPronunciations(store: AssetStore, expectedRevision: number, mutation: unknown): Promise<void> {
  const parsed = PronunciationMutation.safeParse(mutation);
  if (!parsed.success) throw new LocalizedError(msg("err.pronunciation.invalid"));
  const bytes = await store.get(BOOK_KEY);
  let book: PronunciationBook;
  try { book = bytes ? PronunciationBook.parse(JSON.parse(new TextDecoder().decode(bytes))) : emptyPronunciationBook(); }
  catch { throw new LocalizedError(msg("err.pronunciation.invalid")); }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== book.revision) throw new LocalizedError(msg("err.pronunciation.changed"));
  const op = parsed.data, lang = op.type === "put" ? op.entry.lang : op.lang, written = op.type === "put" ? op.entry.written : op.written;
  const index = book.entries.findIndex((e) => e.lang === lang && pronunciationTermKey(e.written) === pronunciationTermKey(written));
  if (op.type === "remove") { if (index < 0) return; book.entries.splice(index, 1); }
  else { if (index >= 0 && JSON.stringify(book.entries[index]) === JSON.stringify(op.entry)) return; if (index >= 0) book.entries[index] = op.entry; else book.entries.push(op.entry); }
  book.revision++; book.updatedAt = new Date().toISOString();
  if (!PronunciationBook.safeParse(book).success) throw new LocalizedError(msg("err.pronunciation.invalid"));
  if (!store.compareAndSwap) throw new LocalizedError(msg("err.pronunciation.cas"));
  await putJson(store, `settings/pronunciations/history/${hash(book)}.json`, book);
  if (!await store.compareAndSwap(BOOK_KEY, bytes, new TextEncoder().encode(JSON.stringify(book)), "application/json")) throw new LocalizedError(msg("err.pronunciation.changed"));
}

export type PronunciationOrigin = "builtin" | "learned" | "shared" | "episode";
/** Aynı yazılışın farklı büyük/küçük harfli kopyaları önceliği değiştiremez. */
export function effectivePronunciations(state: Pick<EpisodeState, "input" | "pronunciations" | "pronunciationOverrides">, book: PronunciationBook) {
  const lang = pronunciationLanguage(state.input.lang), entries = new Map<string, { written: string; spoken: string; origin: PronunciationOrigin }>();
  const add = (terms: Record<string, string>, origin: PronunciationOrigin) => {
    for (const [written, spoken] of Object.entries(terms)) if (written.trim() && spoken.trim()) entries.set(pronunciationTermKey(written), { written, spoken, origin });
  };
  add(LEXICON[lang] ?? {}, "builtin"); add(state.pronunciations ?? {}, "learned");
  add(Object.fromEntries(book.entries.filter((e) => e.lang === lang).map((e) => [e.written, e.spoken])), "shared");
  add(state.pronunciationOverrides ?? {}, "episode");
  return [...entries.values()];
}
export const pronunciationTerms = (state: Parameters<typeof effectivePronunciations>[0], book: PronunciationBook) => Object.fromEntries(effectivePronunciations(state, book).map((e) => [e.written, e.spoken]));
export const pronunciationTermsFingerprint = (state: Parameters<typeof effectivePronunciations>[0], book: PronunciationBook) => hash(effectivePronunciations(state, book));
/** Ajanın deneme sırasında eklediği okunuşlar, kısmi üretim devamında editör sürümünü değiştirmez. */
export const pronunciationRulesFingerprint = (state: Parameters<typeof effectivePronunciations>[0], book: PronunciationBook) => hash([book.revision, effectivePronunciations({ ...state, pronunciations: undefined }, book)]);

export function previewPronunciationImpact(state: EpisodeState, book: PronunciationBook) {
  const terms = pronunciationTerms(state, book), lang = pronunciationLanguage(state.input.lang);
  const scenes = (state.script?.scenes ?? []).map((scene) => {
    const recorded = state.voice?.[scene.id], spoken = sayPlan(scene.narration, terms, lang).spoken;
    const previous = recorded?.spoken ?? recorded?.text;
    const status = !recorded ? "missing" as const : previous === undefined ? "unknown" as const : recorded.text !== undefined && recorded.text !== scene.narration || previous !== spoken ? "changed" as const : "current" as const;
    return { sceneId: scene.id, script: scene.narration, spoken, ...(previous !== undefined ? { recorded: previous } : {}), status };
  });
  const affected = scenes.filter((s) => s.status !== "current").map((s) => s.sceneId);
  return { fingerprint: episodeFingerprint(state), revision: book.revision, rulesFingerprint: pronunciationRulesFingerprint(state, book), scenes, affected, retained: scenes.filter((s) => s.status === "current").map((s) => s.sceneId), stages: affected.length ? STAGES.slice(STAGES.indexOf("voice")) : [] };
}
export type PronunciationImpact = ReturnType<typeof previewPronunciationImpact>;
export function pronunciationSettingsView(state: EpisodeState, book: PronunciationBook) {
  const lang = pronunciationLanguage(state.input.lang);
  return { lang, revision: book.revision, fingerprint: episodeFingerprint(state), effective: effectivePronunciations(state, book), shared: book.entries.filter((e) => e.lang === lang), overrides: state.pronunciationOverrides ?? {}, pending: state.pronunciationPlan ?? null };
}
type Repo = Pick<EpisodeRepo, "load" | "save">;
export async function mutateEpisodePronunciation(opts: { id: string; store: AssetStore; repo: Repo; fingerprint: string; mutation: unknown }): Promise<void> {
  const parsed = PronunciationMutation.safeParse(opts.mutation);
  if (!parsed.success) throw new LocalizedError(msg("err.pronunciation.invalid"));
  const release = await acquireLock(opts.store, opts.id);
  try {
    const state = await opts.repo.load(opts.id), op = parsed.data;
    if (episodeFingerprint(state) !== opts.fingerprint) throw new LocalizedError(msg("err.pronunciation.changed"));
    const lang = pronunciationLanguage(state.input.lang);
    if ((op.type === "put" ? op.entry.lang : op.lang) !== lang) throw new LocalizedError(msg("err.pronunciation.invalid"));
    const terms = new Map(Object.entries(state.pronunciationOverrides ?? {})), written = op.type === "put" ? op.entry.written : op.written;
    for (const key of terms.keys()) if (pronunciationTermKey(key) === pronunciationTermKey(written)) terms.delete(key);
    if (op.type === "put") terms.set(op.entry.written, op.entry.spoken);
    if (terms.size > 200) throw new LocalizedError(msg("err.pronunciation.invalid"));
    state.pronunciationOverrides = Object.fromEntries(terms);
    await opts.repo.save(state);
  } finally { await release(); }
}
export async function applyPronunciationImpact(opts: { id: string; store: AssetStore; repo: Repo; fingerprint: string; revision: number; rulesFingerprint: string }): Promise<void> {
  const release = await acquireLock(opts.store, opts.id);
  try {
    const state = await opts.repo.load(opts.id), book = await loadPronunciationBook(opts.store), preview = previewPronunciationImpact(state, book);
    if (preview.fingerprint !== opts.fingerprint || preview.revision !== opts.revision || preview.rulesFingerprint !== opts.rulesFingerprint) throw new LocalizedError(msg("err.pronunciation.changed"));
    if (!preview.affected.length) return;
    for (const id of preview.affected) delete state.voice?.[id];
    delete state.timeline; delete state.lastError; delete state.waitingFor;
    if (state.approvals) delete state.approvals.preview;
    invalidateFrom(state, "voice");
    state.pronunciationPlan = { revision: book.revision, rulesFingerprint: preview.rulesFingerprint, scenes: preview.affected, at: new Date().toISOString() };
    await opts.repo.save(state);
  } finally { await release(); }
}
