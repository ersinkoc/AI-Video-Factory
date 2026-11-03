import { z } from "zod";

/**
 * Gerçek kişinin benzerlik kaydı (3 Kas, kullanıcının "Daedalus Photo Analysis Prompt v1"inden kısaltıldı): referans
 * fotoğraflardan kişinin görünen biçimi ölçekli, güven puanlı ve renkleri hex olarak çıkarılır. Kalite kapısının gerçek
 * kişilerde çizimi referansa benzerlik puanı ortalama 6,1/10'du (115 karakter); kusurlar tam bu özellikleri anıyordu
 * (saç çizgisi, saç dokusu, gözlük biçimi, yapı, kaş kalınlığı). Tasarımcı, kapı ve 3D figür ajanı bu kaydı okur.
 * Çizimlerimizde baş ~160 px: yalnız çizilebilen özellikler tutulur (burun deliği açısı gibi alanlar yok).
 */

/** Ölçeklerin çapaları (değer → etiket). 0,5 aynı yaş ve yapıdaki yetişkin için tipiktir. */
export const LIKENESS_SCALES = {
  size: [0.1, "very small", 0.3, "small", 0.5, "average", 0.7, "large", 0.9, "very large"],
  width: [0.1, "very narrow", 0.3, "narrow", 0.5, "average", 0.7, "wide", 0.9, "very wide"],
  length: [0.1, "very short", 0.3, "short", 0.5, "average", 0.7, "long", 0.9, "very long"],
  projection: [0.1, "very recessed", 0.3, "recessed", 0.5, "average", 0.7, "prominent", 0.9, "very prominent"],
  thickness: [0.1, "very thin", 0.3, "thin", 0.5, "average", 0.7, "thick", 0.9, "very thick"],
  height: [0.1, "very low", 0.3, "low", 0.5, "average", 0.7, "high", 0.9, "very high"],
  angle: [0.1, "strongly down", 0.3, "down", 0.5, "neutral", 0.7, "up", 0.9, "strongly up"],
  sharpness: [0.1, "very soft", 0.3, "soft", 0.5, "average", 0.7, "defined", 0.9, "very angular"],
  weight: [0.1, "very thin", 0.3, "slim", 0.5, "average", 0.7, "heavy", 0.9, "very heavy"],
  muscle: [0.1, "very low", 0.3, "low", 0.5, "average", 0.7, "athletic", 0.9, "very muscular"],
  spacing: [0.1, "very close-set", 0.3, "close-set", 0.5, "average", 0.7, "wide-set", 0.9, "very wide-set"],
  gap: [0, "unibrow", 0.3, "narrow gap", 0.5, "average gap", 0.7, "wide gap", 0.9, "very wide gap"],
  amount: [0, "none", 0.25, "slight", 0.5, "moderate", 0.75, "marked", 1, "extreme"],
} as const satisfies Record<string, readonly (number | string)[]>;
export type LikenessScale = keyof typeof LIKENESS_SCALES;

/** Tasarımcıya ve kapıya giden kayıttaki eşikler: güveni düşük ya da tipik (ortaya yakın) özellik yazılmaz. */
export const LIKENESS = { minConfidence: 0.6, colorConfidence: 0.5, distinct: 0.15 } as const;

/** Değerin en yakın çapasının etiketi. */
export function scaleLabel(scale: LikenessScale, value: number): string {
  const anchors = LIKENESS_SCALES[scale];
  let best = 0;
  for (let i = 2; i < anchors.length; i += 2) if (Math.abs((anchors[i] as number) - value) < Math.abs((anchors[best] as number) - value)) best = i;
  return anchors[best + 1] as string;
}

const conf = z.number().min(0).max(1).describe("0.9–1 clearly visible; 0.6–0.85 visible with some ambiguity; 0.3–0.55 inferred; 0 not visible");
const scaled = (scale: LikenessScale, what: string) =>
  z
    .object({ value: z.number().min(0).max(1).nullable(), confidence: conf })
    .describe(`${what}. ${scale} scale: ${LIKENESS_SCALES[scale].join(" ")}; null when not visible`);
