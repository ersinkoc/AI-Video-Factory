import { DRAFT_REVIEW, styleCraftBlock, customStyleBlock } from "@ys/core";
import { z } from "zod";
import { MOTION_REVIEW_POLICY } from "./motion-design.ts";
import { models, runStructured, type AgentDeps, type AgentImage, type AgentResult } from "./runner.ts";

/**
 * Üretim sonrası inceleme: render edilmiş çekim karelerine bakıp kusurları ve genel dersleri çıkarır.
 * Dersler kalıcı kayda yazılır ve sonraki bölümlerde ilgili ajanların talimatına eklenir; orkestratör böylece
 * her bölümden öğrenir.
 */

export const ShotIssueType = z.enum([
  "text_overlap",
  "text_on_subtitles",
  "unreadable_text",
  "cluttered",
  "empty",
  "character_cut_off",
  "character_floating",
  "wrong_scale",
  "backdrop_box",
  "repetitive",
  "off_story",
  "no_action",
  "other",
]);

export const LessonTarget = z.enum(["director", "designer", "script"]);
export type LessonTarget = z.infer<typeof LessonTarget>;

/**
 * Kare kontrol listesi (12 Kas, kullanıcı: "her sahnede kontrol edilecekleri gerçekten kontrol ettiğine ... 8 ve üstünü şart
 * koşalım"). Denetçi eskiden kareye tek bir genel puan ve serbest bir sorun listesi veriyordu; neye baktığı görünmüyordu,
 * puanlar 4–6'da yığılıyordu. Artık her madde için önce karede gördüğünü (kanıt), sonra kararı yazar; puanı kod hesaplar
 * (`checklistScore`). Kimlikler `ShotIssueType` değerleridir: kalan kalite görünümü, bulgular ve dersler aynı türlerle sürer.
 * `always`: "uygulanmaz" denemez (her karede bakılacak şey); `severity`: ağır kusur 8 barajını tek başına geçirmez.
 */
export const REVIEW_CHECKS = [
  { id: "off_story", severity: "major", always: true, ask: "Does the frame show what the shot is about: its subject, its place and the people the intent names? fail when the subject or a named person is missing or the frame shows something else. Smaller mismatches go to other." },
  { id: "empty", severity: "major", always: true, ask: "Is there something meaningful on screen? fail when the frame is mostly bare or shows only an empty backdrop." },
  { id: "character_cut_off", severity: "major", always: false, ask: "Is a head or face cut by the frame edge, a person shown only as a sliver at a side edge, or a lower leg crossed by the bottom edge so that only part of a shin or a foot shows? Legs wholly below the edge in medium and close shots are intended (pass). na when there are no people." },
  { id: "character_floating", severity: "major", always: false, ask: "Do people and objects stand, sit or rest on something? fail when someone or something hangs in the air without a reason (wall items, signs and flying things are fine). na when nothing stands or rests." },
  { id: "backdrop_box", severity: "major", always: false, ask: "Does a character or prop show its own rectangle or disc background around it? na when there are no characters or props." },
  { id: "text_overlap", severity: "major", always: false, ask: "Do on-screen texts (title card, labels, name tags, speech bubbles) overlap each other or cover a face? na when there is no on-screen text." },
  { id: "text_on_subtitles", severity: "major", always: false, ask: "Does an on-screen text sit in the bottom quarter where the subtitles go? na when there is no on-screen text or the video has no burned-in subtitles." },
  { id: "unreadable_text", severity: "minor", always: false, ask: "Can every on-screen text be read: big enough, enough contrast, not cut? na when there is no on-screen text." },
  { id: "wrong_scale", severity: "minor", always: false, ask: "Are people and objects at believable sizes next to each other, and is the object the shot is about big enough to recognise? na when there is a single subject with nothing to compare." },
  { id: "cluttered", severity: "minor", always: true, ask: "Is the frame easy to read: one clear subject, not many elements or a busy background competing with it?" },
  { id: "repetitive", severity: "minor", always: true, ask: "Does it look different enough from the frames listed before it (layout, framing, place)? The first image has nothing before it: pass." },
  { id: "no_action", severity: "minor", always: false, ask: "When the intent or narration says a person does something (points, types, writes, reads, cheers, walks, holds up…), is that action visible? na when no action is described." },
  { id: "other", severity: "minor", always: true, ask: "Anything else a viewer would notice as broken or wrong: a garbled drawing, broken anatomy, an object from the wrong era, a wrong detail the intent names? pass when nothing." },
] as const satisfies readonly { id: z.infer<typeof ShotIssueType>; severity: "major" | "minor"; always: boolean; ask: string }[];
export type CheckId = (typeof REVIEW_CHECKS)[number]["id"];

