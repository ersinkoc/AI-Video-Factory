import { beatSec, MOTION_FILM, PACE_BEATS, sceneContent, sceneFrames, type LanguageCode, type MotionFilm, type MotionPalette, type MotionScene, type Timeline, type WordTiming } from "@ys/core";
import { contrast, fitScene, holdSec, wordsOf } from "@ys/video/film";

/**
 * Hareketli grafik filmi (motion modu) için saf kurallar: yönetmen ajanının tarifini düzeltir (sahne kimlikleri, dil ile
 * içerik uyumu, diyagram bağları, görsel dizinleri, renk karşıtlığı, okunma süresi), brifte geçmeyen sayıları "temsili
 * veri" diye işaretler, anlatıma göre sahneleri vuruşla uzatır ve timeline'ı kurar.
 */

export const MOTION = {
  minSec: MOTION_FILM.minSec,
  maxSec: MOTION_FILM.maxSec,
  /** Hedeften bu oranla uzun film sondan kısaltılır. */
  over: 1.25,
  /** Parlama geçişi en çok iki kez (techniques.md: üçüncüsü etkisini yitirir). */
  flashes: 2,
  /** Yazı ile zemin arasında en az karşıtlık (WCAG AA). */
  contrast: 4.5,
  /** Anlatımdan sonra sahnede kalan pay (ms). */
  voicePadMs: 300,
  images: 12,
} as const;

/** Motion bölümünün girdisi (EpisodeInput.motion). Görseller depodaki anahtarlardır; Stüdyo'dan yüklenenler önce pending'de. */
export interface MotionInput {
  colors: string[];
  images: { key: string; name: string }[];
  pending?: { key: string; name: string }[];
  narration: boolean;
}

/** Metindeki sayılar ("1,5", "1.000", "40%", "2.3M" → 1.5, 1000, 40, 2.3); binlik ayırıcıyı ve ondalığı ikisi de dener. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const raw = m[0];
    out.push(Number(raw.replace(/[.,]/g, "")));
    const last = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
    if (last >= 0) out.push(Number(`${raw.slice(0, last).replace(/[.,]/g, "")}.${raw.slice(last + 1)}`));
  }
  return out;
}

/** Sahnenin sayıları (grafik değerleri, sayaç, kart rakamları). */
function sceneNumbers(s: MotionScene): number[] {
  const out: number[] = [];
  if (s.data) {
    out.push(...s.data.points.map((p) => p.value));
    if (s.data.count) out.push(s.data.count.to);
  }
  for (const c of s.grid?.cards ?? []) if (c.stat) out.push(...numbersIn(c.stat));
  return out;
}

/**
 * Brifte yazıyla geçen küçük sayılar (İngilizce ve Türkçe, tam kelime). Yönetmen bunları rakamla yazar: brifteki
 * "installed in one day" kartta "1 day" oldu ve üç sahne yanlışlıkla "temsili veri" rozeti taşıdı (24 Kas, 9:16 film
 * m6/m9/m10). Türkçe "bir" belirsizlik sözcüğü de olduğundan 1 her Türkçe brifte bilinir; 1 yanlış rozetin tek kaynağı
 * olmaktan iyidir.
 */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000, dozen: 12, half: 0.5,
  bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20, otuz: 30, kırk: 40,
  elli: 50, yüz: 100, bin: 1000, yarım: 0.5, buçuk: 0.5,
};

/** Brifin bildiği sayılar: rakamla yazılanlar ve yazıyla geçen küçük sayılar (NUMBER_WORDS). */
export function briefNumbers(brief: string): number[] {
  // Türkçe küçültme "İKİ"yi, düz küçültme "THIRTY"yi doğru çevirir (Türkçe kural "I"yı "ı" yapar).
  const words = Array.from(brief.matchAll(/\p{L}+/gu), ([w]) => NUMBER_WORDS[w.toLocaleLowerCase("tr")] ?? NUMBER_WORDS[w.toLowerCase()]).filter((n) => n !== undefined);
  return [...numbersIn(brief), ...words];
}

/** Sayılarından biri brifte yoksa sahne temsilidir (rozet taşır). Negatif değer mutlak değeriyle aranır. */
export function illustrative(scene: MotionScene, brief: string): boolean {
  const known = briefNumbers(brief);
  return sceneNumbers(scene).some((v) => !known.some((k) => Math.abs(k - Math.abs(v)) <= 1e-9 * Math.max(1, k)));
}

/** Karşıtlığı yetersizse mürekkep zemine göre siyaha ya da beyaza döner; kullanıcı renkleri verdiyse vurgu onlardan biridir. */
export function fixPalette(p: MotionPalette, colors: readonly string[]): MotionPalette {
  const lower = colors.map((c) => c.toLowerCase());
  const accent = lower.length && !lower.includes(p.accent.toLowerCase()) ? lower[0]! : p.accent;
  const ink = contrast(p.ground, p.ink) >= MOTION.contrast ? p.ink : contrast(p.ground, "#000000") >= contrast(p.ground, "#ffffff") ? "#000000" : "#ffffff";
  return { ...p, ink, accent };
}