const choice = <T extends [string, ...string[]]>(values: T, what: string) =>
  z.object({ value: z.enum(values).nullable(), confidence: conf }).describe(`${what}; null when not visible`);
const color = (what: string) =>
  z
    .object({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(), confidence: conf })
    .describe(`${what} as #RRGGBB under neutral daylight; null when not visible or the image has no colour`);

export const LikenessObservation = z.object({
  image: z.object({
    medium: z.enum(["color_photo", "bw_photo", "painting", "drawing_or_engraving", "sculpture", "mixed"]),
    view: z.enum(["frontal", "three_quarter", "profile", "mixed"]),
    quality: z.enum(["high", "medium", "low"]),
  }),
  apparentAge: z.object({ value: z.number().int().min(18).max(110).nullable(), confidence: conf }),
  build: z.object({
    weight: scaled("weight", "Body weight"),
    muscle: scaled("muscle", "Muscularity"),
    shoulders: scaled("width", "Shoulder width"),
  }),
  head: z.object({
    shape: choice(["oval", "round", "square", "rectangular", "triangular", "inverted_triangular", "diamond"], "Overall face shape"),
    faceLength: scaled("length", "Face length"),
    faceWidth: scaled("width", "Face width"),
    foreheadHeight: scaled("height", "Forehead height"),
    jawWidth: scaled("width", "Jaw width"),
    jawDefinition: scaled("sharpness", "Jaw corner definition"),
    chin: choice(["rounded", "pointed", "square", "cleft"], "Chin shape"),
    chinProjection: scaled("projection", "Chin projection"),
  }),
  eyes: z.object({
    size: scaled("size", "Eye size"),
    spacing: scaled("spacing", "Eye spacing"),
    tilt: scaled("angle", "Canthal tilt (outer corner higher = up)"),
    depth: scaled("projection", "Eye depth (deep-set = recessed)"),
    shape: choice(["almond", "round", "hooded", "monolid", "downturned", "upturned", "deep_set", "protruding"], "Eye shape"),
    color: choice(["dark_brown", "brown", "light_brown", "hazel", "amber", "green", "gray", "blue", "light_blue", "mixed"], "Iris colour class"),
  }),
  brows: z.object({
    thickness: scaled("thickness", "Brow thickness"),
    arch: scaled("amount", "Brow arch"),
    shape: choice(["straight", "soft_arch", "high_arch", "angled", "rounded", "s_shaped"], "Brow shape"),
    gap: scaled("gap", "Gap between the brows"),
    heightAboveEyes: scaled("height", "Brow height above the eyes at rest"),
    color: color("Brow colour"),
  }),
  nose: z.object({
    size: scaled("size", "Overall nose size"),
    length: scaled("length", "Nose length"),
    bridgeWidth: scaled("width", "Bridge width"),
    tipWidth: scaled("width", "Tip width"),
    tip: choice(["rounded", "pointed", "bulbous", "flat"], "Tip shape"),
    profile: choice(["straight", "convex", "concave", "wavy"], "Profile shape (profile views only)"),
  }),
  mouth: z.object({
    width: scaled("width", "Mouth width"),
    upperLip: scaled("thickness", "Upper lip fullness"),
    lowerLip: scaled("thickness", "Lower lip fullness"),
  }),
  ears: z.object({
    size: scaled("size", "Ear size"),
    protrusion: scaled("amount", "Ear protrusion"),
  }),
  skin: z.object({
    tone: color("Skin tone (lit cheek midtone)"),
    wrinkles: scaled("amount", "Wrinkles"),
  }),
  hair: z.object({
    length: choice(["shaved", "buzz", "short", "ear_length", "chin_length", "shoulder", "mid_back", "long"], "Hair length"),
    texture: choice(["straight", "wavy", "curly", "coily"], "Hair texture"),
    volume: scaled("amount", "Hair volume"),
    baldness: scaled("amount", "Baldness"),
    hairline: choice(["straight", "rounded", "m_shaped", "receding", "widows_peak"], "Hairline"),
    part: choice(["none", "viewer_left", "viewer_right", "center", "zigzag"], "Parting, as seen in the image"),
    style: z.array(z.string()).max(5).describe("Short free-form style tags, e.g. side_swept, slicked_back, combed_over, fringe, bun"),
    color: color("Hair colour (midtone of the mass)"),
    gray: scaled("amount", "Grey hair"),
  }),
  facialHair: z.object({
    beard: choice(["none", "stubble", "short_boxed", "full", "long", "goatee", "chin_strap", "circle", "van_dyke", "mutton_chops", "other"], "Beard"),
    moustache: choice(["none", "stubble", "natural", "chevron", "pencil", "handlebar", "horseshoe", "walrus", "other"], "Moustache"),
    color: color("Facial hair colour"),
  }),
  accessories: z.object({
    glasses: choice(["none", "clear", "tinted", "sunglasses"], "Glasses"),
    glassesShape: choice(["round", "oval", "rectangular", "square", "aviator", "cat_eye", "browline", "rimless"], "Glasses frame shape; null without glasses"),
    glassesFrame: choice(["thin", "medium", "thick"], "Frame thickness; null without glasses"),
    headwear: choice(["none", "cap", "hat", "top_hat", "beanie", "fez", "turban", "scarf", "other"], "Headwear"),
  }),
  distinctive: z.array(z.string()).max(5).describe("Up to 5 short phrases: what most defines this face and figure visually, form only (e.g. 'strong straight brows', 'narrow high-bridged nose')"),
  notes: z.array(z.string()).max(3).describe("Up to 3 short notes about limitations (e.g. 'black-and-white photo: colours unknown')"),
});
export type LikenessObservation = z.infer<typeof LikenessObservation>;