const Check = z.object({
  evidence: z.string().describe("What you actually see in THIS frame that decides the check: name the thing and where it is (for fail: the problem and where). One short sentence."),
  verdict: z.enum(["pass", "fail", "na"]),
});
export type CheckAnswer = z.infer<typeof Check>;
const Checks = z.object(Object.fromEntries(REVIEW_CHECKS.map((c) => [c.id, Check.describe(c.ask)])) as Record<CheckId, typeof Check>);
export type ShotChecks = z.infer<typeof Checks>;

/** Kanıt sayılmayan, her kareye yazılabilecek geçiştirme yanıtları. */
const GENERIC = /^(ok|okay|fine|good|great|none|nothing( wrong| to report)?|n\/?a|na|pass(ed)?|yes|no|no (issues?|problems?|defects?)( found| seen| visible)?|looks? (fine|good|ok))[.!]?$/i;
/** Kanıtın en kısa uzunluğu (karakter): "No text on screen." gibi bir gözlem sığar, "ok" sığmaz. */
export const MIN_EVIDENCE = 12;

/** Altyazı gömülmüyorsa altyazı alanı maddesi uygulanmaz (denetçi yine de "fail" derse sayılmaz). */
export function settleChecks(checks: ShotChecks, subtitles: boolean): ShotChecks {
  return subtitles ? checks : { ...checks, text_on_subtitles: { evidence: "No burned-in subtitles in this video.", verdict: "na" } };
}

/**
 * Yanıt gerçekten kontrol edilmiş mi: her madde var, kanıtı gözlem (geçiştirme değil), her karede bakılacak madde
 * "uygulanmaz" değil. Sorun varsa nedeni, yoksa undefined. Geçersiz kare denetlenmemiş sayılır (yeniden istenir).
 */
export function checklistProblem(checks: Partial<Record<CheckId, CheckAnswer>> | undefined): string | undefined {
  for (const c of REVIEW_CHECKS) {
    const a = checks?.[c.id];
    if (!a) return `${c.id}: missing`;
    const evidence = a.evidence.trim();
    if (evidence.length < MIN_EVIDENCE || GENERIC.test(evidence)) return `${c.id}: no evidence ("${evidence}")`;
    if (c.always && a.verdict === "na") return `${c.id}: na is not allowed`;
  }
  return undefined;
}

/** Kontrol listesinden puan: 10'dan başlar, ağır kusur DRAFT_REVIEW.major, hafif kusur DRAFT_REVIEW.minor düşürür. */
export function checklistScore(checks: ShotChecks): number {
  const lost = REVIEW_CHECKS.reduce((n, c) => n + (checks[c.id].verdict === "fail" ? (c.severity === "major" ? DRAFT_REVIEW.major : DRAFT_REVIEW.minor) : 0), 0);
  return Math.max(0, 10 - lost);
}

/** Kalan maddeler sorun olarak (bulgular, kalite görünümü, dersler ve yeniden plan notu bunları okur). */
export function checklistIssues(checks: ShotChecks): { type: CheckId; detail: string }[] {
  return REVIEW_CHECKS.filter((c) => checks[c.id].verdict === "fail").map((c) => ({ type: c.id, detail: checks[c.id].evidence.trim() }));
}

export const SceneCriticOut = z.object({
  shots: z.array(
    z.object({
      shotId: z.string(),
      checks: Checks.describe("Every check for this frame, each with evidence from the frame and a verdict"),
    }),
  ),
  lessons: z
    .array(z.object({ target: LessonTarget, rule: z.string().describe("One short imperative rule, in English") }))
    .describe("General rules that would have prevented the problems (not shot-specific), at most 3"),
});
export type SceneCriticOut = z.infer<typeof SceneCriticOut>;

export interface CriticShot {
  shotId: string;
  image: AgentImage;
  /** Çekimin ne göstermesi gerektiği ve o andaki anlatım. */
  intent: string;
}

