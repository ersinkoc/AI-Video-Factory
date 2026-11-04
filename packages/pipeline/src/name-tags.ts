import { namesMatch, VectorText, type VectorShot } from "@ys/core";

/**
 * Ad etiketi: kişinin ilk within görünüşünden çekimde yazı sınırına (bilgi kartı satırları + etiketler, texts) yer olan
 * ilkine konur. y: yönetmenin verdiği etiket noktası gibi başın üstü; render etiketi adıyla kişinin başına bağlar.
 */
export const NAME_TAG = { within: 3, texts: 2, y: 260 } as const;

/**
 * Unvanlı ya da sıra numaralı ad (Sultan Mehmed II, Emperor Constantine XI, Çandarlı Halil Pasha): kadronun İngilizce adı
 * bölümün dilinde başka yazılır ("II. Mehmed"); yönetmen etiketini yazmadıysa koddan yazılmaz.
 */
export const TITLED = /\b(?:sultan|emperor|empress|king|queen|prince|princess|pope|saint|pasha|paşa|shah|tsar|czar|caliph|khan|lord|lady|sir|duke|count|general|admiral)\b/i;
const NUMBERED = /\b[IVXLC]+\.?$/;

interface Person {
  id: string;
  name: string;
  kind?: string;
  reference?: string;
}

/**
 * Bölümde ilk kez görünen gerçek kişiye ad etiketi (4 Kas, 21 bölümün planı: 68 kişinin yalnız 17'si ilk göründüğü
 * çekimde adlandırılıyordu; Ballmer 8., Nadella 9. sahnede, Shannon 31 çekimin 13.'sünde; Schmidt, Karpathy, Zuckerberg
 * hiç. İnceleme "kim olduğu belli değil", "ad etiketi yok" diyordu). Sahneler paralel planlandığından hiçbir yönetmen
 * çağrısı kişinin bölümde ilk nerede göründüğünü bilmiyor; kod bilir. Etiketin yazısı yönetmenin bölümde o kişi için
 * yazdığı (kadroda başka kimseye uymayan) en uzun etiket (bölümün dilinde), yoksa kadrodaki adı: yalnız gerçek kişide
 * (referansı var), en az iki sözcük ve unvansız. Kişi ilk görünüşlerinden birinde zaten adlandırılmışsa dokunulmaz. Eklenen
 * etiket sayısını döner (yerinde).
 */
export function nameTags(shots: { vector?: VectorShot }[], cast: Person[]): number {
  const vectors = shots.flatMap((s) => (s.vector ? [s.vector] : []));
  const labels = vectors.flatMap((v) => v.texts.filter((t) => t.style === "label").map((t) => t.text));
  let added = 0;
  for (const person of cast) {
    if (person.kind !== undefined && person.kind !== "person") continue;
    // Yalnız bu kişiye uyan etiket: "Diesel" ailenin üçüne de uyar, kimseye kopyalanmaz.
    const own = labels.filter((t) => namesMatch(person.name, t) && !cast.some((o) => o !== person && namesMatch(o.name, t))).sort((a, b) => b.length - a.length)[0];
    const words = person.name.trim().split(/\s+/);
    const text = own ?? (person.reference && words.length >= 2 && !TITLED.test(person.name) && !NUMBERED.test(person.name) ? person.name.trim() : undefined);
    if (!text) continue;
    const seen = vectors.filter((v) => v.layers.some((l) => l.asset === person.id)).slice(0, NAME_TAG.within);
    for (const v of seen) {
      if (v.texts.some((t) => t.style === "label" && namesMatch(person.name, t.text))) break;
      if (v.texts.length >= NAME_TAG.texts) continue;
      const layer = v.layers.find((l) => l.asset === person.id)!;
      v.texts = [...v.texts, VectorText.parse({ text, style: "label", x: layer.x, y: NAME_TAG.y })];
      added++;
      break;
    }
  }
  return added;
}
