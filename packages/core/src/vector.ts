import { z } from "zod";
import { FigureSpec } from "./figure.ts";
import { MapLabel } from "./geo.ts";
import { SceneEffect, SceneThree } from "./effects.ts";

/**
 * Vektör modu: Claude sahneyi kısa bir JSON olarak tarif eder, Remotion deterministik bileşenlerle çizer.
 * Tekrar eden her şey (iskelet animasyonu, yazı efektleri, kamera) koddadır; token harcanmaz.
 */

/**
 * Karakter iskeleti: Claude her karakteri bu sabit tuvale ve parça kimlikleriyle çizer. Sürüm 2 (30 Eki):
 * dirsek (forearm), diz (shin) ve kaş eklendi; iç içe gruplar ebeveynle birlikte döner.
 */
export const RIG = {
  version: 2,
  width: 400,
  height: 800,
  /** Parça kimliği → dönme noktası (tuval koordinatı). */
  pivots: {
    head: [200, 250],
    body: [200, 520],
    "arm-l": [140, 300],
    "arm-r": [260, 300],
    "forearm-l": [140, 400],
    "forearm-r": [260, 400],
    /** Bilek (isteğe bağlı, ön kolun içinde): el sallarken kıvrılır, anlatırken avuç döner. */
    "hand-l": [140, 490],
    "hand-r": [260, 490],
    "leg-l": [175, 520],
    "leg-r": [225, 520],
    "shin-l": [175, 630],
    "shin-r": [225, 630],
    brows: [200, 140],
    eyes: [200, 170],
    mouth: [200, 215],
  },
  /** Olmazsa karakter reddedilir; diğer parçalar isteğe bağlı (yoksa o hareket görünmez). */
  required: ["head", "body", "arm-l", "arm-r", "leg-l", "leg-r"],
} as const;
export type RigPart = keyof typeof RIG.pivots;

/**
 * Yan görünüş iskeleti (31 Eki): önden çizilen karakter yana yürürken gerçekçi görünmüyordu. Aynı karakterin sağa
 * bakan ikinci çizimi; parça kimlikleri ön görünüşle aynı (kod aynı pozları uygular), "-l" uzak, "-r" yakın taraftır.
 * Kol ve bacaklar omuz/kalçadan öne-arkaya döner. Bölüm ayarı açıksa yalnız yürüyen karakterler için çizilir.
 */
export const RIG_SIDE = {
  width: RIG.width,
  height: RIG.height,
  pivots: {
    head: [205, 250],
    body: [200, 520],
    "arm-l": [200, 300],
    "arm-r": [200, 300],
    "forearm-l": [200, 400],
    "forearm-r": [200, 400],
    "hand-l": [200, 490],
    "hand-r": [200, 490],
    "leg-l": [200, 520],
    "leg-r": [200, 520],
    "shin-l": [200, 630],
    "shin-r": [200, 630],
    brows: [235, 140],
    eyes: [235, 170],
    mouth: [240, 215],
  },
  required: RIG.required,
} as const satisfies { pivots: Record<RigPart, readonly [number, number]> } & Record<string, unknown>;

/** Timeline'da karakterin yan görünüşünün varlık kimliği: `<karakter>~side`. */
export const sideAssetId = (id: string) => `${id}~side`;

/** Arka planın ters açısı (aynı yerin karşı tarafı): `<arka plan>~rev`. */
export const reverseAssetId = (id: string) => `${id}~rev`;
/** Ters açı kimliğinden asıl arka plan: `l1~rev` → `l1` (başka kimlik olduğu gibi). */
export const baseBackgroundId = (id: string) => id.replace(/~rev$/, "");

export const VectorAssetKind = z.enum(["character", "background", "prop"]);
export type VectorAssetKind = z.infer<typeof VectorAssetKind>;

/**
 * Varlığın fiziksel bilgisi: sahne yerleşimi pikselle değil bunlarla hesaplanır (30 Eki: ayaklar masa üstünde
 * kalıyordu). Eski varlıklarda yoksa türe göre varsayılan kullanılır.
 */
/**
 * Çizim planı: tasarımcı çizmeden önce, referanslara bakan bir ajan tarifi varlık türüne uydurur ve somut bir plana
 * çevirir (30 Eki: "atın üstündeki binici" ayakta duran iskelete çizilemediği için 3 denemede de reddedildi).
 */
export const AssetPlan = z.object({
  /** Bu varlıkta tam olarak çizilecek tek özne (türün kısıtına uydurulmuş). */
  subject: z.string(),
  /** Tarifte olup bu varlığa girmeyenler (başka nesne/kişi, iskeletin yapamayacağı poz): ayrı çizilir ya da atlanır. */
  moved: z.array(z.string()).default([]),
  pose: z.string().default(""),
  silhouette: z.string().default(""),
  parts: z
    .array(z.object({ name: z.string(), count: z.number().int().nullable().default(null), shape: z.string(), colour: z.string(), where: z.string() }))
    .default([]),
  /** Tanınması için mutlaka görünmesi gerekenler; kapı bunlara bakar. */
  cues: z.array(z.string()).default([]),
  /** Bu tür öznede sık yapılan hatalar ("at iki ayak üstünde"). */
  avoid: z.array(z.string()).default([]),
  /** Planlayıcıya göre referanslardan biri özneyi gösteriyor mu (referans yoksa null). */
  referencesMatch: z.boolean().nullable().default(null),
  /** Referanslar özneyi göstermiyorsa planlayıcının önerdiği yeni arama sorgusu. */
  betterQuery: z.string().default(""),
});
export type AssetPlan = z.infer<typeof AssetPlan>;