export const Likeness = z.object({
  status: z.enum(["ok", "rejected"]),
  rejection: z.enum(["possible_minor", "no_person", "unusable_image", "multiple_people_ambiguous"]).nullable(),
  observation: LikenessObservation.nullable().describe("null when rejected"),
});
export type Likeness = z.infer<typeof Likeness>;

type Leaf = { value: number | null; confidence: number };
type Choice<T> = { value: T | null; confidence: number };

const sure = (x: { confidence: number }) => x.confidence >= LIKENESS.minConfidence;
/** Tipikten belirgin uzak, güvenilir ölçek değerinin etiketi (yoksa undefined). */
const distinct = (leaf: Leaf, scale: LikenessScale, noun = "") =>
  leaf.value !== null && sure(leaf) && Math.abs(leaf.value - (scale === "amount" ? 0 : 0.5)) >= LIKENESS.distinct
    ? `${scaleLabel(scale, leaf.value)}${noun ? ` ${noun}` : ""}`
    : undefined;
/** Güvenilir seçim (none hariç), alt çizgisiz. */
const picked = <T extends string>(x: Choice<T>, suffix = "") => (x.value !== null && x.value !== "none" && sure(x) ? `${x.value.replace(/_/g, " ")}${suffix}` : undefined);
const hex = (x: { hex: string | null; confidence: number }) => (x.hex && x.confidence >= LIKENESS.colorConfidence ? x.hex.toUpperCase() : undefined);
const join = (parts: (string | undefined)[]) => parts.filter(Boolean).join(", ");

