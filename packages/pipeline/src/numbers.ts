/**
 * Türkçe anlatımda sayıların okunuşu (4 Kas, kullanıcı: "sayısal değerlerin Türkçe ifadesi komik olabiliyor"). Senaryo
 * sayıları Türkçe yazım kuralıyla rakamla yazar ("1453", "1,5 milyon", "%75", "II. Mehmed"); altyazı rakamı gösterir,
 * TTS'e giden metinde kod onları kesin kurallarla okur. Ses motoru "1.5"i "bir nokta beş", "3/4"ü "üç bölü dört",
 * "1452–1481"i "tire" diye okuyabiliyordu; ağız şekilleri de rakamda harf olmadığı için kapalı kalıyordu (vizemler
 * okunuşun harflerinden çıkar). Ad içindeki farklı okunan numara (çip, model) telaffuz ajanından gelir: sözlük önce gelir.
 */

const ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const SCALES = ["", "bin", "milyon", "milyar", "trilyon", "katrilyon", "kentilyon"];
const CURRENCY: Record<string, string> = { $: "dolar", "€": "avro", "£": "sterlin", "₺": "lira", "¥": "yen" };
const HARD = "fstkçşhp";
const VOWELS = "aeıioöuü";

/** Bir sözcüğün metindeki parçası (pronounce.ts'deki ayrıştırmayla aynı): önündeki işaretler, kendisi, ek ve noktalama. */
export interface Part {
  lead: string;
  core: string;
  tail: string;
}

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  return [h === 0 ? "" : h === 1 ? "yüz" : `${ONES[h]} yüz`, TENS[t], ONES[o]].filter(Boolean).join(" ");
}

