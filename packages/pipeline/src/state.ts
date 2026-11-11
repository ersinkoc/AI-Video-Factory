import type { LintIssue } from "@ys/video/lint";
import type { ShotIntent } from "@ys/core";
import type { ResearchSnapshotSummary } from "./research.ts";
import type { VoiceAuditSummary } from "./voice-audit.ts";
import type { RenderAuditSummary } from "./render-audit.ts";
import type { StyleComparison, StyleReference, styleSamples } from "./style-comparison.ts";
import type { ArchiveImage, ArchiveCandidate } from "@ys/core";
import type { CastOut, LessonTarget, MotionMode, ScriptOut, ShotPlanOut, StoryOut, StyleBibleOut } from "@ys/agents";
import type { Ambience, AssetCheck, BudgetTier, FlagSpec, LineStyle, MapSpec, Msg, Timeline, VectorShot, WordTiming } from "@ys/core";
import { stylePackOf } from "@ys/core";

export type { MotionMode };

export const STAGES = [
  "style",
  "story",
  "script",
  "cast",
  "concept",
  "voice",
  "shots",
  "keyframes",
  "clips",
  "timeline",
  "render",
  /** Yayın paketi: YouTube başlığı, açıklama, bölümler, etiketler ve küçük resim. */
  "package",
  /** Dikey Short: paketin seçtiği sahne aralığı 9:16 olarak yeniden render edilir (API yok). */
  "short",
  /** Render sonrası inceleme: kareler denetlenir, dersler kalıcı deftere yazılır. */
  "review",
] as const;
export type Stage = (typeof STAGES)[number];

/** İnsan onayı gerektiren noktalar ve onaydan sonra açılan ilk aşama. */
export const GATES = {
  script: "cast",
  concept: "voice",
  /**
   * Önizleme onayı (4 Kas, kullanıcı: "render'a otomatik geçmesin, benden onay alsın"): çekimler, önizleme kareleri ve
   * timeline hazır olunca render'dan önce durulur; yapımcı çekimleri inceler, beğenmediğini notla yeniden oluşturur.
   */
  preview: "render",
} as const satisfies Record<string, Stage>;
export type Gate = keyof typeof GATES;

