import type { WordTiming } from "@ys/core";
import { attachSuffix, sayAbbreviation, sayNumber } from "./numbers.ts";

/**
 * Seslendirmede yabancı terimlerin okunuşu (3 Kas, kullanıcı: Gemini TTS Türkçe anlatımın içindeki "C++"yı "si artı
 * artı" diye okudu). Ses motoru her kelimeyi anlatım dilinin yazım kurallarıyla okur: İngilizce ad, kısaltma ve simgeler
 * yanlış çıkar. TTS'e giden metinde bu terimler o dilin harfleriyle okunuşa çevrilir ("C++" → "si pılas pılas");
 * altyazı özgün yazımı gösterir, ağız şekilleri (vizem) okunuşu izler. Yerleşik sözlük sık terimleri ücretsiz karşılar;
 * kalan adları bölüm başına ucuz bir ajan (pronouncer) ekler.
 */

/**
 * Yerleşik okunuşlar: dil → yazılış → okunuş. Türkçede yazılışı gibi okunanlar (Pascal, COBOL, Linux değil "linuks")
 * yoktur; büyük/küçük harf duyarsız eşleşir, yalnız kelimenin tamamı (ek kesme işaretinden sonra korunur: "C++'ın").
 */
export const LEXICON: Record<string, Record<string, string>> = {
  tr: {
    // Kullanıcının söylediği gibi (4 Kas): Türkçede ünsüz öbeği araya ı alır.
    "C++": "si pılas pılas",
    "C#": "si şarp",
    "F#": "ef şarp",
    ".NET": "dat net",
    JavaScript: "cavaskript",
    TypeScript: "tayp skript",
    Java: "cava",
    Python: "paytın",
    Ruby: "rubi",
    Rust: "rast",
    Swift: "suift",
    Haskell: "heskıl",
    Perl: "pörl",
    Smalltalk: "smoltok",
    Elixir: "iliksır",
    BASIC: "beysik",
    "Visual Basic": "vijuıl beysik",
    "Node.js": "nod cey es",
    React: "riekt",
    Angular: "engülar",
    Vue: "vyu",
    jQuery: "cey kuyeri",
    GitHub: "githab",
    Linux: "linuks",
    Unix: "yuniks",
    Windows: "vindovs",
    macOS: "mek o es",
    iOS: "ay o es",
    iPhone: "ayfon",
    iPad: "aypet",
    iPod: "aypod",
    Android: "endroid",
    Google: "gugıl",
    Microsoft: "maykrosoft",
    Apple: "epıl",
    Facebook: "feysbuk",
    YouTube: "yutub",
    Twitter: "tivitır",
    Oracle: "orıkıl",
    Netscape: "netskeyp",
    Firefox: "fayırfoks",
    Chrome: "krom",
    Docker: "dokır",
    Kubernetes: "kubernetis",
    Bitcoin: "bitkoyn",
    blockchain: "blokçeyn",
    software: "softveyr",
    hardware: "hardveyr",
    startup: "startap",
    online: "onlayn",
    email: "imeyl",
    "e-mail": "imeyl",
    IBM: "ay bi em",
    SQL: "es kü el",
    MySQL: "may es kü el",
    PHP: "pi eyç pi",
    HTML: "eyç ti em el",
    CSS: "si es es",
    API: "ey pi ay",
    CPU: "si pi yu",
    GPU: "ci pi yu",
    USB: "yu es bi",
    "Wi-Fi": "vay fay",
    "Silicon Valley": "silikın veli",
    "3D": "üç de",
    "2D": "iki de",
    // Anlatıcının açarak söylediği kısaltmalar (4 Kas, kullanıcı: "TBMM … Türkiye Büyük Millet Meclisi olmalı"); ek
    // açılıma göre yeniden kurulur. Bağlama özgü olanları (CHP, İTC…) telaffuz ajanı ekler.
    TBMM: "Türkiye Büyük Millet Meclisi",
    ABD: "Amerika Birleşik Devletleri",
    AB: "Avrupa Birliği",
    BM: "Birleşmiş Milletler",
    SSCB: "Sovyet Sosyalist Cumhuriyetler Birliği",
    TDK: "Türk Dil Kurumu",
    MEB: "Milli Eğitim Bakanlığı",
    THY: "Türk Hava Yolları",
    TCDD: "Türkiye Cumhuriyeti Devlet Demiryolları",
    "≈": "yaklaşık",
    "~": "yaklaşık",
  },
};

