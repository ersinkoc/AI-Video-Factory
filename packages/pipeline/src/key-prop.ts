import type { VectorLayer, VectorShot } from "@ys/core";

/**
 * Nesne kimliğinde anlam taşımayan sözcükler (boy, yaş, renk, genel ad): "p-big-red-phone" açıklamadaki "big room" ya da
 * "red errors" ile eşleşmesin; "phone" yeter.
 */
const STOP = new Set([
  "of", "on", "in", "an", "to", "at", "by", "or", "is", "it", "as", "up",
  "the", "and", "with", "for", "prop", "item", "object", "thing",
  "old", "new", "big", "small", "large", "tiny", "giant", "huge", "open", "closed", "blank",
  "red", "blue", "green", "yellow", "white", "black", "grey", "gray", "orange", "purple", "pink", "brown", "gold", "silver",
]);

/**
 * Kimliğin açıklamada ilk geçtiği yer (sözcük olarak; tekil/çoğul farkı sayılmaz), geçmiyorsa undefined. İki harfli
 * sözcük de sayılır ("p-tv", "p-pc"); kimliğin "p-" öneki tek harftir.
 */
function mention(asset: string, text: string): number | undefined {
  const words = asset.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
  let first: number | undefined;
  for (const w of words) {
    // Sözcükler yalnız harf ve rakam (yukarıdaki bölme): düzenli ifadede kaçış gerekmez.
    const forms = [w, w.replace(/e?s$/, "")].filter((f) => f.length >= 2).join("|");
    const at = new RegExp(`\\b(?:${forms})(?:e?s)?\\b`).exec(text)?.index;
    if (at !== undefined && (first === undefined || at < first)) first = at;
  }
  return first;
}

/** Açıklamada bu kadar nesne sayılıyorsa çekim tek bir nesneyi değil bir düzeni anlatır. */
export const KEY_PROP = { list: 3 } as const;

/**
 * Çekimin anlatılan nesnesi (VectorShot.key), yönetmen vermediyse: adı çekim açıklamasında geçen nesne katmanı. Elde
 * tutulan önce gelir (anlatılan odur), sonra açıklamada ilk geçen. Üstünde bir şey duran ya da birinin oturduğu yüzey
 * (masa, sandalye) aday değil: "masasında kâğıt katlıyor" kâğıdı anlatır. Açıklama KEY_PROP.list ya da daha çok nesne
 * sayıyorsa ("eski televizyon, video ve ekmek kızartma makinesi arasında"; "mikrofonla konuşuyor, balon penguene işaret
 * ediyor") anlatılan tek nesne yok: birine yaklaşan kamera ötekileri kenara itip kesiyordu. Yanlış seçilen büyük nesne
 * zararsızdır, kamera okunan nesneye yaklaşmaz.
 */
export function keyPropOf(description: string, layers: VectorLayer[], isProp: (asset: string) => boolean): number | undefined {
  const text = description.toLowerCase();
  const surfaces = new Set(layers.map((l) => l.on));
  const found = layers.flatMap((l, i) => {
    if (!isProp(l.asset) || surfaces.has(i)) return [];
    const at = mention(l.asset, text);
    return at === undefined ? [] : [{ i, at, held: l.heldBy !== undefined }];
  });
  found.sort((a, b) => Number(b.held) - Number(a.held) || a.at - b.at || a.i - b.i);
  return found.length < KEY_PROP.list ? found[0]?.i : undefined;
}

/** Yönetmenin geçerli bir nesneye işaret eden key'i kalır; yoksa (ya da kişiyi, yok bir katmanı gösteriyorsa) açıklamadan çıkarılır. */
export function withKey(spec: VectorShot, description: string, isProp: (asset: string) => boolean): VectorShot {
  const asked = spec.key === undefined ? undefined : spec.layers[spec.key];
  if (asked && isProp(asked.asset)) return spec;
  const { key: _drop, ...rest } = spec;
  const key = keyPropOf(description, spec.layers, isProp);
  return key === undefined ? rest : { ...rest, key };
}
