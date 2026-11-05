import { ARM_GESTURES, type VectorAnim, type VectorAnimType, type VectorExpression, type VectorShot } from "@ys/core";
import { TITLED } from "./name-tags.ts";

/**
 * Açıklamadaki fiil → jest (çekim açıklamaları İngilizce, yönetmenin talimat dili). Yalnız kişinin yaptığı, ötekilerle
 * karışmayan biçimler: "types of" ad, "hands" ancak ardından nesne gelince fiil, "points" yön edatıyla.
 */
const VERBS: { gesture: VectorAnimType; verb: RegExp }[] = [
  { gesture: "typing", verb: /\btypes\b(?!\s+of\b)|\btyping\b/gi },
  { gesture: "writing", verb: /\b(?:writes|writing|sketches|sketching|scribbles|scribbling|jots|jotting|notes down)\b|\b(?:takes|taking|adds|adding|makes|making) notes\b/gi },
  { gesture: "reading", verb: /\b(?:reads|reading|pores over)\b|\b(?:leafs|leafing|flips|flipping) through\b/gi },
  { gesture: "give", verb: /\bhand(?:s|ing)\s+(?:over\s+)?(?:a|an|the|his|her|their|its|it|them|this|that)\b/gi },
  { gesture: "point", verb: /\bpoints\s+(?:at|to|toward|towards|out|up|down)\b|\bpointing\b/gi },
  { gesture: "nod", verb: /\b(?:nods|nodding)\b/gi },
  { gesture: "shake_head", verb: /\bshak(?:es|ing)\s+(?:his\s+|her\s+|their\s+)?head\b/gi },
  // 5 Kas: incelemelerde ~320 not anlatılan tepkiyi aradı ("omuz silkmiyor", "sevinmiyor", "geri sıçramıyor", "eli belinde
  // değil"); bu jestler vardı ama yalnız yukarıdaki yedi eylem açıklamadan okunuyordu.
  { gesture: "cheer", verb: /\b(?:cheers|cheering|celebrates|celebrating|rejoices|rejoicing|punch(?:es|ing)\s+the\s+air|pump(?:s|ing)\s+(?:a|his|her|their)\s+fists?|throws?\s+(?:his|her|their|both)\s+arms\s+up)\b/gi },
  { gesture: "clap", verb: /\b(?:claps|clapping|applauds|applauding)\b/gi },
  { gesture: "wave", verb: /\bwav(?:es|ing)\b(?!\s+of\b)/gi },
  { gesture: "shrug", verb: /\bshrug(?:s|ging)\b/gi },
  { gesture: "surprised", verb: /\b(?:recoils|recoiling|flinches|flinching|gasps|gasping|jumps\s+back|jumping\s+back|steps\s+back|stepping\s+back)\b/gi },
  { gesture: "arms_crossed", verb: /\b(?:(?:crosses|crossing|folds|folding)\s+(?:his|her|their)\s+arms|(?:with\s+)?(?:(?:his|her|their)\s+)?arms\s+(?:crossed|folded))\b/gi },
  { gesture: "hands_on_hips", verb: /\b(?:(?:puts|putting|places|placing|rests|resting|with)\s+)?(?:(?:his|her|their|both)\s+)?hands\s+on\s+(?:(?:his|her|their)\s+)?hips\b/gi },
  { gesture: "show", verb: /\b(?:holds|holding|lifts|lifting)\s+up\b|\b(?:shows|showing)\s+off\b|\b(?:presents|presenting|displays|displaying|brandishes|brandishing)\s+(?:a|an|the|his|her|their)\b/gi },
  { gesture: "think", verb: /\b(?:thinks|thinking|ponders|pondering|wonders|wondering|muses|musing|reflects|reflecting)\b/gi },
];

/**
 * Açıklamadaki duygu → yüz ifadesi (yönetmenin kendi tarifi; denetçi kareyi buna göre okur: "endişeli değil, sakin
 * görünüyor", "üzgün değil, gülümsüyor"). Sözcük kişinin ya önünde ("a worried Lemkin") ya ardında ("Lemkin looks worried").
 */