/**
 * Bir grup çekim karesini denetler (ucuz görsel model). `subtitles` false ise videoda gömülü altyazı yoktur:
 * alt çeyrek resme aittir, orada duran şey kusur sayılmaz. style: bölümün sanat stili ve paleti (4 Kas: denetçiye
 * "flat vector" deniyordu; bilerek tek renkli paketlerin (manga ekran tonu, sepya kum, kurşun kalem) her karesine "soluk,
 * çamurlu palet" yazıyordu: en yeni dört bölümün 92 palet notunun 72'si bu üç paketten. Puan düşüyor, taslak incelemesi
 * düzelmeyecek sahneleri yeniden planlatıyor, "parlak doygun renk kullan" dersi bütün paketlerin tasarımcısına gidiyordu).
 */
export function sceneCritic(
  shots: CriticShot[],
  known: string[],
  deps?: AgentDeps,
  subtitles = true,
  style?: { artStyle: string; palette: string[]; pack?: string; craftPreset?: string; reviewRules?: string[] },
): Promise<AgentResult<SceneCriticOut>> {
  return runStructured(
    {
      name: "scene-critic",
      model: models().cheap,
      effort: "low",
      schema: SceneCriticOut,
      images: shots.map((s) => s.image),
      system: `You review frames of an animated explainer video (${style ? `art style: ${style.artStyle}; palette: ${style.palette.join(", ")}` : "flat vector style"}, ${subtitles ? "subtitles at the bottom" : "no burned-in subtitles: the bottom of the frame belongs to the picture"}). Image N belongs to the N-th shot listed in the prompt.
The channel chose the art style and the palette: a monochrome, sepia, grey, pencil or otherwise limited palette and the style's own texture (grain, screentone, paper, hatching) are intended, not problems. Do not report them and do not give lessons about the palette or the style; report colour only when a subject or a text cannot be told apart from what is behind it.
${MOTION_REVIEW_POLICY}
${styleCraftBlock(style?.craftPreset ?? style?.pack, true)}${customStyleBlock(style, true)}
Check every frame against the whole checklist; for EVERY image answer EVERY check in "checks". For each check, first write the evidence: what you actually see in that frame that decides it (name the thing and where it is; for a fail, the problem and where), then the verdict: pass, fail, or na where the check allows it. Look at the frame for each check; an answer that could be written without looking ("ok", "fine", "no issues") is rejected and the frame is asked again. Every evidence, na included, is a short phrase of at least ${MIN_EVIDENCE} characters naming what you saw, e.g. "There is no on-screen text in this frame." or "Ada stands on the floor beside the desk.", never "None" or "No text.". You give no score: the code counts the failed checks. Fail a check only for a problem a viewer would notice at normal viewing; small imperfections pass. The verdict follows your own evidence: when the evidence names such a problem (something missing, wrong, cut, covered or not matching the narration), the verdict is fail; never describe a problem and pass it.${subtitles ? "" : " This video has no burned-in subtitles: text_on_subtitles is na."}
The checks:
${REVIEW_CHECKS.map((c) => `- ${c.id}: ${c.ask}${c.always ? " (never na)" : ""}`).join("\n")}
Here and above, "report" means fail the matching check, and "do not report" means that check passes for that reason.
The camera behaves like a real lens: in medium and close shots the wall, extras and people far in front of or behind the subject are deliberately soft (depth of field), objects moving fast (sliding in, popping up, shaking) and scene transitions show motion blur, and screens glow slightly. Do not report that softness; report blur only when the subject itself, a speaking person or a text the shot is about cannot be read. A round magnifier inset with a thin dashed pointer is also drawn by code on purpose: it enlarges a small narrated prop (the prop itself stays in place, so the copy is intended). Do not report it as an inset, overlay, disc, duplicate or second focal point and give no lesson against it; report it only when it covers a face, the subject or a text. Shot sizes follow film grammar: a medium shot frames people from the knee, thigh or waist up and a close-up from the chest up, so legs, shins and feet that are wholly below the frame edge are intended there, not character_cut_off; do not write that the legs run off the bottom edge or that the feet or shins are cut off, and give no lesson asking for feet in frame. Report a cut only when a head or face is cut, a person shows as a sliver at a side edge, or the bottom edge crosses a lower leg so that only part of a shin or a foot shows. Names follow documentary practice: code shows a person's name tag where they first appear, so a later frame without a name label is fine; do not report missing name labels and give no lesson asking for them.
lessons: up to 3 general rules (not about a single shot) for the director (layout, texts, mood), the designer (drawing assets) or the script, only if a problem appears in several shots. Skip rules already known:
${known.map((k) => `- ${k}`).join("\n") || "- (none yet)"}`,
      prompt: `${shots.map((s, i) => `Image ${i + 1} = ${s.shotId}: ${s.intent}`).join("\n")}\nAnswer all ${REVIEW_CHECKS.length} checks for each of the ${shots.length} image(s).`,
    },
    deps,
  );
}