/** Bir terimin metindeki parçası: önündeki işaretler, kendisi ve ardındaki ek/noktalama ("C++'ın," → "", "C++", "'ın,"). */
function split(token: string): { lead: string; core: string; tail: string } {
  const lead = /^["'“‘«(\[]*/.exec(token)![0];
  const rest = token.slice(lead.length);
  // Kesme işaretinden sonrası Türkçe ektir; sondaki noktalama da kuyruktur. Simgeyle biten terim ("C++", "C#") korunur.
  const apostrophe = rest.search(/['’]\p{L}/u);
  const body = apostrophe > 0 ? rest.slice(0, apostrophe) : rest;
  const core = body.replace(/[.,;:!?…"'”’»)\]]+$/u, "");
  return { lead, core, tail: rest.slice(core.length) };
}

/** Okunuş planının bir parçası: özgün kelimeler ve TTS'e giden karşılıkları (değişmeyen kelimede ikisi aynı). */
export interface SayGroup {
  written: string[];
  spoken: string[];
}

export interface SayPlan {
  /** TTS'e giden metin. */
  spoken: string;
  groups: SayGroup[];
  /** Okunuşu değişen terimler (günlük ve inceleme için). */
  used: Record<string, string>;
}

/**
 * Metni TTS için okunuşa çevirir. terms: yazılış → okunuş (birden çok kelimelik ad da olur: "Steve Jobs"). En uzun
 * eşleşme önce; eşleşme kelimenin tamamıdır, büyük/küçük harf duyarsız. lang "tr" ise sözlükte olmayan sayılar
 * Türkçe okunur (numbers.ts; "II. Mehmed", "1,5 milyon", "%75"); sözlük önce gelir (ad içindeki farklı okunan numara).
 */
export function sayPlan(text: string, terms: Record<string, string>, lang = ""): SayPlan {
  const tokens = text.split(/\s+/).filter(Boolean);
  const parts = tokens.map(split);
  const keys = Object.entries(terms)
    .map(([written, spoken]) => ({ parts: written.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase()), written, spoken: spoken.trim() }))
    .filter((k) => k.parts.length && k.spoken)
    .sort((a, b) => b.parts.length - a.parts.length);
  const groups: SayGroup[] = [];
  const used: Record<string, string> = {};
  for (let i = 0; i < tokens.length; ) {
    const hit = keys.find((k) =>
      k.parts.every((part, j) => {
        const tok = tokens[i + j];
        if (tok === undefined) return false;
        const { lead, core, tail } = split(tok);
        // Çok kelimelik adın iç kelimelerinde ek ya da noktalama olmaz.
        const inner = j > 0 && lead !== "";
        const open = j < k.parts.length - 1 && tail !== "";
        return !inner && !open && core.toLowerCase() === part;
      }),
    );
    if (!hit) {
      const num = lang === "tr" ? (sayNumber(parts, i) ?? sayAbbreviation(parts, i)) : undefined;
      if (num) {
        groups.push({ written: tokens.slice(i, i + num.take), spoken: num.spoken.split(/\s+/) });
        i += num.take;
        continue;
      }
      groups.push({ written: [tokens[i]!], spoken: [tokens[i]!] });
      i++;
      continue;
    }
    const written = tokens.slice(i, i + hit.parts.length);
    const first = split(written[0]!);
    const last = split(written.at(-1)!);
    // Açılımla okunan kısaltmada ek yeniden kurulur ("ABD'ye" → "Amerika Birleşik Devletleri'ne"; numbers.ts).
    const expanded = lang === "tr" && /^\p{Lu}{2,6}$/u.test(first.core) && /\s/.test(hit.spoken);
    const tail = expanded ? last.tail.replace(/^(['’])(\p{L}+)/u, (_all, mark: string, suffix: string) => mark + attachSuffix(hit.spoken, suffix)) : last.tail;
    const spoken = `${first.lead}${hit.spoken}${tail}`.split(/\s+/);
    groups.push({ written, spoken });
    used[hit.written] = hit.spoken;
    i += hit.parts.length;
  }
  return { spoken: groups.flatMap((g) => g.spoken).join(" "), groups, used };
}

/**
 * Okunuş metninin kelime zamanlarından özgün kelimelerin zamanları. Sağlayıcının kelimeleri okunuş metnini harf harf
 * kapsar; kelime sınırları farklı olsa bile (sağlayıcı noktalamayı ayırabilir) her parçanın zamanı harf konumundan
 * bulunur. Değişen kelimeye okunuşu `say` olarak eklenir (ağız şekilleri onu izler). Okunuşu birden çok kelimeye
 * bölünen tek terim ("C++" → "si pılas pılas") tek kelime olur; kelime sayısı eşit çok kelimelik ad kelime kelime eşleşir.
 */
export function restoreWords(words: readonly WordTiming[], plan: SayPlan): WordTiming[] {
  if (!words.length) return [];
  const size = (s: string) => s.replace(/\s+/g, "").length;
  const ends: number[] = [];
  words.reduce((n, w, i) => (ends[i] = n + Math.max(1, size(w.text))), 0);
  const total = ends.at(-1)!;
  const spokenTotal = Math.max(1, size(plan.spoken));
  // Okunuş metnindeki harf konumundan zaman: başlangıç için konumu içeren kelime, bitiş için konumda biten kelime.
  const at = (c: number, end: boolean): number => {
    const x = (c / spokenTotal) * total;
    // Konumdan önce biten kelime sayısı = konumu içeren kelime (sondaki kayan nokta taşması son kelimede kalır).
    const i = Math.min(words.length - 1, ends.filter((e) => (end ? x > e : x >= e)).length);
    const w = words[i]!;
    const from = i ? ends[i - 1]! : 0;
    // Her kelime en az bir harf sayılır: payda sıfır olmaz.
    const k = Math.min(1, Math.max(0, (x - from) / (ends[i]! - from)));
    return Math.round(w.startMs + k * (w.endMs - w.startMs));
  };
  const out: WordTiming[] = [];
  let pos = 0;
  for (const g of plan.groups) {
    const spans = g.spoken.map((s) => {
      const span = { a: pos, b: pos + size(s) };
      pos = span.b;
      return span;
    });
    const changed = g.spoken.join(" ") !== g.written.join(" ");
    if (g.written.length === g.spoken.length) {
      g.written.forEach((w, n) => out.push({ text: w, startMs: at(spans[n]!.a, false), endMs: at(spans[n]!.b, true), ...(changed ? { say: g.spoken[n]! } : {}) }));
    } else {
      out.push({ text: g.written.join(" "), startMs: at(spans[0]!.a, false), endMs: at(spans.at(-1)!.b, true), say: g.spoken.join(" ") });
    }
  }
  return out;
}