/** Kalite kapısının sonucu (her SVG kullanılmadan önce). Gerçek özneyse referans görseller ve kaynaklar da tutulur. */
export const AssetCheck = z.object({
  kind: z.enum(["character", "prop", "background"]),
  name: z.string(),
  /** Adı bilmeden bakan denetçinin tahmini ("kahverengi bir köpek"). */
  guess: z.string().default(""),
  recognizable: z.number(),
  fidelity: z.number().optional(),
  /** Karakterde uzuvların puanı (QUALITY_GATE.limbsMin); eski kayıtlarda yok. */
  limbs: z.number().optional(),
  passed: z.boolean(),
  defects: z.array(z.string()).default([]),
  attempts: z.number().int().default(1),
  /** Referans arama sorgusu (Wikipedia/Commons); yoksa referanssız denetlendi. */
  query: z.string().optional(),
  sources: z.array(z.object({ title: z.string(), url: z.string(), license: z.string().optional() })).default([]),
  /** Depodaki referans görsel anahtarları. */
  refs: z.array(z.string()).default([]),
  /** Reddedildiyse en iyi denemenin SVG'si (Stüdyo'da göstermek için; insan kabul etmedikçe üretimde kullanılmaz). */
  rejectedKey: z.string().optional(),
  /** Çizimden önce hazırlanan plan (Stüdyo'da gösterilir). */
  plan: AssetPlan.optional(),
  /**
   * Gerçeklik denetimi kapalı bir bölümde geçti (referans vardı ama sadakat bakılmadı). Gerçeklik açık bölümler bu
   * kaydı güvenmez, yeniden denetler: bir bölümün geçici ayarı paylaşılan kütüphaneye sızmasın.
   */
  fidelitySkipped: z.boolean().optional(),
  /** Varlığın sahibi: kadro kimliği (c1, l2) ya da nesne kimliği (p-horse); insan kararı buna uygulanır. */
  entityId: z.string().optional(),
  /** İnsan kararı her zaman son sözdür: sistemin reddettiğini kabul edebilir, geçirdiğini reddedebilir. */
  override: z
    .object({
      decision: z.enum(["accepted", "rejected"]),
      /** Reddederken tasarımcıya iletilen not. */
      note: z.string().optional(),
      at: z.string(),
    })
    .optional(),
});
export type AssetCheck = z.infer<typeof AssetCheck>;

export const VectorAssetMeta = z.object({
  /** Gerçek yükseklik (metre): insan ~1,7, masa ~0,75, sandalye ~0,9, kitap ~0,25. */
  realHeight: z.number().positive().optional(),
  /** Üstüne bir şey konabilen yüzeyin yüksekliği, varlık boyunun oranı (masa ~0,95, sandalye oturağı ~0,5). */
  surface: z.number().min(0).max(1).optional(),
  /** Yerde durur mu (masa, sandalye, insan) yoksa duvarda/havada mı (saat, pano, lamba). */
  grounded: z.boolean().optional(),
  /** Ayakta üstüne yazılan pano (tahta, kara tahta, kâğıt sehpası): yazı jesti ona da yapılır (layout BOARD). */
  writable: z.boolean().optional(),
  /** Arka planda duvar ile zeminin birleştiği y (px, 1080 tuval). */
  floorY: z.number().optional(),
  /** Koddan üretilen haritada: varlık koordinatlarında etiketler ve sırayla çizilen rota sayısı. */
  labels: z.array(MapLabel).optional(),
  routes: z.number().int().nonnegative().optional(),
  /**
   * Küre haritası: render bunu three.js ile 3D çizer (ışıklı, atmosferli, konuma dönerek gelir). Merkez ve yarıçap
   * SVG'deki ortografik izdüşümle aynı (px, 1920×1080): küre durunca rotalar, işaretler ve etiketler SVG'den birebir
   * oturur. Doku eşdikdörtgen (2:1) SVG; yoksa SVG küre gösterilir.
   */
  globe: z
    .object({
      lon: z.number(),
      lat: z.number(),
      cx: z.number(),
      cy: z.number(),
      r: z.number().positive(),
      texture: z.string(),
    })
    .optional(),
  /**
   * 3D figür tarifi (yalnız karakter): render SVG yerine bunu three.js ile yumuşak ışıklı 3D bir kukla olarak çizer;
   * iskelet pozları aynen uygulanır. SVG yine saklanır (kalite kapısı, küçük resim, eski render'lar).
   */
  figure: FigureSpec.optional(),
  /** 3D figürün saydam PNG önizlemesi (kütüphane anahtarı): Stüdyo'da SVG yerine bu gösterilir. */
  figurePreview: z.string().optional(),
  /** Gerçek veriden üretildi (harita, bayrak): çizgi stili ve zemin temizliği uygulanmaz, olduğu gibi gösterilir. */
  exact: z.boolean().optional(),
  /** Kalite kapısı sonucu; olmayan (eski) varlık kullanılmadan önce denetlenir. */
  check: AssetCheck.optional(),
  /** Karakterin kimliği: kütüphaneden başka bölümlerde tekrar kullanmak için (aynı stil ve çizgi stilinde). */
  identity: z
    .object({
      name: z.string(),
      description: z.string(),
      reference: z.string().optional(),
      pack: z.string().optional(),
      artStyle: z.string(),
      lineStyle: z.string(),
      episodes: z.array(z.string()).default([]),
      /** Genel rol (sunucu, bilim insanı, çocuk…): karakter bankasında konudan bağımsız çizilenler. */
      role: z.string().optional(),
      /** Karakter bankasında doğrudan çizildi (bir bölümün kadrosundan gelmedi). */
      bank: z.boolean().optional(),
      /** Maskotu olduğu seriler: serinin her bölümünün kadrosuna kendiliğinden girer. */
      mascotOf: z.array(z.string()).default([]),
    })
    .optional(),
});
export type VectorAssetMeta = z.infer<typeof VectorAssetMeta>;