export const LessonCuratorOut = z.object({
  rules: z
    .array(
      z.object({
        rule: z.string().describe("One concise imperative rule in English"),
        sources: z.array(z.number().int().nonnegative()).describe("Indexes of the input rules merged into this one"),
      }),
    )
    .max(10),
});
export type LessonCuratorOut = z.infer<typeof LessonCuratorOut>;

/** Birbirine benzeyen dersleri en fazla 10 net kurala birleştirir (defter şişmesin, talimat kısa kalsın). */
export function lessonCurator(target: LessonTarget, rules: string[], deps?: AgentDeps): Promise<AgentResult<LessonCuratorOut>> {
  return runStructured(
    {
      name: "lesson-curator",
      model: models().cheap,
      effort: "low",
      schema: LessonCuratorOut,
      system: `You maintain the rulebook of the ${target} agent in an automated video studio. Merge rules that say the same thing, drop vague ones, and keep at most 10 short, concrete, non-overlapping imperative rules. Every input index must appear in exactly one output rule's sources unless you drop it as vague.`,
      prompt: rules.map((r, i) => `${i}: ${r}`).join("\n"),
    },
    deps,
  );
}

// ---------------- kalite kapısı ----------------

export const AssetGuessOut = z.object({
  guess: z.string().describe("What this drawing shows, in a few plain English words (e.g. 'a brown dog standing', 'a desk with drawers', 'unclear blob')"),
  confidence: z.number().int().min(0).max(10).describe("How sure you are, 10 = obvious at a glance"),
});
export type AssetGuessOut = z.infer<typeof AssetGuessOut>;

/**
 * Kör tanıma: denetçi çizimin ne olduğunu, amaçlanan adı bilmeden söyler. "At" diye çizilen şey "köpek" diye
 * tanınıyorsa kapı geçilmez (adı bilen denetçi iyimser davranır).
 */
export function assetGuess(drawing: AgentImage, deps?: AgentDeps): Promise<AgentResult<AssetGuessOut>> {
  return runStructured(
    {
      name: "asset-guess",
      model: models().cheap,
      effort: "low",
      schema: AssetGuessOut,
      system:
        "You see one flat vector illustration (an asset for an animated video) on a white background. Say plainly what it depicts. If it is an indistinct shape, a scribble or you cannot tell, say so and give low confidence. Do not be generous.",
      prompt: "What does this drawing show?",
      images: [drawing],
    },
    deps,
  );
}

export const AssetGateOut = z.object({
  recognizable: z
    .number()
    .int()
    .min(0)
    .max(10)
    .describe("Would a viewer recognise the intended subject in one second without a caption? 10 = unmistakable, ≤4 = blob, scribble, wrong thing or broken"),
  fidelity: z
    .number()
    .int()
    .min(0)
    .max(10)
    .nullable()
    .describe("Faithfulness to ONE specific real subject (a named person, building, model, artifact) in the references that actually show it: shape, proportions, colours, distinctive parts. null without references, when no reference shows the subject, or when the subject is a generic kind (a desert, a horse, a desk) for which references are only inspiration"),
  limbs: z
    .number()
    .int()
    .min(0)
    .max(10)
    .nullable()
    .describe("Characters only, null for props and places: will the arms, hands and legs look like natural human limbs when the puppet bends and swings them in animation? 10 = tapered, continuous limbs with rounded joints and readable hands with a thumb; ≤6 = limbs like separate tubes or stacked segments, a thick band or gap at the elbow or knee, mitten or blob hands, stumps, wrong length or thickness, or dark stains, patches or marks on the arms, hands or legs that read as wounds"),
  defects: z
    .array(z.string())
    .max(6)
    .describe("Concrete, fixable defects, most important first (e.g. 'horse has 3 legs', 'head merges into the body', 'chip has 5 pins, real one has 8 per side')"),
});
export type AssetGateOut = z.infer<typeof AssetGateOut>;