const MOODS: { mood: VectorExpression; word: RegExp }[] = [
  { mood: "worried", word: /\b(?:worried|worriedly|anxious|anxiously|nervous|nervously|concerned|uneasy|tense|alarmed|fearful|scared|afraid|frightened|panicked|panicking|apprehensive|troubled)\b/gi },
  { mood: "sad", word: /\b(?:sad|sadly|dejected|disappointed|downcast|crestfallen|gloomy|glum|heartbroken|mournful|defeated|ashamed|apologetic|regretful|sorrowful)\b/gi },
  { mood: "angry", word: /\b(?:angry|angrily|furious|furiously|annoyed|irritated|frustrated|outraged|irate|indignant|fuming|scowls|scowling|shouts|shouting|yells|yelling)\b/gi },
  { mood: "surprised", word: /\b(?:surprised|shocked|stunned|astonished|amazed|startled|astounded|gasps|gasping|recoils|recoiling)\b/gi },
  { mood: "happy", word: /\b(?:happy|happily|smiling|smiles|delighted|proud|proudly|excited|excitedly|beaming|beams|grinning|grins|cheerful|cheerfully|relieved|laughs|laughing|joyful|thrilled|triumphant|triumphantly|cheers|cheering|celebrates|celebrating)\b/gi },
  { mood: "thinking", word: /\b(?:thoughtful|thoughtfully|pensive|puzzled|curious|ponders|pondering|wonders|wondering|sceptical|skeptical|doubtful|confused|perplexed|musing)\b/gi },
];

/** Duygu sözcüğünden önce bunlardan biri varsa (en çok üç sözcük geride) duygu yadsınır: "no longer smiling", "isn't worried". */
const NEGATION = /\b(?:not|no|never|without|nor|instead|rather)\b|n't\b/i;
/** Özneyle duygu sözcüğü arasında atlanan bağ fiilleri: "Lemkin looks worried", "Bell seems puzzled". */
const LINKING = new Set(["looks", "seems", "appears", "feels", "grows", "becomes", "gets", "stays", "remains", "sounds", "turns", "visibly", "very", "clearly", "deeply", "slightly", "suddenly"]);

/** Bu sözcüklerden sonra gelen fiil biçimi addır ("a reading lamp", "his hands", "her writing desk"). */
const NOUN_AFTER = new Set(["a", "an", "the", "this", "that", "these", "those", "his", "her", "their", "its", "our", "my", "your", "of", "some", "many", "several", "no", "two", "three", "more", "other", "whose"]);
/** Bu edatlardan sonraki ad özne değil ("Examiner beside Diesel reads", "hands the box to Schlueter"). */
const RELATIONAL = new Set(["beside", "near", "behind", "with", "to", "toward", "towards", "from", "by", "for", "at", "past", "around", "against", "than", "like"]);
/** Özneyle fiil arasındaki yer öbeğinin edatları ("Paterson at a small desk with a computer writes"). */
const PREP = new Set([...RELATIONAL, "in", "on", "of", "under", "over", "inside", "before", "after", "across", "among", "beneath", "next", "into", "onto", "along", "above", "below", "outside", "between"]);
/** Yer öbeğinin en çok bu kadar sözcüğü atlanır (edat dahil): "beside a TV, toaster and VCR". */
const PP_WORDS = 5;
const PRONOUN = new Set(["he", "she", "they"]);
/**
 * Özneyle ulaç arasındaki yardımcı fiil atlanır ("Babbage is taking notes", "keeps typing"); duruş fiilleri de ("Lemkin stands
 * with arms crossed", "Bell sits wondering").
 */