export const VectorAsset = z.object({
  id: z.string(),
  kind: VectorAssetKind,
  /** Temizlenmiş SVG (script, olay, dış bağlantı yok). */
  svg: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  meta: VectorAssetMeta.default({}),
});
export type VectorAsset = z.infer<typeof VectorAsset>;

/** Katman ve yazı animasyonları; zaman aralığı çekim süresinin oranı (0–1). */
export const VectorAnimType = z.enum([
  // tüm katman
  "fade_in",
  "fade_out",
  "slide_in",
  "pop",
  "float",
  "sway",
  "pulse",
  "spin",
  "shake",
  "move",
  // elle çiziliyormuş gibi belirme (paper.js ile kontur uzunluğu)
  "draw_on",
  // karakter iskeleti
  "walk",
  "wave",
  "nod",
  "talk",
  "point",
  "shrug",
  "explain",
  "think",
  "cheer",
  "surprised",
  "sit",
  // iş jestleri (3 Kas: inceleme "anlatılan eylem yapılmıyor, karakter kaskatı duruyor")
  "typing",
  "writing",
  "reading",
  "show",
  "clap",
  "hands_on_hips",
  "arms_crossed",
  // etkileşim (3 Kas: inceleme "nesneyi uzatmıyor", "başını sallamıyor")
  "give",
  "shake_head",
  // yazı
  "typewriter",
  "count_up",
  // plaka silinerek açılır, kelimeler sırayla yükselir (GSAP)
  "kinetic",
]);
export type VectorAnimType = z.infer<typeof VectorAnimType>;

/**
 * Kolu meşgul eden jestler; bunlardan biri sürerken (ya da yürürken) kendiliğinden el hareketi yapılmaz. Render ve
 * planlama (anlatılan eylem, pipeline) aynı listeyi kullanır.
 */
export const ARM_GESTURES: VectorAnimType[] = ["wave", "point", "explain", "think", "cheer", "shrug", "surprised", "typing", "writing", "reading", "show", "clap", "hands_on_hips", "arms_crossed", "give"];

export const VectorAnim = z.object({
  type: VectorAnimType,
  start: z.number().min(0).max(1).default(0),
  end: z.number().min(0).max(1).default(1),
  /** slide_in yönü. */
  from: z.enum(["left", "right", "top", "bottom"]).optional(),
  /** move/walk hedefi (1920×1080 tuval). */
  toX: z.number().optional(),
  toY: z.number().optional(),
  /** point/give hedefi: aynı çekimdeki katmanın indeksi (yoksa point'te yanındaki en yakın şey, give'de en yakın kişi). */
  target: z.number().int().nonnegative().optional(),
});
export type VectorAnim = z.infer<typeof VectorAnim>;

/** Karakterin yüz ifadesi ve duruşu; kaş, göz, ağız ve baş koddan ayarlanır (jestlerle birlikte çalışır). */
export const VectorExpression = z.enum(["neutral", "happy", "sad", "angry", "worried", "surprised", "thinking"]);
export type VectorExpression = z.infer<typeof VectorExpression>;

/**
 * Ekranlı ya da yazı yüzeyli nesnenin (bilgisayar, televizyon, dev ekran, telefon, tahta) bu çekimde gösterdiği (4 Kas,
 * inceleme: ekranlı nesne bulunan 131 çekimin 54'ünde "ekran boş", "kod yok", "Gates'in yüzü dev ekranda değil"; tasarımcı
 * ekranı bir kez çizer, aynı monitör her çekimde başka şey göstermeli). Kod bunu çizimin kendi ekranının üstüne çizer.
 */
export const ScreenKind = z.enum(["text", "code", "terminal", "web", "search", "chat"]);
export type ScreenKind = z.infer<typeof ScreenKind>;
export const VectorScreen = z
  .object({
    kind: ScreenKind.default("text").describe(
      "code: program text in its real language; terminal: a command line; web: a web page; search: a search box (title = the query, lines = results); chat: a conversation (lines alternate sides); text: a slide, headline, scoreboard, caption or the writing on a board",
    ),
    title: z.string().optional().describe("Short heading: file name, page title, search query or headline (episode language; names as written)"),
    lines: z.array(z.string()).default([]).describe("At most 6 short lines (episode language; code in its own language)"),
    person: z.string().optional().describe("Id of a cast character whose face is on the screen (a broadcast, a video call)"),
  })
  .describe("What this layer's display or board shows in this shot; only for a prop with a screen or a writing surface");
