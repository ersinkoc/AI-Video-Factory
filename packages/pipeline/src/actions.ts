import { LocalizedError, msg, reverseAssetId, sideAssetId, VectorAssetMeta } from "@ys/core";
import type { ArchiveImage } from "@ys/core";
import { deletePrefix, getJson, putJson, type AssetStore } from "@ys/storage";
import { libraryIdOf, noteCharacterUse } from "./library.ts";
import { cleanSeries } from "./series.ts";
import { acquireLock } from "./lock.ts";
import { GATES, motionModeOf, STAGES, type EpisodeInput, type EpisodeState, type Gate, type MotionMode } from "./state.ts";

/*
 * İnsan kararları: onay, seçim, düzenleme. Ağır bağımlılık (Remotion, Agent SDK) içermez;
 * Stüdyo bunları doğrudan çağırır, üretim işleri ise ayrı süreçte (CLI/Trigger.dev) çalışır.
 */

export const stateKey = (id: string) => `episodes/${id}/state.json`;

const slug = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .normalize("NFKD")
    // ç → c + birleşik çengel; işaret silinmezse "bekc-isi" gibi kimlikler çıkıyordu.
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "bolum";

export function newEpisodeState(input: EpisodeInput): EpisodeState {
  const rand = Math.random().toString(16).slice(2, 8);
  const id = `${new Date().toISOString().slice(0, 10)}-${slug(input.topic)}-${rand}`;
  return { id, createdAt: new Date().toISOString(), input, done: {}, agentCostUsd: 0 };
}

export class EpisodeRepo {
  constructor(private readonly store: AssetStore) {}

  async load(id: string): Promise<EpisodeState> {
    const state = await getJson<EpisodeState>(this.store, stateKey(id));
    if (!state) throw new LocalizedError(msg("err.episode.notFound", { id }));
    return state;
  }

  async save(state: EpisodeState): Promise<void> {
    await putJson(this.store, stateKey(state.id), state);
  }