export interface EpisodeInput {
  topic: string;
  lang: string;
  targetSec: number;
  tier: BudgetTier;
  styleHint?: string;
  /** Kaydedilmiş, değişmez özel stil kimliği. */
  customStyleId?: string;
  /** animated: her çekim AI video · mixed: aiClipRatio kadarı · still: sadece hareketlendirilmiş resim. */
  motionMode?: MotionMode;
  /** mixed modda AI video oranı. */
  aiClipRatio: number;
  /** Bölüm harcama tavanı (USD). */
  budgetUsd: number;
  /** TTS ses kimliği (sağlayıcıya özgü). */
  voiceId?: string;
  /** true: onay kapılarında durma (CLI varsayılanı). Stüdyo false kullanır. */
  autoApprove?: boolean;
  /** Vektör modunda çizgi stili (kalın kontur, konturksuz, el çizimi, mürekkep). */
  /** Çizgi stili; verilmezse stil paketinin çizgi stili. */
  lineStyle?: LineStyle;
  /** Seri adı: bölümler seriye göre gruplanır, seri stil paketini ve karakterlerini paylaşır. */
  series?: string;
  /** Stil paketi: "auto" (varsayılan, konuya göre ajan seçer), "custom" (serbest sanat yönetmeni) ya da paket kimliği. */
  stylePack?: string;
  /** Kare kalite kontrolü (görsel model). Varsayılan açık; false ile kapatılır. */
  qa?: boolean;
  /**
   * Gerçeklik denetimi: gerçek bir özne referans görsellerine sadık mı. Varsayılan açık; false ile geçici kapatılır
   * (tanınırlık denetimi her zaman açıktır).
   */
  realism?: boolean;
  /**
   * Vektör modunda yürüyen karakterlere yan görünüş çizilir (karakter başına bir tasarımcı + kapı çağrısı, kütüphanede
   * saklanır); yürürken o çizime döner. Varsayılan kapalı (ek Claude maliyeti).
   */
  sideViews?: boolean;
  /**
   * Vektör modunda çok kullanılan odalara ters açı çizilir (oda başına bir tasarımcı + kapı çağrısı, en çok 3,
   * kütüphanede saklanır); aynı odada art arda gelen çekimler iki açı arasında gider. Verilmezse açık.
   */
  reverseViews?: boolean;
  /**
   * Vektör modunda her mekâna döneme uygun, yere basan en çok iki set eşyası seçilir ve çizilir (kare aşamasında bir
   * set düzenleyici çağrısı + eşya başına tasarımcı ve kapı); kod onları o mekânın geniş/orta çekimlerinde eylemin
   * arkasına koyar (@ys/video setDressing). Verilmezse açık.
   */
  setDressing?: boolean;
  /**
   * Altyazı videoya gömülsün mü. Verilmezse (eski bölümler, CLI) gömülür; Stüdyo formu açıkça seçtirir. Her durumda
   * videonun yanına .srt yazılır (YouTube'a ayrı altyazı olarak yüklenebilir).
   */
  captions?: boolean;
  /**
   * Vektör modunda animasyonlara kareye kilitli efekt sesi (kelime oturması, daktilo, sayaç, pıt, vınlama, kalem):
   * koddan sentezlenir, API yok. Verilmezse açık.
   */
  sfx?: boolean;
  /**
   * Arka plan müziği: koddan sentezlenir (API yok), bölümleri çekimlerin renk havasından, anlatımda kısılır.
   * Verilmezse açık.
   */
  music?: boolean;
  /** Yatay bölümden dikey Short (paketin seçtiği 20–60 sn) yerelde render edilir. Verilmezse açık. */
  short?: boolean;
  /**
   * Karakter bankasından ekrandaki sunucu (kütüphane kimliği): kadroya yeniden çizilmeden girer, anlatımı o konuşur;
   * yönetmen onu çekimlerin çoğuna koyar. Yalnız vektör modunda.
   */
  presenter?: string;
  /** Karakter bankasından kadroya eklenen karakterler (kütüphane kimlikleri); yönetmen uygun sahnelerde kullanır. */
  bankCast?: string[];
  width: number;
  height: number;
  fps: number;
}

export interface SceneVoice {
  key: string;
  mimeType: string;
  durationMs: number;
  /** Sahne içi kelime zamanlamaları (sahne başına göre). */
  words: WordTiming[];
  /** true: sağlayıcı zamanlama vermedi, harf sayısına göre tahmin edildi. */
  estimatedTiming: boolean;
  /** Seslendirilen metin: senaryo değişince eski ses kullanılmasın (yoksa eski kayıt, yeniden üretilmez). */
  text?: string;
  /** TTS'e giden okunuşlu metin, yazılıştan farklıysa (pronounce.ts). */
  spoken?: string;
  /** Üretimde kullanılan editör sözlüğü sürümü ve birleşik kuralların parmak izi. */
  pronunciation?: { revision: number; fingerprint: string };
}

export interface PlannedShotState {
  intent?: ShotIntent;
  id: string;
  sceneId: string;
  kind: "still_motion" | "ai_clip";
  /** Bölüm başına göre. */
  startMs: number;
  endMs: number;
  description: string;
  imagePrompt: string;
  motionPrompt: string;
  camera: "push_in" | "pull_out" | "pan_left" | "pan_right" | "static";
  /** Eski planlarda yok; yoksa "none". */
  ambience?: Ambience;
  /** Vektör modunda sahne tarifi; varsa kare/klip üretilmez. */
  vector?: VectorShot;
  characterIds?: string[];
  locationId?: string;
}