export type VectorScreen = z.infer<typeof VectorScreen>;

/**
 * Konuşma ya da düşünce balonu (5 Kas, inceleme: "konuşma balonu boş"; yönetmen boş bir balon simgesi istiyordu, içine söz
 * yazacak bir şey yoktu). Söz konuşan karakterin katmanında; balonu kod başın yanına çizer (video bubble.ts).
 */
export const VectorSay = z
  .object({
    text: z.string().describe("The words in the bubble: what this character says or thinks, at most 8 words, in the episode language (names as written); never the narration sentence"),
    kind: z.enum(["speech", "thought"]).default("speech").describe("speech: said aloud (tail to the mouth); thought: thought silently (a cloud with small circles)"),
    start: z.number().min(0).max(1).default(0.15).describe("When the bubble opens (fraction of the shot)"),
    end: z.number().min(0).max(1).default(0.9).describe("When it closes"),
  })
  .describe("A speech or thought bubble beside this character's head; only for a character");
export type VectorSay = z.infer<typeof VectorSay>;

export const VectorLayer = z.object({
  asset: z.string(),
  /** Katmanın alt-orta noktası (x), 1920×1080 tuvalde. */
  x: z.number(),
  /**
   * Sahnedeki derinlik: 0 kameraya en yakın, 1 odanın dibi. Verilirse ayağın bastığı y, perspektif ölçeği ve boy
   * koddan hesaplanır; yerdeki her şey (insan, mobilya) böyle yerleştirilir.
   */
  depth: z.number().min(0).max(1).optional(),
  /** Başka bir katmanın (indeks) üstünde: nesne masanın yüzeyinde, karakter sandalyede oturur. */
  on: z.number().int().nonnegative().optional(),
  /** Bu nesneyi elinde tutan karakter katmanı (indeks); nesne eli takip eder. */
  heldBy: z.number().int().nonnegative().optional(),
  /** Duvardaki/havadaki öğeler için alt-orta y ve boy (px). Yerdeki öğelerde kullanılmaz. */
  y: z.number().optional(),
  height: z.number().positive().optional(),
  /** Çizim sırasını elle belirlemek için; yoksa derinlikten. */
  z: z.number().optional(),
  flip: z.boolean().default(false),
  rotate: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  anims: z.array(VectorAnim).default([]),
  /** Sadece karakterler: çekim boyunca yüz ifadesi (anlatımın duygusu). */
  expression: VectorExpression.optional(),
  screen: VectorScreen.optional(),
  say: VectorSay.optional(),
});
export type VectorLayer = z.infer<typeof VectorLayer>;

export const VectorTextStyle = z.enum(["title", "subtitle", "label", "number", "quote"]);

export const VectorText = z.object({
  text: z.string(),
  /** Yazının merkezi, 1920×1080 tuvalde. */
  x: z.number(),
  y: z.number(),
  style: VectorTextStyle.default("label"),
  color: z.string().optional(),
  anims: z.array(VectorAnim).default([]),
});
export type VectorText = z.infer<typeof VectorText>;

/** Etiket bir kişinin adı mı: biri ötekini içeriyorsa (büyük/küçük harf duyarsız; "Babbage" ↔ "Charles Babbage"). */
export function namesMatch(name: string, label: string): boolean {
  const a = name.trim().toLocaleLowerCase("tr");
  const b = label.trim().toLocaleLowerCase("tr");
  return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a));
}

/** Bölümün çizgi stili: tasarımcıya verilir ve render'da tüm varlıklarda kontur eşitlenir. */
export const LineStyle = z.enum(["outline", "flat", "sketch", "ink"]);
export type LineStyle = z.infer<typeof LineStyle>;

/** Çekimin ışık havası: aynı palet bütün videoda göz yormasın diye sahneye göre renk tonu. */
export const VectorMood = z.enum(["neutral", "day", "warm", "cool", "night", "dramatic"]);
export type VectorMood = z.infer<typeof VectorMood>;

/**
 * Manim tahtası: bilim/matematik anı için formül ve grafik. Model Python yazmaz; bu tarifi kod Manim sahnesine çevirir
 * ve yerelde render eder (saydam klip, sahnenin ortasındaki tahtada oynar). LaTeX izinli komutlarla sınırlıdır.
 */
export const MathSpec = z.object({
  steps: z
    .array(z.string().max(160))
    .max(4)
    .default([])
    .describe("LaTeX math only (no words, ASCII only), shown in turn; each step morphs into the next, e.g. [\"a^2 + b^2 = c^2\", \"c = \\sqrt{a^2 + b^2}\"]"),
  graph: z
    .object({
      kind: z.enum(["line", "bar"]).default("line"),
      // Nokta nesne olarak: [x, y] ikilisi JSON Schema'da dizi biçimli items olur, API 2020-12 diye reddediyordu (2 Kas).
      points: z.array(z.object({ x: z.number(), y: z.number() })).min(2).max(40).describe("Real data points from the narration, x ascending"),
      xLabel: z.string().max(30).optional().describe("Axis label in the episode language"),
      yLabel: z.string().max(30).optional(),
    })
    .optional(),
});
export type MathSpec = z.infer<typeof MathSpec>;