/**
 * Kalite kapısı: çizim amaçlanan özne olarak tanınıyor mu, anatomisi/yapısı sağlam mı, referans varsa gerçeğe sadık
 * mı. Karar kodda (QUALITY_GATE); bu ajan yalnız puanlar ve kusurları listeler.
 */
export function assetGate(
  input: {
    kind: "character" | "prop" | "background";
    name: string;
    description: string;
    guess: AssetGuessOut;
    drawing: AgentImage;
    references?: AgentImage[];
    /** Kanalın sanat stili ve paleti: paletin dayattığı renk ve stilin basamaklı/eskiz çizgisi kusur sayılmasın. */
    style?: { artStyle: string; palette: string[] };
  },
  deps?: AgentDeps,
): Promise<AgentResult<AssetGateOut>> {
  const refs = input.references ?? [];
  const what =
    input.kind === "character"
      ? "a person (puppet character); check a believable human figure: one head, two arms, two legs, hands at the ends of arms, face features in place, nothing floating or detached. Its arms, forearms, hands and legs are rotated at the shoulders, elbows, wrists, hips and knees in every gesture, so judge them strictly (limbs): what looks acceptable in a still pose looks broken when it moves"
      : input.kind === "background"
        ? "an intentionally EMPTY room shell or place backdrop (furniture is added separately, so emptiness is fine); check that the space reads as the intended kind of place, shapes are coherent and nothing is broken or garbled; a road, railway, runway, river or path must run across the frame from side to side: one receding toward the horizon or a vanishing point is a defect (side-view vehicles look parked across it); in a room, rain, snow or dots scattered over the walls and floor instead of only inside the windows is a defect"
        : "an object, animal or vehicle; check it has the correct parts in the correct number and arrangement (legs, wheels, handles…) and a silhouette that reads at a glance";
  return runStructured(
    {
      name: "asset-gate",
      model: models().cheap,
      effort: "low",
      schema: AssetGateOut,
      system: `You are a strict quality gate for vector assets of an animated explainer channel. Flat, simplified cartoon style is expected and is not a defect. Wrong subject, broken anatomy, missing or extra parts, disconnected pieces and unreadable shapes are defects.
Anatomy and posture must be right for what the subject IS: an animal stands in its natural posture on its real number of legs (a horse on four legs, never upright like a person), a vehicle has its wheels on the ground, a person has human proportions. A subject drawn in an impossible pose or body plan scores recognizable ≤4 even if you can tell what it is meant to be.
Judge recognisability at the level a general viewer can: a niche identity (a specific job, person, model or era) only has to read as its general category WITH the described distinguishing features (a Pony Express rider reads as a young 1860s western rider with a mail bag; the guess "cowboy" is fine if those features are there).
References come from a web search and can be wrong: ignore any reference that does not show the subject (a book page, an unrelated scene). If none of them shows the subject, or the subject is a generic kind rather than one specific real thing, fidelity is null.
The asset is ${what}.${refs.length ? ` The first ${refs.length} image(s) are real reference photos/paintings of the subject; the LAST image is the drawing.` : " The image is the drawing."}`,
      prompt: `Intended subject: ${input.name}
Description: ${input.description}
A viewer who was NOT told the name looked at the drawing and said: "${input.guess.guess}" (confidence ${input.guess.confidence}/10). If that does not match the intended subject, recognizable must be low. If the drawing is a different KIND of thing than the original request (what a magazine cover shows instead of the magazine, a desk instead of a chair), recognizable is ≤3 however well it is drawn.${
        input.style
          ? `\nChannel art style: ${input.style.artStyle}. Palette: ${input.style.palette.join(", ")}. Colours forced by this palette (e.g. an all-blue blueprint look) and the style's own rendering (pixel stepping, sketchy or ink lines, flat fills) are NOT defects; when the palette cannot show the real colours, judge fidelity on shape, parts and proportions instead.`
          : ""
      }`,
      images: [...refs, input.drawing],
    },
    deps,
  );
}
