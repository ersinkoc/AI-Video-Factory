/**
 * Stüdyo kuralları: kalite kapısının eşikleri tek yerde. Pipeline bu sayılarla karar verir, Stüdyo'nun Kurallar
 * sayfası aynı sayıları gösterir; yazılı kural ile çalışan kural ayrışamaz.
 * 30 Eki kararı: "at gibi olmayan at" ya da hiçbir şeye benzemeyen SVG asla doğrudan kullanılmaz.
 */

export type GatedKind = "character" | "prop" | "background";

export const QUALITY_GATE = {
  /**
   * Tanınırlık alt sınırı (0–10): adı söylenmeden bakan biri bir saniyede ne olduğunu anlamalı. Arka planlar bilerek
   * boş oda kabuğudur; onlarda "tutarlı ve hangi tür mekân olduğu anlaşılıyor" yeterli.
   */
  recognizableMin: { character: 7, prop: 7, background: 5 } satisfies Record<GatedKind, number>,
  /** Gerçek bir özne (referans görselli) için referansa sadakat alt sınırı (0–10). */
  fidelityMin: 6,
  /**
   * İskeletli karakterde uzuvların alt sınırı (0–10): kollar, eller ve bacaklar bükülüp sallanırken doğal görünecek mi
   * (4 Kas, Uçak bölümü: Charlie Taylor'ın ön kolları ayrı borular, elleri eldiven gibi, yağ lekeleri koyu yamalar;
   * kapı kusuru yazdı ama tanınırlık 7 ve sadakat 6 ile geçirdi, her jestte göze battı).
   */
  limbsMin: 7,
  /** Bir varlık en çok kaç kez çizilir (ilk çizim + kusur listesiyle yeniden çizimler). */
  maxDraws: 3,
  /**
   * Umutsuz varlık: ilk iki çizimin ikisi de bu tanınırlığı geçemediyse üçüncüsü çizilmez (31 Eki üretim verisi: bu
   * durumda üçüncü deneme 16'da 0 kez geçti). En iyi deneme insan kararına kalır.
   */
  hopelessAtMost: 4,
  /** Referans görsel sayısı üst sınırı (Wikipedia + Commons). */
  maxReferences: 3,
  /**
   * Ana nesne: en az bu kadar çekimde geçen nesne reddedilirse bir kez daha, sade ve ikon gibi bir tarifle çizilir; o da
   * geçemezse onu kullanan sahneler onsuz yeniden planlanır. Eskiden sessizce çekimlerden düşüyordu (3 Kas üretim
   * verisi: BASIC'in teleprinter'ı 14, Gural'ın tabağı 12, DNA'nın röntgeni 7 çekimde planlıydı; kapıda 5–6/10 ile
   * kalmışlardı, sahneler "boş odada kolları açık iki kişi"ye döndü).
   */
  keyPropShots: 2,
} as const;

/**
 * Render öncesi taslak denetimi (12 Kas, kullanıcı: "her sahnede kontrol edilecekleri gerçekten kontrol etsin, 10 üzerinden 8
 * ve üstünü şart koşalım"). Denetçi her kare için kontrol listesinin her maddesine kanıtlı karar verir, puanı kod hesaplar
 * (`checklistScore`). Bir sahne ancak her karesi denetlenmiş ve `passAtLeast` almışsa geçer; geçemeyen her sahne `rounds`
 * tura kadar yeniden planlanır, yine geçemeyen varsa render yapımcının açık onayını bekler (otomatik onay da durur).
 * Önceki düzen (en kötü kare ≤ 4, sahnelerin en çok %25'i, 2 tur) tek bir genel puana bakıyordu: 41 bölümün 2049 karesinin
 * %87'si 4–6 almış, yalnız 7'si 8'e ulaşmıştı.
 */
export const DRAFT_REVIEW = {
  /** Bir karenin geçmesi için gereken puan (kontrol listesinden: ağır kusur yok, en çok iki hafif kusur). */
  passAtLeast: 8,
  /** Puan: 10'dan başlar, her ağır kusur bu kadar, her hafif kusur `minor` kadar düşürür (en az 0). */
  major: 3,
  minor: 1,
  /** Eski (kontrol listesiz, tek genel puanlı) incelemelerde zayıf sayılan üst sınır; Stüdyo eski bölümlerde bunu kullanır. */
  badAtMost: 4,
  /**
   * Düzeltme turu: her turdan sonra yeniden planlanan sahnelerin kareleri yeniden denetlenir (render öncesi son kontrol),
   * kötüleşen sahnenin eski planı geri gelir, hâlâ geçemeyenler bir sonraki turda yeniden denenir.
   */
  rounds: 3,
  /** Kare denetçisine bir seferde gönderilen kare (her kare için bütün liste yazılır; bozuk yanıt daha az kare kaybettirir). */
  batch: 4,
} as const;

/**
 * Kontrol listesi rubriğinin sürümü. Yalnız bu sürümle yapılmış inceleme render kapısını tutar: eski bölümlerin tek
 * genel puanlı incelemeleri (4–6) yeni şarta göre okunmaz, altyazı/müzik değiştirince eski bölüm durmaz.
 */
export const REVIEW_RUBRIC = 1;