/** Sahnenin içeriğini kurallara uydurur; dili ile içeriği uyuşmayan sahne undefined. */
function cleanScene(s: MotionScene, images: number, bpm: number): MotionScene | undefined {
  if (!sceneContent(s)) return undefined;
  const scene: MotionScene = { ...s };
  // Dilin dışındaki içerik atılır: render ve denetim yalnız dilinkini okur.
  for (const k of ["kinetic", "data", "diagram", "grid", "field", "object"] as const) if (k !== s.language) delete scene[k];
  if (scene.kinetic) {
    const k = { ...scene.kinetic };
    if (k.highlight && !k.lines.some((l) => l.toLocaleLowerCase().includes(k.highlight!.toLocaleLowerCase()))) delete k.highlight;
    if (k.mode !== "chapter") delete k.chapter;
    else k.chapter = { index: k.chapter?.index ?? 1, total: Math.max(k.chapter?.index ?? 1, k.chapter?.total ?? 1) };
    scene.kinetic = k;
  }
  if (scene.data) {
    const d = { ...scene.data };
    if (d.chart === "count") d.points = [];
    else delete d.count;
    if (d.highlight !== undefined && d.highlight >= d.points.length) delete d.highlight;
    if (d.chart === "count") delete d.highlight;
    // Birim son ekte de varsa bir kez yazılır (gerçek filmde sayaç "<50 ms ms" çıkacaktı).
    if (d.count && d.unit && d.count.suffix.trim().endsWith(d.unit.trim())) delete d.unit;
    scene.data = d;
  }
  if (scene.diagram) {
    // Aynı hücredeki düğüm sonraki boş hücreye kayar (4×4 ızgarada); bilinmeyen uçlu, kendine dönen ve tekrar eden bağlar atılır.
    const taken = new Set<string>();
    const nodes = scene.diagram.nodes
      .filter((n, i, all) => all.findIndex((m) => m.id === n.id) === i)
      .map((n) => {
        let cell = n.row * 4 + n.col;
        while (taken.has(String(cell % 16))) cell++;
        taken.add(String(cell % 16));
        return { ...n, col: (cell % 16) % 4, row: Math.floor((cell % 16) / 4) };
      });
    const ids = new Set(nodes.map((n) => n.id));
    const edges = scene.diagram.edges.filter((e, i, all) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to && all.findIndex((x) => x.from === e.from && x.to === e.to) === i);
    scene.diagram = { ...scene.diagram, nodes, edges, ...(scene.diagram.highlight && !ids.has(scene.diagram.highlight) ? { highlight: undefined } : {}) };
    if (nodes.length < 2) return undefined;
  }
  if (scene.grid) scene.grid = { ...scene.grid, cards: scene.grid.cards.map((c) => (c.image !== undefined && c.image >= images ? { ...c, image: undefined } : c)) };
  if (scene.grid?.mode === "montage") Object.assign(scene, readableMontage(scene, bpm));
  if (scene.object && scene.object.image !== undefined && scene.object.image >= images) scene.object = { ...scene.object, image: undefined };
  return scene;
}

/**
 * Montaj kartı bir tempo adımı görünür: okunmayacak gövde metni atılır (montaj kartı bir bakışta okunur, rhythm.md §5;
 * gerçek filmde vuruşta değişen kartlara "Direct device sync" gibi satırlar yazılmıştı), başlık bile okunmuyorsa tempo
 * okunacak en hızlı adıma yavaşlar.
 */
function readableMontage(scene: MotionScene, bpm: number): Pick<MotionScene, "grid" | "pace"> {
  const step = (pace: MotionScene["pace"]) => PACE_BEATS[pace] * beatSec(bpm);
  const words = (text: string) => wordsOf(text).length;
  const cards = scene.grid!.cards.map((c) => (c.body && step(scene.pace) < holdSec(words(c.title) + words(c.body)) ? { ...c, body: undefined } : c));
  const need = Math.max(...cards.map((c) => (words(c.title) > 3 ? holdSec(words(c.title)) : 0)));
  const paces = (["eighth", "beat", "half", "bar"] as const).filter((p) => PACE_BEATS[p] >= PACE_BEATS[scene.pace]);
  const pace = paces.find((p) => step(p) >= need) ?? "bar";
  return { grid: { ...scene.grid!, cards }, pace };
}