const AUX = new Set(["is", "are", "was", "were", "keeps", "starts", "begins", "continues", "stands", "sits", "waits", "listens", "watches", "leans"]);
/** Kimse adıyla anılmıyorsa tek kişilik çekimde özne sayılan sözcükler ("the student types", "a child typing"). */
const PERSON = new Set([
  "someone", "man", "woman", "boy", "girl", "child", "kid", "student", "pupil", "developer", "programmer", "coder", "engineer",
  "scientist", "inventor", "founder", "worker", "master", "clerk", "teacher", "professor", "presenter", "narrator", "host",
  "person", "figure", "officer", "investor", "scholar", "artisan", "craftsman", "operator", "user", "writer", "author",
  "secretary", "typist", "mathematician", "researcher", "designer", "monk", "scribe", "character", "colleague", "assistant",
]);

/** Eklenen baş jestinin süresi (sn), çekimin ortasında: bütün çekim boyunca sallanan baş tik gibi görünür. */
export const NARRATED = { headSec: 1.8 } as const;

interface Person {
  id: string;
  name: string;
  kind?: string;
}

/** Kişinin adında onu tanıtan sözcükler: büyük harfle başlayan, en az üç harfli, unvan ve sıra numarası olmayan. */
function nameWords(name: string): string[] {
  return (name.match(/\p{Lu}\p{L}{2,}/gu) ?? []).filter((w) => !TITLED.test(w) && !/^[IVXLC]+$/.test(w));
}

/**
 * Fiilin öznesi, fiilden geriye doğru: hemen önceki sözcük bir kişinin adıysa o (edattan sonra gelen, "beside Diesel",
 * ya da iyelik, "Babbage's assistant", özne değil); "who" önündeki adı, "and"/"then" ve zamir cümlede adı geçen son özneyi
 * gösterir; kişi sözcüğü ("the student", "a colleague") kimsenin adı geçmiyorsa tek kişilik çekimin kişisidir ("only"),
 * geçiyorsa adsız biridir; "which"/"that" ve kişi olmayan ad ("the clock reads", "a sheet reading PASCAL") kimse. Aradaki yer
 * öbeği atlanır ("Babbage in his study sketches"); öbekten sonra gelen ulaç cümlenin öznesine bağlanır ("stand by an easel
 * sketching").
 */