export interface EpisodeReview {
  at: string;
  shots: Record<string, { score: number; issues: { type: string; detail: string }[] }>;
  /** Bu incelemede çıkan genel kurallar (deftere de yazılır). */
  lessons: { target: LessonTarget; rule: string }[];
}

export interface FrameQa {
  score: number;
  issues: { type: string; detail: string }[];
  /** Kaç kez çizildi (1 = ilk deneme kabul edildi). */
  attempts: number;
  passed: boolean;
  /** Denetçinin yeniden çizim için önerisi. */
  fix?: string;
  /** Denetim yapılamadıysa nedeni (ajan hatası, görsel çok büyük…). */
  skipped?: string;
}

export interface AssetRef {
  key: string;
  mimeType: string;
}

export interface ConceptState {
  /** Karakter/mekân kimliği → aday görseller. */
  candidates: Record<string, AssetRef[]>;
  /** Karakter/mekân kimliği → seçilen referans görsel. */
  selected: Record<string, AssetRef>;
  /** Kaçıncı aday turu (yeniden üretimlerde seed değişsin diye). */
  round?: number;
  /** Seçilen referanslarla üretilmiş deneme kareleri. */
  previews?: (AssetRef & { caption: string })[];
}

/** Bir aşamanın son çalışmasının zamanlaması (maliyet, defterden aşamaya göre toplanır). */
export interface StageStat {
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
}

/** Bölüm günlüğünün bir satırı; CLI'dan da Stüdyo'dan da çalışsa kalıcıdır. */
export interface ActivityEntry {
  at: string;
  stage?: Stage;
  level: "stage" | "info" | "warn" | "error";
  /** Türkçe metin (CLI, eski kayıtlar). */
  msg: string;
  /** Çevrilebilir mesaj: varsa Stüdyo bunu seçili dilde gösterir. */
  text?: Msg;
}

/** Durumda tutulan günlük satırı sınırı (state.json büyümesin). */
export const ACTIVITY_LIMIT = 400;

export interface EpisodeError {
  stage: Stage;
  message: string;
  /** Çevrilebilir hata metni (varsa Stüdyo bunu seçili dilde gösterir). */
  text?: Msg;
  at: string;
}