  async list(options: { includeTimeline?: boolean } = {}): Promise<EpisodeState[]> {
    const keys = (await this.store.list("episodes/")).filter((k) => k.endsWith("/state.json"));
    const states: (EpisodeState | null)[] = [];
    // Büyük SVG'li durumları aynı anda belleğe doldurma; Studio listeleri timeline'ı tutmaz.
    for (let i = 0; i < keys.length; i += 4) {
      const batch = await Promise.all(keys.slice(i, i + 4).map(async (k) => {
        // Okunamayan (bozuk) tek durum dosyası tüm listeyi düşürmesin.
        const state = await getJson<EpisodeState>(this.store, k).catch(() => null);
        if (!state || options.includeTimeline !== false) return state;
        const { timeline: _timeline, ...summary } = state;
        return summary;
      }));
      states.push(...batch);
    }
    return states
      .filter((s): s is EpisodeState => s !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, fn: (state: EpisodeState) => void): Promise<EpisodeState> {
    const release = await acquireLock(this.store, id);
    try {
      const state = await this.load(id);
      fn(state);
      await this.save(state);
      return state;
    } finally { await release(); }
  }
}

/** Bölümün depodaki kendi dosyaları: inceleme kareleri, efekt ve müzik izleri; durum ve çalışma kilidi en sonda. */
export const episodePrefixes = (id: string): string[] => [`assets/stills/${id}/`, `assets/sfx/${id}/`, `assets/music/${id}/`, `episodes/${id}/`];

/**
 * Bölümü depodan siler (yarım kalmış ya da bitmiş); silinen dosya sayısını döner. Durum dosyası en son gider: yarıda
 * kalan silme bölümü listede bırakır, yeniden denenebilir. Ortak kütüphane (onaylı karakterler, nesneler, haritalar) ve
 * içerik adresli üretim önbelleği başka bölümlerin de olduğu için kalır; harcama defteri geçmiş kaydı olarak kalır.
 * Render klasörü (yerel disk) çağıranın işidir.
 */
export async function deleteEpisode(store: AssetStore, id: string): Promise<number> {
  let n = 0;
  for (const prefix of episodePrefixes(id)) n += await deletePrefix(store, prefix);
  return n;
}

/** Bu aşamadan sonraki tüm aşamaların "bitti" işaretini kaldırır (çıktılar yeniden üretilecek). */
export function invalidateFrom(state: EpisodeState, stage: (typeof STAGES)[number]): void {
  for (const s of STAGES.slice(STAGES.indexOf(stage))) delete state.done[s];
}

/** Select or remove an archive insert without destroying the generated frame, vector plan or clip. */
export function setArchiveShot(state: EpisodeState, shotId: string, image?: ArchiveImage): void {
  if (!state.shots?.some((s) => s.id === shotId)) throw new LocalizedError(msg("err.action.noShots"));
  if (image) (state.archives ??= {})[shotId] = image;
  else delete state.archives?.[shotId];
  delete state.timeline;
  delete state.lastError;
  reviewAgain(state);
  invalidateFrom(state, "timeline");
}

export function approve(state: EpisodeState, gate: Gate): void {
  if (gate === "script" && !state.script) throw new LocalizedError(msg("err.action.scriptFirst"));
  if (gate === "concept") {
    const missing = missingSelections(state);
    if (missing.length) throw new LocalizedError(msg("err.selection.missing", { ids: missing.join(", ") }));
  }
  state.approvals = { ...state.approvals, [gate]: new Date().toISOString() };
  if (state.waitingFor === gate) delete state.waitingFor;
}

/**
 * Görüntü değişti (yeniden çizim, notla yeniden oluşturma): önizleme onayı geri alınır, render'dan önce yine durulur
 * (yapımcı yeni çekimleri görmeden render alınmasın).
 */
function reviewAgain(state: EpisodeState): void {
  if (state.approvals) delete state.approvals.preview;
}

/**
 * Yalnız render ayarı değişti (altyazı, efekt, müzik) ve görüntü render edilmiş haliyle duruyor: önizleme kabul
 * edilmiş sayılır, yeniden render kapıda beklemez. Önizleme kapısı sonradan eklendi; eski bölümlerde onay kaydı yok.
 */
function keepPreview(state: EpisodeState): void {
  if (state.render && state.done.keyframes && !state.approvals?.preview) state.approvals = { ...state.approvals, preview: new Date().toISOString() };
}

export function revokeApproval(state: EpisodeState, gate: Gate): void {
  if (state.approvals) delete state.approvals[gate];
  invalidateFrom(state, GATES[gate]);
}

export function missingSelections(state: EpisodeState): string[] {
  const ids = [...(state.cast?.characters ?? []), ...(state.cast?.locations ?? [])].map((e) => e.id);
  return ids.filter((id) => !state.concept?.selected[id]);
}

export function selectCandidate(state: EpisodeState, entityId: string, index: number): void {
  const candidate = state.concept?.candidates[entityId]?.[index];
  if (!state.concept || !candidate) throw new LocalizedError(msg("err.action.noCandidate", { id: `${entityId}#${index}` }));
  state.concept.selected[entityId] = candidate;
  // Referans değişince eski deneme kareleri artık temsil edici değil.
  delete state.concept.previews;
}

/** Onaydan önce anlatım metni düzenlenebilir. */
export function editNarration(state: EpisodeState, sceneId: string, narration: string): void {
  if (state.approvals?.script) throw new LocalizedError(msg("err.action.scriptApproved"));
  const scene = state.script?.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new LocalizedError(msg("err.action.noScene", { id: sceneId }));
  if (typeof narration !== "string" || !narration.trim() || narration.length > 20_000) throw new LocalizedError(msg("err.edit.invalid"));
  const text = narration.trim();
  if (scene.narration === text) return;
  scene.narration = text;
  // Eski ses yeni metni okumaz.
  delete state.voice?.[sceneId];
  delete state.timeline;
  delete state.lastError;
  delete state.waitingFor;
  reviewAgain(state);
  invalidateFrom(state, "voice");
}

export function setMotion(state: EpisodeState, motionMode: MotionMode, aiClipRatio?: number): void {
  if (state.approvals?.concept) throw new LocalizedError(msg("err.action.conceptApproved"));
  // Görsel ve vektör modlarının konsept varlıkları farklıdır (PNG/JPEG ↔ SVG); geçişte konsept yeniden üretilir.
  const wasVector = state.input.motionMode === "vector";
  if (wasVector !== (motionMode === "vector") && state.concept) {
    delete state.concept;
    invalidateFrom(state, "concept");
  }
  state.input.motionMode = motionMode;
  if (aiClipRatio !== undefined) state.input.aiClipRatio = aiClipRatio;
}

/**
 * Seçilen çekimlerin karelerini (ve varsa kliplerini) siler; sonraki çalıştırmada yeniden çizilir.
 * Her yeniden çizim yeni bir seed alır, yoksa aynı istek önbellekten aynı kareyi döndürürdü.
 */
export function redrawShots(state: EpisodeState, shotIds: string[]): void {
  const known = new Set(state.shots?.map((s) => s.id));
  const ids = shotIds.filter((id) => known.has(id));
  if (ids.length === 0) throw new LocalizedError(msg("err.action.noShots"));
  state.redraws ??= {};
  for (const id of ids) {
    state.redraws[id] = (state.redraws[id] ?? 0) + 1;
    delete state.keyframes?.[id];
    delete state.qa?.[id];
    delete state.clips?.[id];
    delete state.archives?.[id];
  }
  delete state.lastError;
  reviewAgain(state);
  invalidateFrom(state, "keyframes");
}

/**
 * Çekimin kare incelemesi (render sonrası inceleme, yoksa render öncesi taslak denetimi): yönetmene "sahnenin N.
 * çekimi" diye gider; numara sahne içindeki sıradır (yeniden planlamada yönetmene gösterilen planla aynı).
 */
function findingsOf(state: EpisodeState, shot: { id: string; sceneId: string }): string[] {
  const review = state.review?.shots[shot.id] ?? state.draftReview?.shots[shot.id];
  if (!review?.issues.length) return [];
  const n = state.shots!.filter((s) => s.sceneId === shot.sceneId).findIndex((s) => s.id === shot.id) + 1;
  return review.issues.map((i) => `- shot ${n} (${review.score}/10): ${i.type}: ${i.detail}`);
}

/**
 * Notla yeniden oluşturma (vektör): seçilen çekimlerin sahnelerine yapımcının notu ve o çekimlerin inceleme bulguları
 * yazılır, üretim kare aşamasından yeniden açılır (render öncesi ya da sonrası). Kare aşaması yalnız bu sahneleri
 * yeniden planlatır; render ve paket yeniden alınır. Bulgu varsa not isteğe bağlıdır (toplu "sorunluları düzelt").
 * Aynı sahneye ikinci istek öncekinin altına eklenir.
 */
export function replanShots(state: EpisodeState, shotIds: string[], note: string): void {
  if (motionModeOf(state.input) !== "vector") throw new LocalizedError(msg("err.action.replanVector"));
  const text = note.trim();
  const allShots = state.shots ?? [];
  const picked = allShots.filter((s) => shotIds.includes(s.id));
  if (!picked.length) throw new LocalizedError(msg("err.action.noShots"));
  const findings = new Map(picked.map((s) => [s.id, findingsOf(state, s)]));
  if (!text && ![...findings.values()].some((f) => f.length)) throw new LocalizedError(msg("err.action.noNote"));
  state.replans ??= {};
  const at = new Date().toISOString();
  for (const sceneId of new Set(picked.map((s) => s.sceneId))) {
    for (const shot of allShots) if (shot.sceneId === sceneId) delete state.archives?.[shot.id];
    const prev = state.replans[sceneId];
    const shots = picked.filter((s) => s.sceneId === sceneId);
    state.replans[sceneId] = {
      note: [prev?.note, text].filter(Boolean).join("\n"),
      shots: [...new Set([...(prev?.shots ?? []), ...shots.map((s) => s.id)])],
      findings: [...new Set([...(prev?.findings ?? []), ...shots.flatMap((s) => findings.get(s.id)!)])],
      at,
    };
  }
  delete state.lastError;
  reviewAgain(state);
  invalidateFrom(state, "keyframes");
}

/**
 * Anlatıcı sesini değiştirir. Bölüm tek sesle anlatıldığı için tüm sahneler yeniden seslendirilir;
 * zamanlama değiştiği için çekim planı ve sonrası da yeniden üretilir.
 */
export function changeVoice(state: EpisodeState, voiceId: string | undefined): void {
  if (state.done.render) throw new LocalizedError(msg("err.action.rendered"));
  state.input.voiceId = voiceId || undefined;
  delete state.voice;
  delete state.voiceProviderId;
  delete state.lastError;
  invalidateFrom(state, "voice");
}
// ---------------- kalite kapısında insan kararı ----------------

/** Kaydın sahibi: kimlik; eski kayıtlarda (kimliksiz) kadro adı ya da nesne kimliği olan ad. */
function ownerOf(state: EpisodeState, check: { entityId?: string; name: string }): string | undefined {
  if (check.entityId) return check.entityId;
  const cast = [...(state.cast?.characters ?? []), ...(state.cast?.locations ?? [])].find((e) => e.name === check.name);
  return cast?.id ?? (state.vectorProps?.[check.name] ? check.name : undefined);
}

/**
 * Türeyen görünüş kaydı: yan görünüş ("<karakter>~side") kabul edilince karakter yürürken o çizime döner; ters açı
 * ("<oda>~rev") kabul edilince aynı odada art arda kesmede kullanılır (atama kurgu aşamasında tazelenir). Reddedilince
 * bu bölümde asıl görünüş kalır (paylaşılan kütüphane kaydı ret notuyla işaretlenir; yerinde yeniden çizilmez). Kurgu
 * yenilenir.
 */
function viewOwner(state: EpisodeState, entityId: string, key: string, ok: boolean): boolean {
  const views = entityId.endsWith(sideAssetId("")) ? (state.sideViews ??= {}) : entityId.endsWith(reverseAssetId("")) ? (state.backgroundViews ??= {}) : undefined;
  if (!views) return false;
  views[entityId.slice(0, entityId.lastIndexOf("~"))] = { key, ok };
  if (state.done.timeline) invalidateFrom(state, "timeline");
  return true;
}

/** Varlığı sahibine bağlar: kadro varlığı konsepte aday ve seçim olur, nesne çekimlere girer. */
function attach(state: EpisodeState, entityId: string | undefined, key: string): void {
  if (!entityId) return;
  if (viewOwner(state, entityId, key, true)) return;
  const isCast = [...(state.cast?.characters ?? []), ...(state.cast?.locations ?? [])].some((e) => e.id === entityId);
  if (isCast && state.concept) {
    const ref = { key, mimeType: "image/svg+xml" };
    const list = (state.concept.candidates[entityId] ??= []);
    if (!list.some((r) => r.key === key)) list.push(ref);
    state.concept.selected[entityId] = ref;
    return;
  }
  const prop = state.vectorProps?.[entityId];
  if (prop) {
    prop.key = key;
    // Nesne çizildiyse sahneler zaten onu kullanıyor; yalnız kurgu ve render yenilenir.
    if (state.done.timeline) invalidateFrom(state, "timeline");
  }
}

/** Varlığı sahibinden ayırır; yeniden çizilmesi için ilgili aşama açılır. */
function detach(state: EpisodeState, entityId: string | undefined, key: string): void {
  if (!entityId) return;
  if (viewOwner(state, entityId, key, false)) return;
  const isCast = [...(state.cast?.characters ?? []), ...(state.cast?.locations ?? [])].some((e) => e.id === entityId);
  if (isCast && state.concept) {
    state.concept.candidates[entityId] = (state.concept.candidates[entityId] ?? []).filter((r) => r.key !== key);
    if (state.concept.selected[entityId]?.key === key) delete state.concept.selected[entityId];
    if (state.approvals?.concept) delete state.approvals.concept;
    if (state.done.concept) invalidateFrom(state, "concept");
    return;
  }
  const prop = state.vectorProps?.[entityId];
  if (prop?.key === key) {
    delete prop.key;
    if (state.done.keyframes) invalidateFrom(state, "keyframes");
  }
}

/**
 * İnsan, kalite kapısının reddettiği çizimi kabul eder: en iyi deneme kütüphaneye onaylı olarak yazılır ve varlık
 * sahibine bağlanır (kadro → konsept seçimi, nesne → çekimler).
 */
export async function acceptAsset(store: AssetStore, state: EpisodeState, key: string): Promise<void> {
  const check = state.assetChecks?.[key];
  if (!check) throw new LocalizedError(msg("err.action.noGateRecord", { key }));
  const override = { decision: "accepted" as const, at: new Date().toISOString() };
  const next = { ...check, passed: true, override };
  if (check.rejectedKey) {
    const svg = await store.get(check.rejectedKey);
    if (!svg) throw new LocalizedError(msg("err.action.rejectedMissing"));
    const meta = VectorAssetMeta.parse((await getJson(store, `${check.rejectedKey}.json`)) ?? {});
    await store.put(key, svg, "image/svg+xml");
    await putJson(store, `${key}.json`, { ...meta, check: next });
  } else {
    const meta = VectorAssetMeta.parse((await getJson(store, `${key}.json`)) ?? {});
    await putJson(store, `${key}.json`, { ...meta, check: next });
  }
  (state.assetChecks ??= {})[key] = next;
  attach(state, ownerOf(state, check), key);
  // Kapı yüzünden duran aşama artık devam edebilir.
  if (state.lastError?.message.includes("Kalite kapısı")) delete state.lastError;
}

/**
 * İnsan bir çizimi (kapı geçirmiş olsa da) reddeder: kütüphanede kullanılmaz olarak işaretlenir, sahibinden ayrılır;
 * sonraki çalıştırmada not tasarımcıya düzeltme olarak iletilip yeniden çizilir.
 */
export async function rejectAsset(store: AssetStore, state: EpisodeState, key: string, note?: string): Promise<void> {
  const check = state.assetChecks?.[key];
  if (!check) throw new LocalizedError(msg("err.action.noGateRecord", { key }));
  const override = { decision: "rejected" as const, note: note?.trim() || undefined, at: new Date().toISOString() };
  const next = { ...check, passed: false, override };
  // Kütüphaneden tekrar kullanılan karakter: "bu kişi değil" kararı yalnız bu bölümü ilgilendirir; paylaşılan kayıt
  // değişmezse başka bölümler ve seriler onu kullanmaya devam eder. Bu bölümde yeniden çizilir.
  const reused = state.cast?.characters.find((c) => c.reuse && c.reuse === libraryIdOf(key));
  if (reused) {
    delete reused.reuse;
    (state.assetChecks ??= {})[key] = next;
    detach(state, reused.id, key);
    return;
  }
  const meta = await getJson<VectorAssetMeta>(store, `${key}.json`);
  if (meta) await putJson(store, `${key}.json`, { ...meta, check: next });
  (state.assetChecks ??= {})[key] = next;
  detach(state, ownerOf(state, check), key);
}

/**
 * Kadrodaki karaktere kütüphanedeki onaylı bir karakteri atar (Stüdyo → Konsept → "Kütüphaneden kullan"): yeniden
 * çizilmez, aday olarak eklenir ve seçilir.
 */
export async function reuseCharacter(store: AssetStore, state: EpisodeState, castId: string, key: string): Promise<void> {
  const character = state.cast?.characters.find((c) => c.id === castId);
  if (!character || !state.concept) throw new LocalizedError(msg("err.action.notInCast", { id: castId }));
  const meta = VectorAssetMeta.parse((await getJson(store, `${key}.json`)) ?? {});
  if (!meta.identity || !meta.check?.passed || meta.check.override?.decision === "rejected") throw new LocalizedError(msg("err.action.notApproved"));
  if (state.input.realism !== false && meta.check.fidelitySkipped && meta.check.override?.decision !== "accepted") {
    throw new LocalizedError(msg("err.action.realismSkipped"));
  }
  const ref = { key, mimeType: "image/svg+xml" };
  const list = (state.concept.candidates[castId] ??= []);
  if (!list.some((r) => r.key === key)) list.push(ref);
  state.concept.selected[castId] = ref;
  (state.assetChecks ??= {})[key] = { ...meta.check, entityId: castId };
  character.reuse = libraryIdOf(key);
  await noteCharacterUse(store, key, state.id);
}

/** Bölümün serisini değiştirir (boş: seriden çıkar). Üretimi etkilemez; stil zaten seçildiyse değişmez. */
export function setSeries(state: EpisodeState, name: string | undefined): void {
  state.input.series = cleanSeries(name);
}

/** Gerçeklik (referansa sadakat) denetimini bölüm için açar/kapatır; tanınırlık denetimi her zaman açıktır. */
export function setRealism(state: EpisodeState, enabled: boolean): void {
  state.input.realism = enabled;
}

/**
 * Altyazının videoya gömülmesini açar/kapatır. Video zaten render edildiyse render (ve Short) yeniden açılır: devam
 * yalnız onları tekrarlar (Claude çağrısı yok, para harcamaz); eski video yenisi çıkana dek kalır.
 */
export function setCaptions(state: EpisodeState, enabled: boolean): void {
  if ((state.input.captions !== false) === enabled) return;
  state.input.captions = enabled;
  keepPreview(state);
  delete state.done.render;
  delete state.done.short;
}

/**
 * Kareye kilitli efekt seslerini açar/kapatır. İz timeline aşamasında üretilir: timeline, render ve Short yeniden açılır,
 * devam yalnız bunları tekrarlar (Claude çağrısı yok, para harcamaz); eski video yenisi çıkana dek kalır.
 */
export function setSfx(state: EpisodeState, enabled: boolean): void {
  if ((state.input.sfx !== false) === enabled) return;
  state.input.sfx = enabled;
  keepPreview(state);
  delete state.done.timeline;
  delete state.done.render;
  delete state.done.short;
}

/** Dikey Short'u açar/kapatır: yalnız short aşaması yeniden açılır (yerel render, ücretsiz). */
export function setShort(state: EpisodeState, enabled: boolean): void {
  if ((state.input.short !== false) === enabled) return;
  state.input.short = enabled;
  delete state.done.short;
}

/** Arka plan müziğini açar/kapatır: efekt sesi gibi timeline, render ve Short yeniden açılır (ücretsiz). */
export function setMusic(state: EpisodeState, enabled: boolean): void {
  if ((state.input.music !== false) === enabled) return;
  state.input.music = enabled;
  keepPreview(state);
  delete state.done.timeline;
  delete state.done.render;
  delete state.done.short;
}