function subjectOf(prefix: string, people: { id: string; words: string[] }[], gerund: boolean, skip: ReadonlySet<string> = AUX): string | undefined {
  const tokens = [...prefix.matchAll(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)].map((m) => ({ text: m[0], end: m.index + m[0].length }));
  const lower = (k: number) => tokens[k]?.text.toLowerCase();
  const person = (k: number) => {
    const t = tokens[k]!;
    const base = t.text.replace(/['’]s$/u, "");
    const p = people.find((q) => q.words.includes(base));
    const own = base !== t.text || /^['’]/u.test(prefix.slice(t.end));
    return p && { id: p.id, own, subject: !own && !RELATIONAL.has(lower(k - 1) ?? "") };
  };
  const named = (from: number) => {
    for (let k = from; k >= 0; k--) {
      const p = person(k);
      if (p?.subject) return p.id;
    }
    return undefined;
  };
  const anyNamed = tokens.some((_, k) => person(k));
  let k = tokens.length - 1;
  while (k >= 0 && /^\p{Ll}+ly$/u.test(tokens[k]!.text)) k--;
  let skipped = false;
  while (k >= 0) {
    const p = person(k);
    if (p) return p.subject ? p.id : undefined;
    const w = lower(k)!;
    if (skip.has(w)) {
      k--;
      continue;
    }
    // "to Clement, who nods": edattan sonra gelse de who'nun önündeki ad öznedir.
    if (w === "who") {
      const p = k > 0 ? person(k - 1) : undefined;
      return p && !p.own ? p.id : undefined;
    }
    if (w === "and" || w === "then") return named(k - 1);
    if (PRONOUN.has(w)) return named(k - 1) ?? (anyNamed ? undefined : "only");
    if (PERSON.has(w)) return anyNamed ? undefined : "only";
    if (w === "which" || w === "that") return undefined;
    const j = Array.from({ length: PP_WORDS }, (_, n) => k - n).find((j) => j >= 1 && PREP.has(lower(j)!));
    if (j === undefined) break;
    k = j - 1;
    skipped = true;
  }
  return gerund && skipped ? named(k) : undefined;
}

/** Kadronun kişileri, onları tanıtan sözcükleri ve çekimdeki katmanları. */
function peopleOf(spec: VectorShot, cast: Person[]) {
  const persons = cast.filter((c) => c.kind === undefined || c.kind === "person");
  const words = persons.map((p) => nameWords(p.name));
  // İki kişide ortak sözcük ("Diesel" ailesi) kimseyi tanıtmaz.
  const shared = (w: string) => words.filter((list) => list.includes(w)).length > 1;
  const people = persons.map((p, n) => ({ id: p.id, words: words[n]!.filter((w) => !shared(w)) }));
  const inShot = spec.layers.flatMap((l, i) => (persons.some((p) => p.id === l.asset) ? [{ asset: l.asset, i }] : []));
  return { people, inShot };
}

/** Açıklamada kişiye bağlanan eylemler: katman indeksi → jest (kişi başına ilki). */
export function narratedActions(description: string, spec: VectorShot, cast: Person[]): Map<number, VectorAnimType> {
  const { people, inShot } = peopleOf(spec, cast);
  const out = new Map<number, VectorAnimType>();
  // Cümleler: nokta yalnız ardından boşluk gelince böler ("Node.js", "5.000.000" bölünmez).
  for (const clause of description.split(/[.;:!?](?=\s|$)/)) {
    for (const { gesture, verb } of VERBS) {
      for (const m of clause.matchAll(verb)) {
        const prefix = clause.slice(0, m.index);
        const word = /(\p{L}+)\s*$/u.exec(prefix)?.[1]?.toLowerCase();
        if (word && NOUN_AFTER.has(word)) continue;
        const who = subjectOf(prefix, people, /^\p{L}+ing\b/iu.test(m[0]));
        const layer = who === "only" ? (inShot.length === 1 ? inShot[0] : undefined) : inShot.find((p) => p.asset === who);
        if (layer && !out.has(layer.i)) out.set(layer.i, gesture);
      }
    }
  }
  return out;
}

/**
 * Açıklamada kişiye bağlanan duygular: katman indeksi → ifade (kişi başına ilki). Duygu sözcüğünün öznesi önce geriye
 * doğru (bağ fiili atlanır: "Lemkin looks worried", "Lemkin, worried,"), yoksa hemen ardındaki kişi adı ("a worried
 * Lemkin"); cümlede kadrodan kimse anılmıyorsa tek kişilik çekimin kişisi ("Close on a worried face"). Yadsınan duygu
 * ("no longer smiling") sayılmaz.
 */
export function narratedMoods(description: string, spec: VectorShot, cast: Person[]): Map<number, VectorExpression> {
  const { people, inShot } = peopleOf(spec, cast);
  const skip = new Set([...AUX, ...LINKING]);
  const out = new Map<number, VectorExpression>();
  for (const clause of description.split(/[.;:!?](?=\s|$)/)) {
    const named = people.filter((p) => p.words.some((w) => new RegExp(`\\b${w}\\b`, "u").test(clause)));
    for (const { mood, word } of MOODS) {
      for (const m of clause.matchAll(word)) {
        const prefix = clause.slice(0, m.index);
        if (NEGATION.test(prefix.split(/\s+/).slice(-4).join(" "))) continue;
        const next = /^[\s,]*(?:\p{Ll}+\s+)?(\p{Lu}[\p{L}'’-]*)/u.exec(clause.slice(m.index + m[0].length));
        const after = next ? people.find((p) => p.words.includes(next[1]!.replace(/['’]s$/u, "")))?.id : undefined;
        const who = subjectOf(prefix, people, false, skip) ?? after ?? (named.length ? undefined : "only");
        const layer = who === "only" ? (inShot.length === 1 ? inShot[0] : undefined) : inShot.find((p) => p.asset === who);
        if (layer && !out.has(layer.i)) out.set(layer.i, mood);
      }
    }
  }
  return out;
}

/**
 * Anlatılan duygu yüz ifadesi olarak: açıklamanın kişiye bağladığı duygu yönetmenin verdiği ifadeden farklıysa (ya da
 * ifade yoksa) o olur. Değişen planı döner, değişiklik yoksa undefined.
 */
export function withNarratedMoods(spec: VectorShot, description: string, cast: Person[]): VectorShot | undefined {
  const wanted = narratedMoods(description, spec, cast);
  let changed = false;
  const layers = spec.layers.map((l, i) => {
    const mood = wanted.get(i);
    if (!mood || l.expression === mood) return l;
    changed = true;
    return { ...l, expression: mood };
  });
  return changed ? { ...spec, layers } : undefined;
}

/**
 * Anlatılan eylem jest olarak (4 Kas, inceleme: "anlatılan eylemi yapmıyor" notlarının 75'inin 32'sinde jest planda hiç
 * yoktu; "Babbage sketches", "Kemeny typing at his teleprinter" diyen çekimde yönetmen kişiye genel bir "explain"
 * vermişti, denetçi kolları açık konuşan birini gördü). Kişinin genel anlatma jesti aynı zaman aralığında eyleme döner;
 * jesti yoksa eylem bütün çekime verilir. Yönetmenin seçtiği başka bir kol jesti (işaret, sevinç, irkilme…) ya da
 * yürüyüş varsa dokunulmaz; uzatma yalnız elinde bir şey tutana. Baş sallama: yönetmenin titreme (shake) verdiği baş
 * "hayır" der; yoksa çekimin ortasında NARRATED.headSec saniye. Değişen planı döner, değişiklik yoksa undefined. Render
 * eylemi sahneleyemezse (masa, kâğıt yok) çağıran planı olduğu gibi bırakır.
 */
export function withNarratedActions(spec: VectorShot, description: string, cast: Person[], dur: number): VectorShot | undefined {
  let changed = false;
  const wanted = narratedActions(description, spec, cast);
  const layers = spec.layers.map((l, i) => {
    const gesture = wanted.get(i);
    if (!gesture || l.anims.some((a) => a.type === gesture || a.type === "walk")) return l;
    let anims: VectorAnim[] | undefined;
    if (ARM_GESTURES.includes(gesture)) {
      const arms = l.anims.filter((a) => ARM_GESTURES.includes(a.type));
      if (arms.some((a) => a.type !== "explain")) return l;
      if (gesture === "give" && !spec.layers.some((q) => q.heldBy === i)) return l;
      anims = arms.length ? l.anims.map((a) => (a.type === "explain" ? { ...a, type: gesture } : a)) : [...l.anims, { type: gesture, start: 0, end: 1 }];
    } else if (gesture === "shake_head" && l.anims.some((a) => a.type === "shake")) {
      anims = l.anims.map((a) => (a.type === "shake" ? { ...a, type: gesture } : a));
    } else if (!l.anims.some((a) => a.type === "nod" || a.type === "shake_head")) {
      const half = Math.min(0.5, NARRATED.headSec / 2 / dur);
      anims = [...l.anims, { type: gesture, start: 0.5 - half, end: 0.5 + half }];
    }
    if (!anims) return l;
    changed = true;
    return { ...l, anims };
  });
  return changed ? { ...spec, layers } : undefined;
}

interface Issue {
  code: string;
  layer?: number;
  replan: boolean;
}

/**
 * Eklenen eylem render'da yeni bir kusur doğurmadı mı: denetimin (lint) yeni bulgularının hepsi kodun anlamı koruyarak
 * yaptığı ele verme ("reading": yakındaki kâğıt ele alındı) olmalı. Düşen jest (masa yok), boşluğu gösteren işaret, kayan
 * yüz ya da kopan poz eklemeyi geri aldırır.
 */
export function addsNoDefect(before: Issue[], after: Issue[]): boolean {
  const key = (i: Issue) => `${i.code}|${i.layer}|${i.replan}`;
  const left = before.map(key);
  return after.every((i) => {
    const at = left.indexOf(key(i));
    if (at >= 0) {
      left.splice(at, 1);
      return true;
    }
    return i.code === "action_without_prop" && !i.replan;
  });
}