/** Kaydın satırları: başlık → özellikler (boş satır yazılmaz). */
function lines(o: LikenessObservation): [string, string][] {
  const { head, eyes, brows, nose, mouth, ears, skin, hair, facialHair: fh, accessories: acc, build } = o;
  const glasses = acc.glasses.value && acc.glasses.value !== "none" && sure(acc.glasses);
  const rows: [string, string][] = [
    ["Face", join([picked(head.shape), distinct(head.faceLength, "length", "face"), distinct(head.faceWidth, "width", "face"), distinct(head.foreheadHeight, "height", "forehead"), distinct(head.jawWidth, "width", "jaw"), distinct(head.jawDefinition, "sharpness", "jaw corners"), picked(head.chin, " chin"), distinct(head.chinProjection, "projection", "chin")])],
    ["Brows", join([distinct(brows.thickness, "thickness"), picked(brows.shape), distinct(brows.arch, "amount", "arch"), distinct(brows.gap, "gap"), distinct(brows.heightAboveEyes, "height", "above the eyes"), hex(brows.color)])],
    ["Eyes", join([distinct(eyes.size, "size"), distinct(eyes.spacing, "spacing"), distinct(eyes.tilt, "angle", "outer corners"), distinct(eyes.depth, "projection"), picked(eyes.shape), picked(eyes.color, " iris")])],
    ["Nose", join([distinct(nose.size, "size"), distinct(nose.length, "length"), distinct(nose.bridgeWidth, "width", "bridge"), distinct(nose.tipWidth, "width", "tip"), picked(nose.tip, " tip"), picked(nose.profile, " profile")])],
    ["Mouth", join([distinct(mouth.width, "width"), distinct(mouth.upperLip, "thickness", "upper lip"), distinct(mouth.lowerLip, "thickness", "lower lip")])],
    ["Ears", join([distinct(ears.size, "size"), distinct(ears.protrusion, "amount", "protrusion")])],
    ["Hair", join([picked(hair.length), picked(hair.texture), distinct(hair.volume, "amount", "volume"), distinct(hair.baldness, "amount", "baldness"), picked(hair.hairline, " hairline"), picked(hair.part, " part"), ...hair.style.map((s) => s.replace(/_/g, " ")), hex(hair.color), distinct(hair.gray, "amount", "grey")])],
    ["Facial hair", join([picked(fh.beard, " beard"), picked(fh.moustache, " moustache"), hex(fh.color)])],
    ["Glasses", glasses ? join([acc.glasses.value!, picked(acc.glassesShape), picked(acc.glassesFrame, " frame")]) : ""],
    ["Headwear", join([picked(acc.headwear)])],
    ["Build", join([distinct(build.weight, "weight"), distinct(build.muscle, "muscle", "muscle"), distinct(build.shoulders, "width", "shoulders")])],
    ["Skin", join([hex(skin.tone), distinct(skin.wrinkles, "amount", "wrinkles")])],
    ["Apparent age", o.apparentAge.value !== null && sure(o.apparentAge) ? `~${o.apparentAge.value}` : ""],
  ];
  return rows.filter(([, v]) => v);
}

/**
 * Tasarımcıya giden benzerlik kaydı: yalnız güvenilir ve tipikten ayrılan özellikler (tanınan yüz ortalamadan ayrıldığı
 * yerlerden tanınır; karikatürcü gibi biraz abartılır). Kayıt reddedilmişse ya da yazılacak bir şey yoksa boş.
 */
export function likenessBlock(l: Likeness | undefined): string {
  const o = l?.status === "ok" ? l.observation : null;
  if (!o) return "";
  const rows = lines(o);
  if (!rows.length && !o.distinctive.length) return "";
  return [
    "Likeness sheet (measured from the reference photos; 0.5 = typical adult). A face is recognised by what differs from average: draw these clearly, slightly exaggerated like a caricaturist; keep average features plain.",
    ...rows.map(([k, v]) => `- ${k}: ${v}`),
    ...(o.distinctive.length ? [`- Most distinctive: ${o.distinctive.join("; ")}`] : []),
  ].join("\n");
}

/** Kapının çizimde araması gereken benzerlik ipuçları (en belirgin özellikler önce). */
export function likenessCues(l: Likeness | undefined): string[] {
  const o = l?.status === "ok" ? l.observation : null;
  if (!o) return [];
  const pick = new Set(["Hair", "Facial hair", "Glasses", "Headwear", "Build"]);
  return [...o.distinctive, ...lines(o).filter(([k]) => pick.has(k)).map(([k, v]) => `${k.toLowerCase()}: ${v}`)];
}