/**
 * Yönetmenin filmini kurallara uydurur: geçersiz sahneler atılır, kimlikler m1, m2… olur, ilk sahne sert kesmeyle açılır
 * (ilk kare dolu), parlama en çok iki kez, yazılar okunacak kadar kalır (fitScene), film hedefin MOTION.over katından
 * uzunsa sondan kısalır, ritim çizelgesi filmin ölçü sayısına uyar ve brifte olmayan sayılar temsili işaretlenir.
 */
export function normalizeFilm(raw: MotionFilm, opts: { brief: string; images: number; colors: readonly string[]; targetSec: number; fps: number }): MotionFilm {
  let flashes = 0;
  let scenes = raw.scenes
    .map((s) => cleanScene(s, opts.images, raw.bpm))
    .filter((s): s is MotionScene => !!s)
    .map((s, i) => {
      let transition = i === 0 ? "cut" : s.transition;
      if (transition === "flash" && ++flashes > MOTION.flashes) transition = "cut";
      const scene: MotionScene = { ...s, id: `m${i + 1}`, transition };
      return { ...fitScene(scene, raw.bpm, opts.fps), illustrative: illustrative(scene, opts.brief) };
    });
  if (!scenes.length) throw new Error("motion film has no usable scene");
  const sec = (list: MotionScene[]) => (list.reduce((n, s) => n + s.beats, 0) * beatSec(raw.bpm));
  const limit = Math.min(MOTION.maxSec, opts.targetSec * MOTION.over);
  // Son sahne (çözülme) kalır; ondan önceki sahneler sondan atılır.
  while (scenes.length > 2 && sec(scenes) > limit) scenes.splice(scenes.length - 2, 1);
  scenes = scenes.map((s, i) => ({ ...s, id: `m${i + 1}` }));
  return { ...raw, palette: fixPalette(raw.palette, opts.colors), scenes, sections: fitSections(raw.sections, scenes) };
}

/** Ritim çizelgesi filmin ölçü sayısına uyar: fazlası kesilir, eksik son bölüme eklenir. */
export function fitSections(sections: MotionFilm["sections"], scenes: readonly { beats: number }[]): MotionFilm["sections"] {
  const bars = Math.max(1, Math.ceil(scenes.reduce((n, s) => n + s.beats, 0) / MOTION_FILM.beatsPerBar));
  const out: MotionFilm["sections"] = [];
  let used = 0;
  for (const s of sections) {
    if (used >= bars) break;
    const take = Math.min(s.bars, bars - used);
    out.push({ ...s, bars: take });
    used += take;
  }
  if (!out.length) out.push({ name: "build", bars: 0, energy: 6 });
  out[out.length - 1]!.bars += bars - used;
  return out;
}

/** Anlatım açıkken sahne, sesi ve payı bitene kadar vuruşla uzar (kesme yine vuruşta kalır). */
export function fitToVoice(film: MotionFilm, voiceMs: Readonly<Record<string, number>>): MotionFilm {
  const beatMs = beatSec(film.bpm) * 1000;
  const scenes = film.scenes.map((s) => {
    const v = voiceMs[s.id];
    if (!v) return s;
    const beats = Math.max(s.beats, Math.ceil((v + MOTION.voicePadMs) / beatMs - 1e-6));
    return beats === s.beats ? s : { ...s, beats };
  });
  return { ...film, scenes, sections: fitSections(film.sections, scenes) };
}

/** Senaryo: her sahne bir anlatım birimi (seslendirme aşaması sahne başına çalışır; anlatımsız sahne atlanır). */
export function filmScript(film: MotionFilm) {
  return { scenes: film.scenes.map((s) => ({ id: s.id, beatId: s.id, narration: s.narration, visualIntent: `${s.language} (${s.beats} beats)`, emotion: "neutral", location: "" })) };
}

/** Film sahnelerinin çekimleri (Stüdyo ve aşamalar için): sahne başına bir çekim. */
export function filmShots(film: MotionFilm, fps: number) {
  return sceneFrames(film.scenes, film.bpm, fps).map(({ fromFrame, frames }, i) => {
    const s = film.scenes[i]!;
    const startMs = Math.round((fromFrame / fps) * 1000);
    return {
      id: s.id,
      sceneId: s.id,
      kind: "motion_graphic" as const,
      startMs,
      endMs: Math.round(((fromFrame + frames) / fps) * 1000),
      description: describeScene(s),
      imagePrompt: "",
      motionPrompt: "",
      camera: "static" as const,
    };
  });
}

/** Sahnenin kısa tarifi (Stüdyo kartı ve gözden geçirme): dil + ana metni. */
export function describeScene(s: MotionScene): string {
  const head = s.kinetic?.lines.join(" / ") ?? s.data?.title ?? s.diagram?.title ?? s.diagram?.nodes.map((n) => n.label).join(" → ") ?? s.grid?.title ?? s.grid?.cards.map((c) => c.title).join(", ") ?? s.field?.title ?? s.object?.title ?? s.object?.preset ?? "";
  return `${s.language}: ${head}`;
}