/** Rakam dizisinin okunuşu ("1453" → "bin dört yüz elli üç"; "bir bin" değil "bin"). Çok uzun dizi rakam rakam okunur. */
export function sayInteger(digits: string): string {
  const d = digits.replace(/^0+(?=\d)/, "");
  if (d.length > 21) return [...d].map((c) => (c === "0" ? "sıfır" : ONES[Number(c)])).join(" ");
  if (/^0+$/.test(d)) return "sıfır";
  const groups: number[] = [];
  for (let end = d.length; end > 0; end -= 3) groups.unshift(Number(d.slice(Math.max(0, end - 3), end)));
  return groups
    .map((g, i) => {
      const scale = SCALES[groups.length - 1 - i]!;
      if (g === 0) return "";
      if (scale === "bin" && g === 1) return "bin";
      return [under1000(g), scale].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join(" ");
}

const lastVowel = (word: string) => [...word].reverse().find((c) => VOWELS.includes(c)) ?? "e";
/** Dört yollu ünlü uyumu (ı, i, u, ü). */
const v4 = (v: string) => ({ a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" })[v]!;
/** İki yollu ünlü uyumu (a, e). */
const v2 = (v: string) => ("aıou".includes(v) ? "a" : "e");

/** Sıra sayısı: son kelimeye -(I)ncI ("iki" → "ikinci", "dört" → "dördüncü", "yüz" → "yüzüncü"). */
export function ordinal(words: string): string {
  const all = words.split(" ");
  const last = all.pop()!;
  const base = last === "dört" ? "dörd" : last;
  const v = v4(lastVowel(base));
  const end = VOWELS.includes(base.at(-1)!) ? `${base}nc${v}` : `${base}${v}nc${v}`;
  return [...all, end].join(" ");
}

/** Bulunma eki: "dört" → "dörtte", "iki" → "ikide", "on" → "onda". */
function locative(words: string): string {
  const d = HARD.includes(words.at(-1)!) ? "t" : "d";
  return `${words}${d}${v2(lastVowel(words))}`;
}

/**
 * Yazarın sayıya uydurduğu eki yeni köke uydurur ("$500'lük" → "beş yüz dolarlık"): ünlüler uyuma, baştaki d/t
 * kökün son sesine göre.
 */
export function harmonize(stem: string, suffix: string): string {
  let last = lastVowel(stem);
  let out = "";
  for (const [i, c] of [...suffix].entries()) {
    if ("ae".includes(c)) last = v2(last);
    else if ("ıiuü".includes(c)) last = v4(last);
    else {
      out += i === 0 && (c === "d" || c === "t") ? (HARD.includes(stem.at(-1)!) ? "t" : "d") : c;
      continue;
    }
    out += last;
  }
  return out;
}

/** Ondalık: "1,5" → "bir buçuk", "3,14" → "üç virgül on dört", "0,05" → "sıfır virgül sıfır beş". */
function sayDecimal(int: string, frac: string): string {
  if (frac === "5" && !/^0+$/.test(int)) return `${sayInteger(int)} buçuk`;
  const zeros = /^0*/.exec(frac)![0];
  const rest = frac.slice(zeros.length);
  return [sayInteger(int), "virgül", ...[...zeros].map(() => "sıfır"), ...(rest ? [sayInteger(rest)] : [])].join(" ");
}

/**
 * Tek bir miktar: tamsayı, Türkçe binlik noktası ve ondalık virgülü, İngilizce ondalık noktası ya da sürüm numarası
 * (bir addan sonra ya da birden çok noktalı: "Python 3.12" → "üç nokta on iki"), eksi. Sıfırla başlayan rakam dizisi
 * rakam rakam okunur ("007").
 */
function sayAmount(core: string, prev = "", scaled = false): string | undefined {
  if (/^-\d/.test(core)) {
    const rest = sayAmount(core.slice(1), prev, scaled);
    return rest && `eksi ${rest}`;
  }
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/.exec(core))) {
    const int = m[1]!.replaceAll(".", "");
    return m[2] ? sayDecimal(int, m[2]) : sayInteger(int);
  }
  if ((m = /^(\d+),(\d+)$/.exec(core))) return sayDecimal(m[1]!, m[2]!);
  if ((m = /^\d+(?:\.\d+)+$/.exec(core))) {
    const parts = core.split(".");
    // Ardından "milyon" gibi büyüklük geliyorsa ondalıktır ("Toplam 1.5 milyon"), addan sonra gelmiş olsa da.
    const version = parts.length > 2 || (!scaled && /^(\p{Lu}|sürüm|versiyon)/u.test(prev));
    return version ? parts.map(sayInteger).join(" nokta ") : sayDecimal(parts[0]!, parts[1]!);
  }
  if (/^0\d+$/.test(core)) return [...core].map((c) => (c === "0" ? "sıfır" : ONES[Number(c)])).join(" ");
  if (/^\d+$/.test(core)) return sayInteger(core);
  return undefined;
}

const AMOUNT = String.raw`-?\d[\d.,]*`;
const ROMAN: [number, string][] = [
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Kanonik Roma rakamının değeri ("II" → 2); kanonik değilse ya da tek harfli L/C ise (ad baş harfi olabilir) yok. */
export function romanValue(s: string): number | undefined {
  if (!/^[IVXLC]+$/.test(s) || s === "L" || s === "C") return undefined;
  let n = 0;
  let rest = s;
  for (const [v, r] of ROMAN) while (rest.startsWith(r)) (n += v), (rest = rest.slice(r.length));
  let back = "";
  let k = n;
  for (const [v, r] of ROMAN) while (k >= v) (back += r), (k -= v);
  return back === s ? n : undefined;
}

/** Yazıdaki kısaltmalar ve sesli okunuşları; unvanlardan sonra hep bir ad gelir. */
const ABBREVIATIONS: Record<string, string> = { vb: "ve benzeri", vs: "vesaire", yy: "yüzyıl", ör: "örneğin", bkz: "bakınız", Dr: "doktor", Prof: "profesör", Doç: "doçent" };
const TITLES = new Set(["Dr", "Prof", "Doç"]);

/**
 * Noktalı kısaltmanın açılımı ("vb." → "ve benzeri"). Nokta kısaltmanındır: ardından küçük harfle devam ediliyorsa ya
 * da unvansa düşer (TTS cümle sonu sanıp duruyordu); cümle sonundaysa kalır.
 */
export function sayAbbreviation(parts: readonly Part[], i: number): { take: number; spoken: string } | undefined {
  const { lead, core, tail } = parts[i]!;
  const said = Object.hasOwn(ABBREVIATIONS, core) ? ABBREVIATIONS[core] : undefined;
  if (!said || !tail.startsWith(".")) return undefined;
  const next = parts[i + 1];
  const goesOn = next !== undefined && (TITLES.has(core) || /^\p{Ll}/u.test(next.lead + next.core));
  return { take: 1, spoken: `${lead}${said}${goesOn ? tail.slice(1) : tail}` };
}

/**
 * Kısaltmanın açılımına ek takar (4 Kas, kullanıcı: "TBMM gibi kısaltmalar Türkiye Büyük Millet Meclisi olmalı"). Yazar
 * eki harf okunuşuna uydurur ("ABD'ye": a-be-de'ye); açılımda ek Türkçe kuralla yeniden kurulur: tamlama sonundan
 * (Meclisi, Birliği, Devletleri) sonra durum eki zamir n'si alır ("Devletleri'ne", "Birliği'nden", "Meclisi'nin";
 * vasıta eki y ile: "Meclisi'yle"), ünsüzden sonra kaynaştırma düşer ("Milletler'e", "Milletler'in"), ünlüler uyar.
 */
export function attachSuffix(stem: string, suffix: string): string {
  const compound = /\s/.test(stem.trim()) && /[ıiuü]$/.test(stem);
  const endsVowel = VOWELS.includes(stem.at(-1)!);
  let buffer = "";
  let rest = suffix;
  if (/^[yn][aeıioöuü]/.test(rest) || /^yl/.test(rest)) {
    buffer = rest[0]!;
    rest = rest.slice(1);
  }
  let lead = "";
  if (VOWELS.includes(rest[0]!)) lead = !endsVowel ? "" : compound ? "n" : buffer || "y";
  else if (/^[dt]/.test(rest) && compound) lead = "n";
  else if (/^l[ae]/.test(rest) && buffer === "y" && endsVowel) lead = "y";
  // Zamir n'sinden sonra bulunma/ayrılma eki yumuşak kalır ("Meclisi'nde").
  const out = harmonize(stem, lead + rest);
  return lead === "n" && /^n[t]/.test(out) ? `nd${out.slice(2)}` : out;
}

/** Ekin kesme işaretinden sonraki harflerini yeni köke uydurur ("'lük," → "'lık,"). */
const reharmonize = (stem: string, tail: string) => tail.replace(/^(['’])(\p{L}+)/u, (_all, mark: string, suffix: string) => mark + harmonize(stem, suffix));

/**
 * parts[i]'den başlayan sayı ifadesinin okunuşu ve kaç sözcük tuttuğu; sayı değilse yok. Biçimler: sıra sayısı
 * ("II. Mehmed", "19. yüzyıl"), MÖ/MS, yüzde, para birimi (ardından "milyar" gibi büyüklük gelirse birim sona),
 * kat ("10x"), aralık ("1452–1481" → "… ile …"), kesir ("3/4" → "dörtte üç"), saat ("14:30"), "64-bit", "GPT-2"
 * ve tek miktar. Kesme işaretinden sonraki ek yazarın sayıya uydurduğu biçimde kalır ("1453'te").
 */
export function sayNumber(parts: readonly Part[], i: number): { take: number; spoken: string } | undefined {
  const { lead, core, tail } = parts[i]!;
  const next = parts[i + 1];
  const prev = parts[i - 1]?.core ?? "";
  const one = (spoken: string, rest = tail) => ({ take: 1, spoken: `${lead}${spoken}${rest}` });
  let m: RegExpExecArray | null;

  // Bitişik yaklaşık işareti: "≈3", "~500".
  if ((m = /^[≈~](\S+)$/u.exec(core))) {
    const inner = sayNumber([...parts.slice(0, i), { lead: "", core: m[1]!, tail }, ...parts.slice(i + 1)], i);
    return inner && { take: inner.take, spoken: `${lead}yaklaşık ${inner.spoken}` };
  }

  // Sıra sayısı: Roma rakamı ya da rakam + nokta, ardından bir sözcük ("II. Mehmed"). Rakamda küçük harfli sözcük
  // ("19. yüzyıl") ya da 20'ye kadar sayı ("1. Dünya Savaşı"); büyük sayıdan sonra büyük harf cümle sonudur ("…1453. İstanbul").
  const roman = romanValue(core);
  if (next && tail.startsWith(".") && /^\p{L}/u.test(next.lead + next.core)) {
    if (roman !== undefined) return one(ordinal(sayInteger(String(roman))), tail.slice(1));
    if (/^\d+$/.test(core) && (/^\p{Ll}/u.test(next.core) || Number(core) <= 20)) return one(ordinal(sayInteger(core)), tail.slice(1));
  }
  // Çağ kısaltmasının noktası cümle sonu değil ("M.S. 330").
  if (/^(MÖ|M\.Ö|MS|M\.S)$/.test(core) && next && /^\d/.test(next.core)) return one(core.includes("Ö") ? "milattan önce" : "milattan sonra", tail.replace(/^\./, ""));

  if ((m = new RegExp(`^%(${AMOUNT})$`).exec(core) ?? new RegExp(`^(${AMOUNT})%$`).exec(core))) {
    const amount = sayAmount(m[1]!);
    if (amount) return one(`yüzde ${amount}`);
  }
  if ((m = new RegExp(`^([$€£₺¥])(${AMOUNT})$`).exec(core) ?? new RegExp(`^(${AMOUNT})([$€£₺¥])$`).exec(core))) {
    const [symbol, raw] = /\d/.test(m[1]!) ? [m[2]!, m[1]!] : [m[1]!, m[2]!];
    const amount = sayAmount(raw);
    const unit = CURRENCY[symbol]!;
    const scale = next && /^(bin|milyon|milyar|trilyon)(\p{L}*)$/u.exec(next.core);
    if (amount && scale && !tail) return { take: 2, spoken: `${lead}${amount} ${scale[1]} ${unit}${harmonize(unit, scale[2]!)}${next.tail}` };
    if (amount) return one(`${amount} ${unit}`, reharmonize(unit, tail));
  }
  if ((m = new RegExp(`^(${AMOUNT})[x×]$`).exec(core))) {
    const amount = sayAmount(m[1]!);
    if (amount) return one(`${amount} kat`, reharmonize("kat", tail));
  }
  if ((m = /^(\d+)[-–—](\d+)$/.exec(core))) return one(`${sayInteger(m[1]!)} ile ${sayInteger(m[2]!)}`);
  if ((m = /^(\d+)\/(\d+)$/.exec(core))) return one(`${locative(sayInteger(m[2]!))} ${sayInteger(m[1]!)}`);
  if ((m = /^(\d{1,2}):(\d{2})$/.exec(core))) return one([sayInteger(m[1]!), m[2] === "00" ? "" : sayAmount(m[2]!)].filter(Boolean).join(" "));
  if ((m = /^(\d+)-(\p{L}+)$/u.exec(core))) return one(`${sayInteger(m[1]!)} ${m[2]}`);
  if ((m = /^(\p{L}+)-(\d+)$/u.exec(core))) return one(`${m[1]} ${sayInteger(m[2]!)}`);
  const amount = sayAmount(core, prev, Boolean(next && /^(bin|milyon|milyar|trilyon)/u.test(next.core)));
  return amount === undefined ? undefined : one(amount);
}