export interface EpisodeState {
  id: string;
  createdAt: string;
  input: EpisodeInput;
  done: Partial<Record<Stage, string>>;
  stats?: Partial<Record<Stage, StageStat>>;
  /** Pipeline'ın son kaydı; çalışan bir aşama uzun süre güncellenmezse süreç düşmüş demektir. */
  heartbeatAt?: string;
  /** Son günlük satırları (en yeni sonda). */
  activity?: ActivityEntry[];
  /** Render ilerlemesi (0–100); sadece render sürerken anlamlı. */
  renderPct?: number;
  /** Son başarısız aşama; stüdyo sunucusu yeniden başlasa da görünür kalsın diye durumda tutulur. */
  lastError?: EpisodeError;
  /** Bölümün anlatıcı sesini üreten sağlayıcı; sahneler arasında ses karışmasın diye sabitlenir. */
  voiceProviderId?: string;
  approvals?: Partial<Record<Gate, string>>;
  /** Pipeline bir onay kapısında durduysa hangisi. */
  waitingFor?: Gate;
  agentCostUsd: number;
  style?: StyleBibleOut;
  story?: StoryOut;
  script?: ScriptOut;
  /** Son elle anlatım düzenlemesi: tam durum parmak izi eşleşirse kayıtlı önceki sürüme dönülebilir. */
  narrationEdit?: { id: string; at: string };
  /** Doktordan önce kaydedilen senarist taslağı (girdilerin parmak iziyle); senaryo aşaması bitince silinir. */
  scriptDraft?: { sig: string; script: ScriptOut };
  cast?: CastOut;
  concept?: ConceptState;
  voice?: Record<string, SceneVoice>;
  /** Konuşma kayıtlarının ayrı denetimi; tam rapor normal yoklama yanıtına eklenmez. */
  voiceAudit?: VoiceAuditSummary;
  /**
   * Yabancı terimlerin seslendirmedeki okunuşu (yazılış → okunuş): telaffuz ajanının bulduğu ya da elle düzeltilen;
   * yerleşik sözlüğün (pronounce.ts LEXICON) üstüne yazar.
   */
  pronunciations?: Record<string, string>;
  /** Ajanın öğrenilmiş kayıtlarından ayrı, editörün bölüm tercihi (en yüksek öncelik). */
  pronunciationOverrides?: Record<string, string>;
  /** İncelenmiş değişiklik: üretimden önce editör kuralları tekrar değişirse yeni önizleme gerekir. */
  pronunciationPlan?: { revision: number; rulesFingerprint: string; scenes: string[]; at: string };
  shotPlan?: ShotPlanOut;
  /**
   * Yarıda kalan vektör çekim planı: sahne → (girdilerin parmak izi, çekimler). Aşama düşerse ödenmiş sahne planları
   * kaybolmasın; girdisi değişmeyen sahne devamda yeniden planlanmaz. Aşama bitince silinir.
   */
  shotPlanDraft?: Record<string, { sig: string; shots: ShotPlanOut["scenes"][number]["shots"] }>;
  shots?: PlannedShotState[];
  keyframes?: Record<string, AssetRef>;
  /** Human-selected real archive inserts; original generated shots stay available for restoration. */
  archives?: Record<string, ArchiveImage>;
  /** İnceleme aşamasının çekim kareleri (stüdyo küçük resmi de bunlar). */
  stills?: Record<string, AssetRef>;
  /** Manim tahtaları: çekim → saydam WebM'in depo anahtarı (timeline aşamasında üretilir). */
  mathBoards?: Record<string, string>;
  /** Render sonrası inceleme sonucu. */
  review?: EpisodeReview;
  /** Yayın paketi (package aşaması): yüklemeye hazır metinler; açıklama bölüm satırları ve hashtag'lerle birlikte. */
  package?: {
    title: string;
    thumbnailText: string;
    description: string;
    tags: string[];
    /** Short'a kesilecek sahne aralığı (dahil) ve başlığı; eski paketlerde yok. */
    short?: { from: string; to: string; title: string };
    at: string;
  };
  /** Dikey Short (short aşaması): videonun yanındaki dosya, başlık, sahneler ve süre. */
  short?: { path: string; title: string; scenes: string[]; sec: number; at: string; exportId?: string; audit?: RenderAuditSummary; auditRanges?: { id: string; startSec: number; endSec: number }[] };
  /** Render öncesi taslak kontrolü: ortalama puan ve yeniden planlanan sahneler. */
  draftReview?: EpisodeReview & { avg: number; revisedScenes: string[] };
  /**
   * Animasyon denetimi (@ys/video/lint): ilk bakışta bulunan görünür hata sayısı, yeniden planlanan sahneler ve son
   * plandaki bulgular (replan: false olanları render kodla düzeltir).
   */
  lint?: { found: number; revisedScenes: string[]; issues: LintIssue[] };
  /** Senaryo doktorunun düzelttiği sorunlar (bölümler arası öğrenme için saklanır). */
  scriptNotes?: string[];
  /** Vektör modunda çekimlerin kullandığı nesneler: kimlik → tarif ve çizildiyse SVG anahtarı. */
  vectorProps?: Record<
    string,
    {
      description: string;
      key?: string;
      kind?: "prop" | "background";
      map?: MapSpec;
      flag?: FlagSpec;
      reference?: string;
      /** Kalite kapısı bu tarifi reddetti: yönetmene sunulmaz, yeniden çizilmez (insan kararı ya da yeni tarif gerekir). */
      rejected?: boolean;
      /** Ana nesne (birden çok çekimde) reddedildi ve sade, ikon gibi bir çizimle bir kez daha denendi. */
      retried?: boolean;
      /** Set eşyası: bu mekânı döşer (set düzenleyici seçti, yönetmene sunulmaz; yerleşimi kod yapar). */
      set?: string;
    }
  >;
  /**
   * Set düzenleyicinin döşediği mekânlar: mekân kimliği → set eşyalarının kimlikleri (vectorProps'ta; boş liste: o
   * yerde yere basan bir şey durmaz). Kayıtlı mekân yeniden sorulmaz.
   */
  sets?: Record<string, string[]>;
  /**
   * Yürüyen karakterlerin yan görünüşleri (input.sideViews): karakter kimliği → ön çizimden türeyen SVG anahtarı;
   * ok false: kapıdan geçemedi (karakter önden yürür, aynı ön çizim için yeniden çizilmez).
   */
  sideViews?: Record<string, { key: string; ok: boolean }>;
  /**
   * Odaların ters açıları (input.reverseViews): arka plan kimliği → asıl çizimden türeyen SVG anahtarı; ok false:
   * kapıdan geçemedi (oda tek açıdan görünür, aynı çizim için yeniden çizilmez). Çekimler `<oda>~rev` ile kullanır.
   */
  backgroundViews?: Record<string, { key: string; ok: boolean }>;
  /** Seçili karakterlerin 3D figür önizlemesi (3D paketler): SVG anahtarı → PNG anahtarı; Stüdyo konsept kartında. */
  figurePreviews?: Record<string, string>;
  /** Kalite kapısı sonuçları (varlık anahtarı → sonuç); reddedilenler de görünür. */
  assetChecks?: Record<string, AssetCheck>;
  /** Elle istenen yeniden çizim sayısı (çekim başına); seed olarak kullanılır. */
  redraws?: Record<string, number>;
  /**
   * Notla yeniden oluşturulacak sahneler (Stüdyo → Çekimler, vektör): sahne → yapımcının notu (boş olabilir), işaret
   * edilen çekimler ve o çekimlerin inceleme bulguları. Kare aşaması yalnız bunları yeniden planlatır, sonra siler.
   */
  replans?: Record<string, { note: string; shots: string[]; findings?: string[]; at: string }>;
  /** Çekim başına kare denetimi sonucu. */
  qa?: Record<string, FrameQa>;
  clips?: Record<string, AssetRef & { durationSec: number }>;
  timeline?: Timeline;
  /** thumbnail: videonun yanındaki küçük resim (1280×720 JPEG), üretilebildiyse. */
  styleReference?: StyleReference;
  render?: { path: string; at: string; exportId?: string; thumbnail?: string; research?: ResearchSnapshotSummary; audit?: RenderAuditSummary; auditRanges?: { id: string; startSec: number; endSec: number }[]; typography?: Timeline["typography"]; styleReference?: StyleReference; styleSampling?: ReturnType<typeof styleSamples>; styleComparison?: StyleComparison; archiveSources?: { shotId: string; source: ArchiveCandidate; key: string; originalSha256?: string; downloadedAt?: string }[] };
}

/** Bu aşamaya geçmek için gereken onay (varsa). */
export function gateBefore(stage: Stage): Gate | undefined {
  return (Object.keys(GATES) as Gate[]).find((g) => GATES[g] === stage);
}

export function isApproved(state: EpisodeState, gate: Gate): boolean {
  return Boolean(state.input.autoApprove || state.approvals?.[gate]);
}

export function motionModeOf(input: EpisodeInput): MotionMode {
  return input.motionMode ?? (input.aiClipRatio > 0 ? "mixed" : "still");
}

/** Bölümün çizgi stili: kullanıcı seçtiyse o, yoksa stil paketininki. */
export function lineStyleOf(state: Pick<EpisodeState, "input" | "style">): LineStyle {
  return state.input.lineStyle ?? state.style?.lineStyle ?? stylePackOf(state.style?.pack)?.lineStyle ?? "outline";
}
