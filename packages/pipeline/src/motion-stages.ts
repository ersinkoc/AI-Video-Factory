import { createHash } from "node:crypto";
import { extname } from "node:path";
import { motionDirector, type AgentResult, type MotionFilmOut } from "@ys/agents";
import { errorText, LocalizedError, MOTION_FILM, msg, shotPasses, type MotionFilm, type ShotReviewRecord, type Text, type Timeline } from "@ys/core";
import type { AssetStore } from "@ys/storage";
import { lintFilm, type FilmIssue } from "@ys/video/film";
import { FOOTAGE_TYPES, sniffFootage } from "./footage.ts";
import { filmScript, filmShots, filmTimeline, fitToVoice, MOTION, normalizeFilm, type MotionInput } from "./motion.ts";
import type { EpisodeReview, EpisodeState, Stage } from "./state.ts";

type StageFn = (state: EpisodeState, opts: { signal?: AbortSignal }) => Promise<void>;

/** Pipeline'ın motion aşamalarına açtığı yardımcılar. */
export interface MotionContext {
  store: AssetStore;
  log(text: Text): void;
  save(state: EpisodeState): Promise<void>;
  agent<T>(state: EpisodeState, stage: Stage, call: Promise<AgentResult<T>>): Promise<T>;
  agentDeps(): Parameters<typeof motionDirector>[1];
  music(state: EpisodeState, timeline: Timeline): Promise<void>;
  soundEffects(state: EpisodeState, timeline: Timeline): Promise<void>;
  /** Sahnelerin önizleme kareleri (Stüdyo Çekimler sekmesi); çıkarılamazsa günlüğe yazılır, üretim sürer. */
  previews(state: EpisodeState, timeline: Timeline): Promise<void>;
  /**
   * Sahnelerin karelerini çıkarır, önizleme olarak yazar ve film denetçisine denetletir; inceleme state.draftReview'a
   * yazılır. Kareler çıkarılamaz ya da hiçbiri denetlenemezse boş (rubrikli) kayıt kalır ve undefined döner.
   */
  review(state: EpisodeState, timeline: Timeline): Promise<EpisodeReview | undefined>;
  /** Barajı geçemeyen sahneler kaldıysa günlüğe yazar (render yapımcının onayını bekler). */
  logBelow(state: EpisodeState): void;
}

/** Bir incelemenin özeti: geçemeyen ya da denetlenemeyen kare payı ve denetlenen karelerin ortalaması. */
export function reviewShare(review: { shots: Record<string, ShotReviewRecord> }, ids: readonly string[]): { share: number; mean: number } {
  const scores = ids.flatMap((id) => (review.shots[id] ? [review.shots[id]!.score] : []));
  const failing = ids.filter((id) => !shotPasses(review.shots[id])).length;
  return { share: failing / Math.max(1, ids.length), mean: scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length) };
}

/**
 * Düzeltilmiş film eskisinden iyi mi: geçemeyen pay daha küçük, ya da aynı payda ortalama daha yüksek (sahne sayısı
 * değişebildiği için pay; taslak incelemesinin worseScene'iyle aynı ölçü).
 */
export function betterFilm(after: { share: number; mean: number }, before: { share: number; mean: number }): boolean {
  return after.share < before.share - 1e-9 || (Math.abs(after.share - before.share) <= 1e-9 && after.mean > before.mean);
}

/** Filmde kullanılabilen görsel türleri (logo, ekran görüntüsü). */
export const MOTION_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"] as const;
const isImageExt = (ext: string) => (MOTION_IMAGE_EXTS as readonly string[]).includes(ext);

/** Denetimin yönetmene not olarak gidenleri: okunma ve sığma kodla düzeltilir. */
const DIRECTABLE = new Set<FilmIssue["kind"]>(["hook", "gap", "burst", "flat", "crowded"]);