/** Manim tahtasının yeri (1920×1080 tuvalde; render dikey videoda ortalar) ve klibin piksel boyu. */
export const MATH_BOARD = { x: 440, y: 250, width: 1040, height: 560 } as const;

/**
 * Figüranlar (4 Kas; inceleme: "ordu / seyirci / kalabalık" denilen sahnelerde beş kişi duruyordu, kadro dışı insanlar
 * klon ya da yüzsüz hayalet çizimiydi): kadronun arkasında sıra sıra duran isimsiz insanlar, kodla çizilir (video
 * crowd.tsx), ücretsiz. Yönetmen büyüklüğünü, ne yaptığını, kılığını ve başlığını seçer.
 */
export const VectorCrowd = z.object({
  size: z.enum(["group", "crowd"]).default("crowd").describe("group: about 11 people in two rows; crowd: about 34 in three rows"),
  action: z
    .enum(["stand", "listen", "cheer", "applaud", "protest", "advance"])
    .default("stand")
    .describe("What the extras do: stand, listen (heads toward the middle), cheer (arms up), applaud, protest (fists up), advance (march toward the camera)"),
  dress: z.enum(["casual", "formal", "uniform", "robes"]).default("casual").describe("casual clothes, formal suits, one-colour uniforms (soldiers, workers), robes (long historical garments)"),
  headwear: z.enum(["none", "cap", "helmet", "turban", "hat"]).default("none"),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Uniform or robe colour as #rrggbb (e.g. an army's colour); default olive uniforms, varied robes"),
  side: z.enum(["full", "left", "right"]).default("full").describe("Fill the whole width or only one half (keep the other half free for a stage, board or screen)"),
});
export type VectorCrowd = z.infer<typeof VectorCrowd>;

export const VectorShot = z.object({
  effects: z.array(SceneEffect).max(3).optional().describe("Timed PixiJS and compositing accents; keep titles and faces readable"),
  three: z.array(SceneThree).max(2).optional().describe("Procedural Three.js illustrations, staged beside characters"),
  /** Arka plan varlığı; yoksa paletten degrade. */
  background: z.string().optional(),
  mood: VectorMood.default("neutral"),
  layers: z.array(VectorLayer).default([]),
  texts: z.array(VectorText).default([]),
  camera: z
    .object({
      zoomFrom: z.number().default(1),
      zoomTo: z.number().default(1.06),
      panX: z.number().min(-1).max(1).default(0),
      /** Yakın çekimde odak noktası (1920×1080 tuval); yoksa kadraj merkezi. */
      focusX: z.number().optional(),
      focusY: z.number().optional(),
    })
    .default({ zoomFrom: 1, zoomTo: 1.06, panX: 0 }),
  /** Manim tahtası (formül/grafik); tahta sahnenin ortasında, karakterler yanlarında durur. */
  math: MathSpec.optional(),
  /**
   * Büyütme balonu (katman indeksi): anlatılan küçük nesne geniş çekimde de okunsun diye yuvarlak bir pencerede büyük
   * gösterilir, ince bir çizgiyle nesneye bağlanır (3 Kas: inceleme karelerinin %60'ında ana nesne küçük/okunmazdı).
   */
  callout: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Index of a second small object that must also be read (a page, screen, coin, chip, card), shown magnified in a round inset next to the scene"),
  /**
   * Anlatılan nesne (katman indeksi; 4 Kas, inceleme: 380 karenin 164'ünde "wrong_scale", çoğu "ana nesne minik":
   * gerçek boyundaki telefon, kâğıt, ekran geniş çekimde birkaç yüz piksel). Kamera onu okunur boya getirene kadar
   * yaklaşır, kişilerin başları kadrajda kalır; yine küçükse büyütme balonu ona açılır. Yönetmen vermezse planlamada
   * çekimin açıklamasından çıkarılır (pipeline key-prop.ts).
   */
  key: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Index of the object layer this shot is about (the narrated phone, page, screen, machine); code moves the camera in until it reads and magnifies it if still small"),
  crowd: VectorCrowd.optional().describe(
    "Anonymous extras drawn by code in rows at the back (an army, an audience, protesters, a market, a team, a court); the cast stands in front of them",
  ),
});
export type VectorShot = z.infer<typeof VectorShot>;

/**
 * Yalnız keep[i] doğru olan katmanları bırakır; katman indeksine başvuranlar ("on", "heldBy", point "target") kalan
 * katmanlara yeniden eşlenir, atılan katmana işaret eden başvuru bırakılır.
 */
export function keepLayers<L extends VectorLayer>(layers: L[], keep: boolean[]): L[] {
  const remap = new Map<number, number>();
  keep.forEach((k, idx) => k && remap.set(idx, remap.size));
  const ref = (idx: number | undefined) => (idx === undefined ? undefined : remap.get(idx));
  return layers.flatMap((l, idx) =>
    keep[idx] ? [{ ...l, on: ref(l.on), heldBy: ref(l.heldBy), anims: l.anims.map((a) => (a.target === undefined ? a : { ...a, target: ref(a.target) })) }] : [],
  );
}

