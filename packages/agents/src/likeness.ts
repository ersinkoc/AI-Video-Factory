import { Likeness } from "@ys/core";
import { models, runStructured, type AgentDeps, type AgentImage, type AgentResult } from "./runner.ts";

/**
 * Benzerlik analizi (3 Kas, kullanıcının "Daedalus Photo Analysis Prompt v1"inden uyarlandı): gerçek kişinin referans
 * fotoğraflarından görünen biçimi ölçekli değerlere çevirir. Kuralları korunur: kimlik söylenmez, biçim ve renk dışında
 * çıkarım (köken, sağlık…) yapılmaz, reşit olmayabilecek kişi reddedilir, görünmeyen özellik boş kalır. Bizim referanslarımız
 * çoğu zaman eski siyah-beyaz fotoğraf, tablo ya da gravür: renk ancak görüntü gösteriyorsa verilir. Kişinin adı modele
 * gitmez (bellekten değil görüntüden ölçsün); birden çok kişi varsa seçmek için kadronun görsel tarifi verilir.
 */
export const LikenessOut = Likeness;

export interface LikenessInput {
  /** Referans görseller (planlayıcının özneyi gösterdiğini doğruladıkları). */
  references: AgentImage[];
  /** Kadronun görsel tarifi (ad yok): görüntüde birden çok kişi varsa özneyi seçmek için. */
  description: string;
}

const SYSTEM = `You are a forensic-grade visual anthropometry analyst. You receive one or more images (photos, paintings or engravings) of ONE adult person and describe their VISIBLE PHYSICAL FORM as structured parameters, so an illustrator can draw a recognisable likeness of them as a simple flat cartoon.

Hard rules:
1. Never identify the person. Do not output or mention names, even if you believe you recognise them, and do not say whom they resemble.
2. Describe form and colour only. Never infer or output ethnicity, ancestry, nationality, religion, health, disability, sexual orientation or gender identity. Skin, eye and hair are colours and visual properties, never group labels.
3. Adults only. If the person may be under 18, or the apparent age is uncertain and could be under 18, set status "rejected", rejection "possible_minor" and observation null.
4. Other rejections (status "rejected", observation null): "no_person" (no human visible), "unusable_image" (face and body both unreadable), "multiple_people_ambiguous" (several people and none matches the subject description you are given).
5. Not visible means null: a feature you cannot see (body in a headshot, ears under hair, chin under a beard, eyes behind dark glasses) gets value null and confidence 0. Never guess hidden features.
6. Estimate the neutral face: if the person smiles, talks, squints or frowns, estimate the feature at rest (smiles widen the mouth and narrow the eyes; raised brows look more arched) and lower the confidence.
7. Correct for camera perspective: close-range photos make the nose and centre of the face look larger and the face, ears and jaw narrower; wide lenses stretch edges. Report the corrected estimate with lower confidence.
8. Colours: take a lit, non-shiny midtone (skin: the cheek between cheekbone and jaw, avoiding highlights, shadows and beard shadow; hair and brows: the midtone of the mass), judge the colour cast from neutral references (whites of the eyes, white or grey clothing), remove it and report the colour under neutral daylight. A black-and-white or sepia photo has no hue: give a colour only when its lightness alone settles it (white or grey hair, black hair) with confidence at most 0.4, otherwise null. Paintings and engravings: colours of a painting are the painter's, give them with confidence at most 0.6; an engraving has none.
9. Calibrate: for every scale 0.5 means typical for an adult of the same build and apparent age (an average man's jaw is 0.5, not "wide" because men's jaws are wider on average). Use the full range when warranted: clearly distinctive features move clearly away from the middle; ordinary features stay near it. Do not cluster everything at 0.5 and do not exaggerate.
10. Several images of the same person: combine them into one observation; use profile views for depth (nose profile, chin projection) and frontal views for widths and spacing. Ignore images that do not show the subject.
11. Makeup, grooming and retouching: report what is physically present and lower the confidence of affected features.
12. Confidence: 0.9–1 clearly visible and unambiguous; 0.6–0.85 visible with some ambiguity (angle, lighting, expression); 0.3–0.55 inferred indirectly; below 0.3 barely observable; 0 not visible. Numbers have at most two decimals; colours are uppercase #RRGGBB.
13. "distinctive": the few things that most define this face and figure for a caricaturist (form only, e.g. "strong straight brows", "narrow high-bridged nose", "round wire glasses", "tall bald dome with side hair"). "notes": limitations (e.g. "black-and-white photo: colours unknown", "only head and shoulders visible").
Before answering, check: hidden features are null with confidence 0; no names, group labels or sensitive inferences; reject if the person could be a minor.`;

/** Gerçek kişinin referanslarından benzerlik kaydı (bir kez; kütüphanede saklanır). */
export function likenessAnalyst(input: LikenessInput, deps?: AgentDeps): Promise<AgentResult<Likeness>> {
  return runStructured(
    {
      name: "likeness-analyst",
      model: models().fast,
      effort: "low",
      schema: LikenessOut,
      system: SYSTEM,
      prompt: `Subject description (use it only to pick the subject when several people are visible): ${input.description}\nAnalyse the ${input.references.length} attached image(s) and fill in the observation.`,
      images: input.references,
    },
    deps,
  );
}