/**
 * Filmin kapak karesi (ms): ilk kinetik yazı sahnesinin sonuna doğru, yazılar oturmuşken (yoksa ilk sahnenin); kapak
 * render edilmiş videonun kendi karesidir (vektör küçük resmi film sahnesi çizemez).
 */
export function filmPosterMs(timeline: Pick<Timeline, "fps" | "visuals">): number {
  const v = timeline.visuals.find((x) => x.film?.language === "kinetic") ?? timeline.visuals[0]!;
  return Math.round(((v.fromFrame + v.durationInFrames * 0.85) / timeline.fps) * 1000);
}

/**
 * Film sahnelerinin başlangıçları (ms), timeline'dan: sahne uzunluğu vuruştan gelir, seslendirmeden değil (anlatımsız
 * filmde sceneOffsets bütün sahneleri 0'a koyuyordu; Short "m12–m14" diye filmin ilk 28 sn'sini kesti, bölüm zamanları
 * da yanlıştı).
 */
export function filmOffsets(timeline: Pick<Timeline, "fps" | "visuals">): Record<string, number> {
  return Object.fromEntries(timeline.visuals.map((v) => [v.shotId, Math.round((v.fromFrame / timeline.fps) * 1000)]));
}

/**
 * Short aralığının ritim çizelgesi: yalnız aralıkla örtüşen bölümler, aralığın başından ölçülür (ilk ve son bölüm
 * örtüştüğü kadar). Bütün filmin çizelgesi Short'ta baştan çalınca duruşun sessizliği yanlış yere düşüyordu.
 */
export function clipSections(sections: MotionFilm["sections"], bpm: number, fromMs: number, toMs: number): MotionFilm["sections"] {
  const barMs = (MOTION_FILM.beatsPerBar * 60000) / bpm;
  const [start, end] = [fromMs / barMs, toMs / barMs];
  const out: MotionFilm["sections"] = [];
  let at = 0;
  for (const s of sections) {
    const overlap = Math.min(end, at + s.bars) - Math.max(start, at);
    if (overlap > 1e-6) out.push({ ...s, bars: Math.max(1, Math.round(overlap)) });
    at += s.bars;
  }
  return out;
}

export interface FilmTimelineInput {
  episodeId: string;
  lang: LanguageCode;
  fps: number;
  width: number;
  height: number;
  film: MotionFilm;
  /** Görsellerin depo anahtarları (film.scenes'teki image dizinleri bunlara bakar). */
  images: readonly string[];
  voice: Readonly<Record<string, { key: string; durationMs: number; words: WordTiming[] }>>;
  captions: boolean;
}

/** Filmin timeline'ı: sahne başına bir görsel (film), anlatım sahne başında, altyazı anlatım kelimelerinden. */
export function filmTimeline(t: FilmTimelineInput): Timeline {
  const spans = sceneFrames(t.film.scenes, t.film.bpm, t.fps);
  const visuals: Timeline["visuals"] = t.film.scenes.map((s, i) => ({
    shotId: s.id,
    assetUrl: "",
    kind: "motion_graphic",
    fromFrame: spans[i]!.fromFrame,
    durationInFrames: spans[i]!.frames,
    ambience: "none",
    playbackRate: 1,
    film: s,
  }));
  const audio: Timeline["audio"] = [];
  const words: WordTiming[] = [];
  t.film.scenes.forEach((s, i) => {
    const v = t.voice[s.id];
    if (!v) return;
    const atMs = (spans[i]!.fromFrame / t.fps) * 1000;
    audio.push({ role: "voice", assetUrl: v.key, fromFrame: spans[i]!.fromFrame, durationInFrames: Math.max(1, Math.round((v.durationMs / 1000) * t.fps)), volume: 1 });
    words.push(...v.words.map((w) => ({ ...w, startMs: Math.round(w.startMs + atMs), endMs: Math.round(w.endMs + atMs) })));
  });
  const end = spans.reduce((a, s) => Math.max(a, s.fromFrame + s.frames), 0);
  return {
    episodeId: t.episodeId,
    lang: t.lang,
    fps: t.fps,
    width: t.width,
    height: t.height,
    durationInFrames: Math.max(1, end),
    visuals,
    audio,
    captions: t.captions ? words : [],
    speech: words,
    vectorAssets: {},
    palette: [t.film.palette.ground, t.film.palette.ink, t.film.palette.accent],
    lineStyle: "outline",
    texture: "none",
    typography: { pair: t.film.type },
    motion: { bpm: t.film.bpm, palette: t.film.palette, type: t.film.type, images: [...t.images], sections: t.film.sections },
  };
}