/**
 * Çekimin katmanlarından yalnız keep[i] olanlar kalır; katman ve çekim düzeyindeki başvurular (balon, anlatılan nesne)
 * yeniden eşlenir, atılan katmana işaret eden bırakılır.
 */
export function keepShotLayers<S extends Pick<VectorShot, "layers" | "callout" | "key">>(spec: S, keep: boolean[]): S {
  const { callout, key, ...rest } = spec;
  const ref = (idx: number | undefined) => (idx !== undefined && keep[idx] ? keep.slice(0, idx).filter(Boolean).length : undefined);
  const c = ref(callout);
  const k = ref(key);
  return { ...rest, layers: keepLayers(spec.layers, keep), ...(c === undefined ? {} : { callout: c }), ...(k === undefined ? {} : { key: k }) } as S;
}

/** Aynı karakter bir çekimde bir kez görünür (bir kişi iki yerde olamaz): sonraki kopyalar atılır. */
export function uniqueCharacters(spec: VectorShot, isCharacter: (asset: string) => boolean): VectorShot {
  const seen = new Set<string>();
  const keep = spec.layers.map((l) => !isCharacter(l.asset) || (!seen.has(l.asset) && Boolean(seen.add(l.asset))));
  return keep.every(Boolean) ? spec : keepShotLayers(spec, keep);
}

/** İzin verilen SVG öğeleri: çizim, degrade, kırpma ve birkaç yumuşak filtre. Geri kalan her şey atılır. */
const ALLOWED_TAGS = new Set(
  [
    "svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "use", "symbol",
    "lineargradient", "radialgradient", "stop", "clippath", "mask", "pattern", "marker", "title", "desc",
    "filter", "fegaussianblur", "feoffset", "feblend", "fecolormatrix", "femerge", "femergenode", "feflood",
    "fecomposite", "fedropshadow",
  ],
);

const ALLOWED_ATTRS = new Set(
  [
    "id", "xmlns", "xmlns:xlink", "viewbox", "preserveaspectratio", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
    "cx", "cy", "r", "rx", "ry", "fx", "fy", "d", "points", "transform", "fill", "fill-opacity", "fill-rule",
    "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
    "stroke-opacity", "stroke-miterlimit", "opacity", "clip-path", "clip-rule", "mask", "filter", "offset",
    "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "spreadmethod", "href", "xlink:href",
    "patternunits", "patterntransform", "maskunits", "clippathunits", "stddeviation", "in", "in2", "result",
    "mode", "values", "type", "dx", "dy", "flood-color", "flood-opacity", "operator", "k1", "k2", "k3", "k4",
    "visibility", "display", "style",
    // Bayraklarda yıldız dizileri (ABD) ve harita rotalarının çizilerek ilerlemesi için.
    "marker-start", "marker-mid", "marker-end", "markerwidth", "markerheight", "markerunits", "refx", "refy", "orient",
    "pathlength",
  ],
);

/** style="" içinde izin verilen CSS özellikleri (sunum öznitelikleriyle aynı küme). */
const STYLE_PROPS = new Set([
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-dashoffset", "stroke-opacity", "stroke-miterlimit", "opacity", "stop-color", "stop-opacity", "display", "visibility",
  "clip-path", "mask", "filter",
]);

/**
 * Öznitelik değeri yalnız iç başvuru (#id) kullanabilir; betik, data: ve dış URL yasak. Varlık (&#..;) ve CSS kaçışı
 * (\75rl) içeren değerler reddedilir: düz metin denetimini atlatıp dış kaynak yükletebiliyorlardı (30 Eki incelemesi).
 */