/** Bir karenin denetim kaydı (kontrol listesiyle yapıldıysa `checks` vardır). */
export interface ShotReviewRecord {
  score: number;
  issues: { type: string; detail: string }[];
  checks?: Record<string, { verdict: "pass" | "fail" | "na"; evidence: string }>;
}

/**
 * Kare geçti mi. Kontrol listeli kayıtta puan `passAtLeast` ve üstü olmalı; eski kayıtta eski sınır (`badAtMost` üstü).
 * Kaydı olmayan kare geçmiş sayılmaz.
 */
export function shotPasses(record: ShotReviewRecord | undefined): boolean {
  if (!record) return false;
  return record.checks ? record.score >= DRAFT_REVIEW.passAtLeast : record.score > DRAFT_REVIEW.badAtMost;
}

/** Barajı geçemeyen sahne: en kötü denetlenmiş kare (yoksa null) ve denetlenemeyen kare sayısı. */
export interface SceneBelow {
  sceneId: string;
  worst: number | null;
  unreviewed: number;
}

/**
 * Kontrol listeli bir incelemede barajı geçemeyen sahneler, çekim sırasıyla. Sahnenin tek bir karesi bile denetlenmemiş ya
 * da `passAtLeast` altındaysa sahne geçemez. Rubriksiz (eski) incelemede boş döner: eski bölümler kapıda durmaz.
 */
export function scenesBelow(
  shots: readonly { id: string; sceneId: string }[],
  review: { rubric?: number; shots: Record<string, ShotReviewRecord> } | undefined,
): SceneBelow[] {
  if (!review || review.rubric !== REVIEW_RUBRIC) return [];
  const out = new Map<string, SceneBelow>();
  for (const s of shots) {
    const r = review.shots[s.id];
    if (shotPasses(r)) continue;
    const row = out.get(s.sceneId) ?? out.set(s.sceneId, { sceneId: s.sceneId, worst: null, unreviewed: 0 }).get(s.sceneId)!;
    if (!r) row.unreviewed++;
    else row.worst = row.worst === null ? r.score : Math.min(row.worst, r.score);
  }
  return [...out.values()];
}

/**
 * Animasyon denetimi (video/src/lint.ts, 3 Kas): render'dan önce her vektör çekim render'ın kurgusuyla ölçülür (ücretsiz).
 * İzleyicinin göreceği hatası (yarım ya da örtülen yüz, çizilemeyen nesne, gösterilemeyen iş, boş kadraj) kalan sahneler
 * bir tur yeniden planlanır: en çok sahnelerin maxShare'i (en az 1), en çok hatalıdan başlanarak.
 */
export const ANIMATION_LINT = { maxShare: 0.5 } as const;

/** Ekrandaki yazılar: aynı anda en çok kaç tane ve hangi dikey bant (alttaki ~%25 altyazının). */
export const TEXT_RULES = { maxTexts: 2, top: 60, bottom: 800 } as const;

/**
 * Dikey videoda (Shorts, Reels, TikTok; 1080×1920) platform arayüzünün kapladığı kenarlar, px: üstte başlık/arama,
 * altta açıklama ve müzik satırı, sağda beğeni/yorum düğmeleri. Altyazı ve etiketler bunların dışına konur.
 */
export const VERTICAL_SAFE = { top: 250, bottom: 420, right: 150 } as const;

/**
 * Hikâye nesnesinin okunabilir en kısa "en uzun kenarı" (m, derinlik ölçeğiyle çarpılır). Fiziksel olarak doğru ama
 * ekranda 15 px kalan not, kitap, çip görünmez (30 Eki denemesi); çizgi filmdeki gibi abartılır. air: duvarda/havada
 * sunulan nesne, elde gösterilen gibi (4 Kas yakın çekim denetimi: kişinin yanında havada sunulan telefon 28×51 px'ti).
 */
export const READABLE_SIDE = { held: 0.28, surface: 0.18, floor: 0.14, air: 0.28 } as const;

export interface GateScores {
  recognizable: number;
  /** Referans yoksa undefined. */
  fidelity?: number;
  /** Yalnız karakterde: uzuvlar (eski kayıtlarda yok). */
  limbs?: number;
}

/** Kapı kararı: tanınırlık eşiği, (referans varsa) sadakat eşiği ve (karakterde) uzuv eşiği birlikte sağlanmalı. */
export function gatePasses(kind: GatedKind, s: GateScores): boolean {
  if (s.recognizable < QUALITY_GATE.recognizableMin[kind]) return false;
  if (s.limbs !== undefined && s.limbs < QUALITY_GATE.limbsMin) return false;
  return s.fidelity === undefined || s.fidelity >= QUALITY_GATE.fidelityMin;
}

/** İki deneme arasında daha iyisi: önce geçen, sonra tanınırlık, sonra sadakat. */
export function betterGate(kind: GatedKind, a: GateScores, b: GateScores | undefined): boolean {
  if (!b) return true;
  const pa = gatePasses(kind, a);
  const pb = gatePasses(kind, b);
  if (pa !== pb) return pa;
  return a.recognizable + (a.fidelity ?? 0) + (a.limbs ?? 0) > b.recognizable + (b.fidelity ?? 0) + (b.limbs ?? 0);
}

/** Set eşyası (input.setDressing): mekân başına en çok bu kadar set eşyası seçilir ve çizilir. */
export const SET_PIECES = 2;
