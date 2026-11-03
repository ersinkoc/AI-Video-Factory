import { describe, expect, it } from "vitest";
import { Likeness, likenessBlock, likenessCues, LikenessObservation, scaleLabel, type LikenessObservation as Obs } from "../src/index.ts";

const leaf = (value: number | null = null, confidence = value === null ? 0 : 0.8) => ({ value, confidence });
const pick = <T extends string>(value: T | null = null, confidence = value === null ? 0 : 0.8) => ({ value, confidence });
const col = (hex: string | null = null, confidence = hex === null ? 0 : 0.8) => ({ hex, confidence });

/** Her özelliği görünmez (boş) bir kayıt; testler yalnız ilgilendiklerini doldurur. */
function blank(): Obs {
  return {
    image: { medium: "color_photo", view: "frontal", quality: "high" },
    apparentAge: { value: null, confidence: 0 },
    build: { weight: leaf(), muscle: leaf(), shoulders: leaf() },
    head: { shape: pick(), faceLength: leaf(), faceWidth: leaf(), foreheadHeight: leaf(), jawWidth: leaf(), jawDefinition: leaf(), chin: pick(), chinProjection: leaf() },
    eyes: { size: leaf(), spacing: leaf(), tilt: leaf(), depth: leaf(), shape: pick(), color: pick() },
    brows: { thickness: leaf(), arch: leaf(), shape: pick(), gap: leaf(), heightAboveEyes: leaf(), color: col() },
    nose: { size: leaf(), length: leaf(), bridgeWidth: leaf(), tipWidth: leaf(), tip: pick(), profile: pick() },
    mouth: { width: leaf(), upperLip: leaf(), lowerLip: leaf() },
    ears: { size: leaf(), protrusion: leaf() },
    skin: { tone: col(), wrinkles: leaf() },
    hair: { length: pick(), texture: pick(), volume: leaf(), baldness: leaf(), hairline: pick(), part: pick(), style: [], color: col(), gray: leaf() },
    facialHair: { beard: pick(), moustache: pick(), color: col() },
    accessories: { glasses: pick(), glassesShape: pick(), glassesFrame: pick(), headwear: pick() },
    distinctive: [],
    notes: [],
  } as Obs;
}

const ok = (o: Obs): Likeness => ({ status: "ok", rejection: null, observation: o });

describe("benzerlik kaydı", () => {
  it("ölçek değeri en yakın çapanın etiketidir (miktar ölçeği sıfırdan başlar)", () => {
    expect(scaleLabel("width", 0.82)).toBe("very wide");
    expect(scaleLabel("width", 0.5)).toBe("average");
    expect(scaleLabel("amount", 0.2)).toBe("slight");
    expect(scaleLabel("gap", 0.05)).toBe("unibrow");
  });

  it("tasarımcıya yalnız güvenilir ve tipikten ayrılan özellikler gider; renkler hex, seçimler okunur, en belirginler sonda", () => {
    const o = blank();
    o.head.shape = pick("rectangular");
    o.head.faceLength = leaf(0.78);
    o.head.jawWidth = leaf(0.55); // tipik: yazılmaz
    o.head.chin = pick("square", 0.5); // güvensiz: yazılmaz
    o.brows.thickness = leaf(0.85);
    o.brows.shape = pick("straight");
    o.brows.color = col("#2b1d14");
    o.eyes.spacing = leaf(0.3, 0.4); // güvensiz
    o.eyes.color = pick("blue");
    o.nose.tip = pick("bulbous");
    o.hair.length = pick("short");
    o.hair.hairline = pick("receding");
    o.hair.baldness = leaf(0.5);
    o.hair.style = ["side_swept"];
    o.hair.color = col("#AAAAAA", 0.3); // rengi güvensiz (siyah-beyaz)
    o.facialHair.beard = pick("none");
    o.facialHair.moustache = pick("walrus");
    o.accessories.glasses = pick("clear");
    o.accessories.glassesShape = pick("round");
    o.accessories.glassesFrame = pick("thin");
    o.accessories.headwear = pick("none");
    o.build.weight = leaf(0.3);
    o.skin.wrinkles = leaf(0.75);
    o.apparentAge = { value: 64, confidence: 0.7 };
    o.distinctive = ["strong straight brows", "walrus moustache"];
    expect(likenessBlock(ok(o)).split("\n")).toEqual([
      "Likeness sheet (measured from the reference photos; 0.5 = typical adult). A face is recognised by what differs from average: draw these clearly, slightly exaggerated like a caricaturist; keep average features plain.",
      "- Face: rectangular, long face",
      "- Brows: very thick, straight, #2B1D14",
      "- Eyes: blue iris",
      "- Nose: bulbous tip",
      "- Hair: short, moderate baldness, receding hairline, side swept",
      "- Facial hair: walrus moustache",
      "- Glasses: clear, round, thin frame",
      "- Build: slim",
      "- Skin: marked wrinkles",
      "- Apparent age: ~64",
      "- Most distinctive: strong straight brows; walrus moustache",
    ]);
    // Kapı saç, sakal, gözlük, başlık ve yapıyı arar; en belirginler önce.
    expect(likenessCues(ok(o))).toEqual([
      "strong straight brows",
      "walrus moustache",
      "hair: short, moderate baldness, receding hairline, side swept",
      "facial hair: walrus moustache",
      "glasses: clear, round, thin frame",
      "build: slim",
    ]);
  });

  it("reddedilen, boş ya da hiçbir şeyi yazılmayan kayıt metin üretmez; yalnız en belirginler yeter", () => {
    const rejected: Likeness = { status: "rejected", rejection: "possible_minor", observation: null };
    expect(likenessBlock(rejected)).toBe("");
    expect(likenessCues(rejected)).toEqual([]);
    expect(likenessBlock(undefined)).toBe("");
    expect(likenessCues(undefined)).toEqual([]);
    expect(likenessBlock(ok(blank()))).toBe("");
    const only = blank();
    only.distinctive = ["tall bald dome"];
    expect(likenessBlock(ok(only)).split("\n").slice(1)).toEqual(["- Most distinctive: tall bald dome"]);
    // En belirgini olmayan kayıt yalnız satırlarını yazar.
    const rows = blank();
    rows.hair.length = pick("long");
    expect(likenessBlock(ok(rows)).split("\n").slice(1)).toEqual(["- Hair: long"]);
    // Gözlük yoksa şekli yazılmaz; güveni düşük yaş yazılmaz.
    const bare = blank();
    bare.accessories.glasses = pick("none");
    bare.accessories.glassesShape = pick("round");
    bare.apparentAge = { value: 40, confidence: 0.3 };
    expect(likenessBlock(ok(bare))).toBe("");
  });

  it("şema: renk #RRGGBB, ölçek 0–1, reddedilende gözlem boş olabilir", () => {
    expect(Likeness.parse({ status: "rejected", rejection: "no_person", observation: null }).observation).toBeNull();
    expect(LikenessObservation.safeParse({ ...blank(), skin: { tone: col("pembe"), wrinkles: leaf() } }).success).toBe(false);
    expect(LikenessObservation.safeParse({ ...blank(), mouth: { width: leaf(1.2), upperLip: leaf(), lowerLip: leaf() } }).success).toBe(false);
    expect(LikenessObservation.parse(blank()).hair.style).toEqual([]);
  });
});