function safeValue(name: string, value: string): boolean {
  if (/[\\&]/.test(value)) return false;
  const v = value.toLowerCase().replace(/\s+/g, "");
  if (/javascript:|vbscript:|data:|expression\(|@import|behavior:|image-set|src\(|-moz-binding/.test(v)) return false;
  // Her url() yalnız iç başvuru: url(#id).
  for (const u of v.match(/url\([^)]*\)?/g) ?? []) if (!/^url\(['"]?#[\w.:-]+['"]?\)$/.test(u)) return false;
  if ((name === "href" || name === "xlink:href") && !value.trim().startsWith("#")) return false;
  return true;
}

/** style="" izin listesine göre yeniden kurulur; bilinmeyen özellik atılır. */
function safeStyle(value: string): string {
  return value
    .split(";")
    .map((decl) => decl.split(":"))
    .filter(([prop, val]) => prop && val !== undefined && STYLE_PROPS.has(prop.trim().toLowerCase()) && safeValue("style", val))
    .map(([prop, val]) => `${prop!.trim().toLowerCase()}:${val!.trim()}`)
    .join(";");
}

/** url('#a'), url( #a ) → url(#a): kimlik önekleme (prefixSvgIds) tek biçimi tanır. */
const normalizeUrls = (value: string) => value.replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, "url(#$1)");

/**
 * Model çıktısı SVG'yi izin listesiyle yeniden kurar: yalnız bilinen öğe ve öznitelikler kalır; yorum,
 * CDATA, <style>, <script>, <foreignObject>, <image> ve metin düğümleri atılır. Sonuç innerHTML ile
 * gömülebilir. Yalnız ilk <svg>…</svg> bloğu işlenir.
 */
export function sanitizeSvg(raw: string): string {
  const start = raw.search(/<svg[\s>]/i);
  const end = raw.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) throw new Error("SVG bulunamadı");
  const body = raw
    .slice(start, end + "</svg>".length)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    // İçeriği olan tehlikeli öğeler içerikleriyle birlikte atılır.
    .replace(/<(script|style|foreignObject|text|textPath|iframe|object|embed|audio|video|animate\w*|set)\b[\s\S]*?<\/\1\s*>/gi, "");

  const out: string[] = [];
  // Tırnaksız değer tırnak içeremez: aksi halde kapanmamış bir etikette geri izleme üstel büyüyordu.
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:(?:\s+|(?<=["']))[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>/]+))?)*)\s*(\/?)>/g;
  const attr = /([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>/]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(body))) {
    const [, closing, rawName, rawAttrs, selfClosing] = m;
    const name = rawName!.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    if (closing) {
      out.push(`</${rawName}>`);
      continue;
    }
    const attrs: string[] = [];
    let a: RegExpExecArray | null;
    attr.lastIndex = 0;
    // Grup 3 bir `*` niceleyicisini sarar: eşleşmede her zaman (boş da olsa) vardır.
    while ((a = attr.exec(rawAttrs!))) {
      const attrName = a[1]!.toLowerCase();
      let value = a[2] ?? a[3] ?? a[4] ?? "";
      if (!ALLOWED_ATTRS.has(attrName)) continue;
      if (attrName === "style") {
        value = safeStyle(value);
        if (!value) continue;
      } else if (!safeValue(attrName, value)) continue;
      value = normalizeUrls(value);
      attrs.push(`${a[1]}="${value.replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`);
    }
    out.push(`<${rawName}${attrs.length ? ` ${attrs.join(" ")}` : ""}${selfClosing ? "/" : ""}>`);
  }
  const svg = out.join("");
  if (!/^<svg[\s>]/i.test(svg)) throw new Error("SVG bulunamadı");
  return withViewBox(svg);
}

/**
 * Kökte viewBox yoksa genişlik ve yükseklikten (birimsiz ya da px) eklenir (4 Kas): render kökün boyutunu kutuya göre
 * %100 yapar; viewBox'sız çizim kutuya ölçeklenmiyor, doğal pikseliyle taşıyordu. Commons'tan 835 px'lik açık kitap
 * masadaki küçük kitap yerine kişiyi örtüyor, 2475 px'lik dizüstü kutusunun dışında kalıp görünmüyor, 24 px'lik mektup
 * nokta kadar kalıyordu (8 varlık, 21 çekim). Temizlenmiş çıktıda değerler hep çift tırnaklı.
 */
function withViewBox(svg: string): string {
  // Çağıran kökün <svg ile başladığını denetledi; öznitelik grubu boş da olsa eşleşir.
  const attrs = /^<svg((?:\s[^\s=]+="[^"]*")*)/i.exec(svg)![1]!;
  if (/\sviewBox="/i.test(attrs)) return svg;
  const size = (name: string) => Number(new RegExp(`\\s${name}="\\s*(\\d+(?:\\.\\d+)?)\\s*(?:px)?\\s*"`, "i").exec(attrs)?.[1]);
  const [w, h] = [size("width"), size("height")];
  if (!(w > 0 && h > 0)) return svg;
  return `<svg viewBox="0 0 ${w} ${h}"${svg.slice(4)}`;
}
const num = (attrs: string, name: string): number | undefined => {
  const m = new RegExp(`\\s${name}="([-\\d.]+)(%?)"`).exec(attrs);
  if (!m) return undefined;
  return m[2] ? Number.NaN : Number(m[1]);
};

/**
 * Karakter ve nesnelerin arkasına çizilmiş zemini atar: tuvali kaplayan dikdörtgen ya da öznenin arkasındaki
 * büyük daire/elips (30 Eki: sahneye "kutu içinde" giriyorlardı). Yere düşen ince gölge elipsi korunur.
 * Yalnız <defs> sonrası en baştaki üst düzey öğelere bakılır; temizlenmiş (sanitizeSvg) SVG bekler.
 */
export function stripBackdrop(svg: string, size: { width: number; height: number }): string {
  const { width: W, height: H } = size;
  const open = /^<svg[^>]*>/.exec(svg);
  if (!open) return svg;
  let rest = svg.slice(open[0].length);
  let head = open[0];
  const defs = /^<defs\b[\s\S]*?<\/defs>/.exec(rest);
  if (defs) {
    head += defs[0];
    rest = rest.slice(defs[0].length);
  }
  const kept: string[] = [];
  for (let i = 0; i < 4; i++) {
    const el = /^<(rect|circle|ellipse)\b([^>]*)\/>/.exec(rest);
    if (!el) break;
    const [whole, tag, attrs = ""] = el;
    const w = num(attrs, "width");
    const h = num(attrs, "height");
    const r = num(attrs, "r");
    const rx = num(attrs, "rx");
    const ry = num(attrs, "ry");
    const fullRect = tag === "rect" && (Number.isNaN(w) || (w ?? 0) >= W * 0.9) && (Number.isNaN(h) || (h ?? 0) >= H * 0.9);
    const bigCircle = tag === "circle" && (r ?? 0) >= Math.min(W, H) * 0.35;
    const bigEllipse = tag === "ellipse" && (rx ?? 0) >= W * 0.35 && (ry ?? 0) >= H * 0.2;
    const shadow = tag === "ellipse" && (ry ?? 0) < H * 0.06;
    if (fullRect || bigCircle || bigEllipse) {
      rest = rest.slice(whole.length);
      continue;
    }
    if (!shadow) break;
    kept.push(whole);
    rest = rest.slice(whole.length);
  }
  return head + kept.join("") + rest;
}
/**
 * Aynı SVG bir karede birden çok kez gömülünce kimlikler çakışır; her örneğin kimlik ve
 * başvurularına önek eklenir (url(#x), href="#x").
 */
export function prefixSvgIds(svg: string, prefix: string): string {
  return svg
    .replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, `url(#${prefix}$2)`)
    .replace(/(href|xlink:href)="#([^"]+)"/g, `$1="#${prefix}$2"`);
}

/** viewBox'tan boyut; yoksa width/height özniteliklerinden. */
export function svgSize(svg: string): { width: number; height: number } {
  const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
  const w = /\bwidth="([\d.]+)/.exec(svg);
  const h = /\bheight="([\d.]+)/.exec(svg);
  if (w && h) return { width: Number(w[1]), height: Number(h[1]) };
  throw new Error("SVG boyutu yok (viewBox gerekli)");
}

const darkColor = (value: string): boolean => {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  if (!m) return /^(black|#000)$/i.test(value.trim());
  const hex = m[1]!.length === 3 ? [...m[1]!].map((ch) => ch + ch).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! < 90;
};

/**
 * Çizgi stilini tüm varlıklarda eşitler (farklı çağrılarda çizilen karakterler aynı elden çıkmış gibi dursun).
 * Temizlenmiş SVG bekler. outline/sketch: koyu konturlar tek renge; ink: koyu konturlar siyah ve kalın;
 * flat: dolgulu şekillerin konturu atılır (yalnız fill="none" çizgiler — ağız, kaş gibi — kalır).
 */
export function applyLineStyle(svg: string, style: LineStyle): string {
  // Düz stilde grubun koyu konturu silinir; ama içindeki fill="none" çizgiler (ağız, kaş) konturu gruptan miras alır,
  // silinince görünmez olurlardı: grup konturu önce o çizgilere taşınır.
  const inherited: (string | undefined)[] = [];
  return svg.replace(/<(\/?)(path|rect|circle|ellipse|polygon|polyline|line|g)\b([^>]*?)(\/?)>/g, (whole, closing: string, tag: string, attrs: string, close: string) => {
    if (closing) {
      if (tag === "g") inherited.pop();
      return whole;
    }
    const parent = inherited.at(-1);
    const stroke = /\sstroke="([^"]*)"/.exec(attrs)?.[1];
    const fillNone = /\sfill="none"/.test(attrs);
    let next = attrs;
    if (style === "flat") {
      // Yalnız koyu stroke="" taşıyan grupta çağrılır: eşleşme her zaman vardır.
      const strokeAttrs = (a: string) => a.match(/\sstroke(-width|-linejoin|-linecap|-opacity)?="[^"]*"/g)!.join("");
      if (tag === "g") {
        const dark = stroke && stroke !== "none" && darkColor(stroke);
        const carried = dark ? strokeAttrs(attrs) : parent;
        if (!close) inherited.push(stroke === "none" ? undefined : carried);
        if (dark) next = next.replace(/\sstroke(-width|-linejoin|-linecap|-opacity)?="[^"]*"/g, "");
        return next === attrs ? whole : `<${tag}${next}${close}>`;
      }
      if (!stroke) return fillNone && parent ? `<${tag}${attrs}${parent}${close}>` : whole;
      if (stroke === "none" || fillNone || !darkColor(stroke)) return whole;
      next = next.replace(/\sstroke(-width|-linejoin|-linecap|-opacity)?="[^"]*"/g, "");
      return `<${tag}${next}${close}>`;
    }
    if (tag === "g" && !close) inherited.push(undefined);
    if (!stroke || stroke === "none") return whole;
    if (darkColor(stroke)) {
      const color = style === "ink" ? "#111014" : "#1d1a24";
      next = next.replace(/\sstroke="[^"]*"/, ` stroke="${color}"`);
      if (style === "ink") {
        next = next.replace(/\sstroke-width="([\d.]+)"/, (_m, w: string) => ` stroke-width="${(Number(w) * 1.5).toFixed(1)}"`);
        if (!/stroke-linecap/.test(next)) next += ' stroke-linecap="round"';
        if (!/stroke-linejoin/.test(next)) next += ' stroke-linejoin="round"';
      }
    }
    return `<${tag}${next}${close}>`;
  });
}