/** Motion bölümünün girdisi doğru mu: süre sınırda, renkler #RRGGBB. */
export function checkMotionInput(input: { targetSec: number; motion: MotionInput }): void {
  if (!(input.targetSec >= MOTION.minSec && input.targetSec <= MOTION.maxSec)) {
    throw new LocalizedError(msg("err.motion.duration", { min: MOTION.minSec, max: MOTION.maxSec, sec: input.targetSec }));
  }
  const bad = input.motion.colors.find((c) => !/^#[0-9a-f]{6}$/i.test(c));
  if (bad) throw new LocalizedError(msg("err.motion.color", { color: bad }));
  if (input.motion.images.length + (input.motion.pending?.length ?? 0) > MOTION.images) throw new LocalizedError(msg("err.motion.images", { max: MOTION.images }));
}

/**
 * Görseli bölüme ekler: tür izin listesinden ve dosyanın kendi imzasından (uzantısı resim olmayan dosya reddedilir),
 * içerik adresli anahtar bölümün klasöründe (bölüm silinince gider). Aynı görsel iki kez eklenmez.
 */
export async function addMotionImage(store: AssetStore, state: EpisodeState, name: string, bytes: Uint8Array): Promise<void> {
  const ext = extname(name).slice(1).toLowerCase();
  if (!isImageExt(ext) || !sniffFootage(bytes.subarray(0, 32), ext)) throw new LocalizedError(msg("err.motion.imageType", { name }));
  const motion = state.input.motion!;
  const key = `assets/motion/${state.id}/img/${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}.${ext}`;
  if (motion.images.some((i) => i.key === key)) return;
  await store.put(key, bytes, FOOTAGE_TYPES[ext as keyof typeof FOOTAGE_TYPES]);
  motion.images.push({ key, name });
}

/**
 * Motion modunun aşamaları (hareketli grafik filmi): stil, kadro, konsept, kare, kesim ve inceleme boştur (çizim koddan);
 * ses, render, paket ve Short bölümün normal aşamalarıdır.
 */
export function motionStages(ctx: MotionContext): Partial<Record<Stage, StageFn>> {
  const noop: StageFn = async () => {};
  const imagesOf = (state: EpisodeState) => state.input.motion!.images;

  /** Yönetmen + kod kuralları; atılan sahne kalmazsa çevrilebilir hata. */
  const direct = async (state: EpisodeState, revise?: { film: MotionFilm; notes: string[] }): Promise<MotionFilm> => {
    const m = state.input.motion!;
    const images = await Promise.all(
      imagesOf(state).map(async (im) => {
        const data = await ctx.store.get(im.key);
        if (!data) throw new LocalizedError(msg("err.store.missing", { key: im.key }));
        const ext = extname(im.key).slice(1);
        return { name: im.name, image: { data, mimeType: FOOTAGE_TYPES[ext as keyof typeof FOOTAGE_TYPES] } };
      }),
    );
    const out: MotionFilmOut = await ctx.agent(
      state,
      "script",
      motionDirector({ brief: state.input.topic, lang: state.input.lang, targetSec: state.input.targetSec, tall: state.input.height > state.input.width, narration: m.narration, colors: m.colors, images, revise }, ctx.agentDeps()),
    );
    try {
      return normalizeFilm({ ...out, scenes: out.scenes.map((s) => (m.narration ? s : { ...s, narration: "" })) }, { brief: state.input.topic, images: images.length, colors: m.colors, targetSec: state.input.targetSec, fps: state.input.fps });
    } catch {
      throw new LocalizedError(msg("err.motion.empty"));
    }
  };

  return {
    style: noop,
    cast: noop,
    concept: noop,
    keyframes: noop,
    clips: noop,
    review: noop,

    /** Stüdyo'dan yüklenen görseller bölüme alınır; konu filmin başlığı olur. */
    story: async (state) => {
      checkMotionInput({ targetSec: state.input.targetSec, motion: state.input.motion! });
      const m = state.input.motion!;
      while (m.pending?.length) {
        const p = m.pending[0]!;
        const bytes = await ctx.store.get(p.key);
        if (!bytes) throw new LocalizedError(msg("err.store.missing", { key: p.key }));
        // Tür Stüdyo'nun denetlediği anahtardan gelir (adın uzantısı ondan farklıysa ad ona uydurulur).
        const ext = extname(p.key);
        await addMotionImage(ctx.store, state, extname(p.name).toLowerCase() === ext ? p.name : `${p.name}${ext}`, bytes);
        m.pending.shift();
        if (!m.pending.length) delete m.pending;
        await ctx.store.delete(p.key);
        await ctx.save(state);
      }
      state.story ??= { title: state.input.topic, logline: state.input.topic, premise: "", hook: "", beats: [] };
    },

    /** Yönetmen filmi yazar; kod denetler, yönetmene çözebileceği notlarla bir kez düzelttirir. */
    script: async (state) => {
      // Yapımcının notu varsa yönetmen önceki filmi notla düzeltir (Stüdyo: notla yeniden yaz).
      const note = state.motionNote;
      let film = note && state.motionFilm ? await direct(state, { film: state.motionFilm, notes: [`producer's note: ${note}`] }) : await direct(state);
      delete state.motionNote;
      let issues = lintFilm(film, state.input.fps);
      const notes = issues.filter((i) => DIRECTABLE.has(i.kind)).map((i) => `${i.sceneId ? `${i.sceneId} ` : ""}at ${i.atSec}s: ${i.kind}: ${i.detail}`);
      if (notes.length) {
        ctx.log(msg("log.motion.revise", { n: notes.length, kinds: [...new Set(issues.map((i) => i.kind))].join(", ") }));
        try {
          film = await direct(state, { film, notes });
          issues = lintFilm(film, state.input.fps);
        } catch (e) {
          // Düzeltme düşerse ilk film kalır (denetim notlarıyla).
          ctx.log(msg("log.motion.reviseSkipped", { error: errorText(e) }));
        }
      }
      state.motionFilm = film;
      state.motionLint = issues;
      state.story = { title: film.title, logline: state.input.topic, premise: "", hook: "", beats: [] };
      state.script = filmScript(film);
      delete state.motionTimed;
      const sec = film.scenes.reduce((n, s) => n + s.beats, 0) * (60 / film.bpm);
      ctx.log(msg("log.motion.plan", { scenes: film.scenes.length, bpm: film.bpm, sec: sec.toFixed(1), issues: issues.length }));
    },

    /** Zamanlama: anlatım varsa sahneler vuruşla uzar; her sahne bir çekim. */
    shots: async (state) => {
      const film = state.motionFilm;
      if (!film) throw new LocalizedError(msg("err.missing", { what: "motionFilm" }));
      const voiceMs = Object.fromEntries(Object.entries(state.voice ?? {}).map(([id, v]) => [id, v.durationMs]));
      const timed = fitToVoice(film, voiceMs);
      state.motionTimed = timed;
      state.shots = filmShots(timed, state.input.fps);
      const sec = timed.scenes.reduce((n, s) => n + s.beats, 0) * (60 / timed.bpm);
      ctx.log(msg("log.motion.fit", { sec: sec.toFixed(1), target: state.input.targetSec, max: MOTION_FILM.maxSec }));
    },

    /**
     * Timeline: sahneler, anlatım ve altyazı; sonra filmin temposunda müzik ve efekt; sonra kare denetimi (qa kapalı
     * değilse). Anlatımsız filmde barajı geçemeyen sahneler denetçinin bulgularıyla yönetmene bir kez döner; düzeltilmiş
     * film ancak daha iyi denetlenirse kalır. Anlatımlı filmde sahne uzunlukları sese bağlı: yalnız kapı tutar.
     */
    timeline: async (state) => {
      let timeline = await build(state);
      if (state.input.qa === false) {
        delete state.draftReview;
        await ctx.previews(state, timeline);
      } else {
        const review = await ctx.review(state, timeline);
        if (review && !state.input.motion!.narration) timeline = await revise(state, review);
        if (review) ctx.logBelow(state);
      }
      const sec = timeline.durationInFrames / timeline.fps;
      ctx.log(msg("log.timeline.done", { min: (sec / 60).toFixed(1), visuals: timeline.visuals.length }));
    },
  };

  /** Filmin timeline'ı, efektleri ve müziği (state.timeline'a yazılır). */
  async function build(state: EpisodeState): Promise<Timeline> {
    const film = state.motionTimed ?? state.motionFilm;
    if (!film) throw new LocalizedError(msg("err.missing", { what: "motionFilm" }));
    const timeline = filmTimeline({
      episodeId: state.id,
      lang: state.input.lang,
      fps: state.input.fps,
      width: state.input.width,
      height: state.input.height,
      film,
      images: imagesOf(state).map((i) => i.key),
      voice: state.voice ?? {},
      captions: state.input.motion!.narration && state.input.captions !== false,
    });
    state.timeline = timeline;
    if (state.input.sfx !== false) await ctx.soundEffects(state, timeline);
    if (state.input.music !== false) await ctx.music(state, timeline);
    return state.timeline;
  }

  /**
   * Kare denetiminin bulgularıyla bir düzeltme turu (22 Kas). Yönetmen geçemeyen sahneleri bulgularla düzeltir, film
   * yeniden zamanlanır ve denetlenir; daha iyi değilse ya da kodun ritim bulguları arttıysa önceki film, timeline, kareler
   * ve inceleme geri gelir (eski kareler ve sesler içerik adresli anahtarlarda durur). Döner: geçerli timeline.
   */
  async function revise(state: EpisodeState, review: EpisodeReview): Promise<Timeline> {
    const failing = state.shots!.filter((s) => !shotPasses(review.shots[s.id]) && review.shots[s.id]);
    if (!failing.length) return state.timeline!;
    ctx.log(msg("log.motion.critic", { n: failing.length, scenes: failing.map((s) => s.id).join(", ") }));
    const notes = failing.map((s) => `frame check ${s.id} (${review.shots[s.id]!.score}/10): ${review.shots[s.id]!.issues.map((i) => `${i.type}: ${i.detail}`).join("; ")}`);
    const before = { motionFilm: state.motionFilm, motionTimed: state.motionTimed, motionLint: state.motionLint, script: state.script, story: state.story, shots: state.shots, timeline: state.timeline, draftReview: state.draftReview, stills: state.stills };
    const was = reviewShare(review, before.shots!.map((s) => s.id));
    // Yönetmene giden ritim bulguları (kanca, boşluk, patlama…) artmamalı: kare denetimi ritme bakmaz.
    const rhythm = (issues: FilmIssue[]) => issues.filter((i) => DIRECTABLE.has(i.kind)).map((i) => i.kind);
    let film: MotionFilm;
    try {
      film = await direct(state, { film: state.motionFilm!, notes });
    } catch (e) {
      ctx.log(msg("log.motion.reviseSkipped", { error: errorText(e) }));
      return state.timeline!;
    }
    state.motionFilm = film;
    state.motionLint = lintFilm(film, state.input.fps);
    state.script = filmScript(film);
    state.story = { ...state.story!, title: film.title };
    state.motionTimed = fitToVoice(film, {});
    state.shots = filmShots(state.motionTimed, state.input.fps);
    const timeline = await build(state);
    const again = await ctx.review(state, timeline);
    const now = again ? reviewShare(again, state.shots.map((s) => s.id)) : undefined;
    const better = again && betterFilm(now!, was);
    const kinds = rhythm(state.motionLint);
    if (better && kinds.length <= rhythm(before.motionLint!).length) {
      state.draftReview = { ...state.draftReview!, revisedScenes: failing.map((s) => s.id) };
      ctx.log(msg("log.motion.criticKept", { before: Math.round(was.share * 100), after: Math.round(now!.share * 100) }));
      return timeline;
    }
    Object.assign(state, before);
    const shares = { before: Math.round(was.share * 100), after: now ? Math.round(now.share * 100) : 100 };
    // Kareler iyileşip ritim bulguları arttıysa öyle söylenir ("daha iyi değil … %20 → %0" kendisiyle çelişiyordu, 23 Kas).
    ctx.log(better ? msg("log.motion.criticRhythm", { ...shares, kinds: [...new Set(kinds)].join(", ") }) : msg("log.motion.criticReverted", shares));
    return state.timeline!;
  }
}
