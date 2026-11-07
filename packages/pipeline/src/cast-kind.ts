/**
 * Kadroda "kişi" diye işaretlenmiş nesne (3 Kas, Java bölümü: "Star7 — erken el cihazı prototipi" kişi olarak geldi,
 * insan iskeletine çizilince robot oldu; denetçi 7 çekimde "Star7 cihazı yok, yerinde robot var" dedi). Rolü ya da görünüm
 * tarifinin ilk cümlesi bir cihaz/eşya adı taşıyan ve hiçbir insan sözcüğü içermeyen oyuncu nesnedir. Kollu bacaklı
 * maskot (Duke) kişi kalır ("mascot" insan listesinde); "robot" iki listede de yok, kişi kalır.
 */
const THING =
  /\b(device|prototype|machine|computer|laptop|phone|smartphone|pda|handheld|gadget|console|tablet|terminal|calculator|chip|processor|microprocessor|server|printer|camera|radio|television|tv|car|truck|train|locomotive|ship|boat|plane|aircraft|rocket|satellite|logo|icon|book|document|letter|envelope|bag|box|bottle|cup|product|appliance|instrument|tool)s?\b/i;
const HUMAN =
  /\b(man|men|woman|women|boy|girl|person|people|child|children|kid|baby|engineer|programmer|developer|scientist|inventor|founder|ceo|king|queen|sultan|soldier|worker|teacher|student|host|presenter|mascot|he|she|his|her|him|human)\b/i;

export function looksLikeObject(c: { role: string; visualDescription: string }): boolean {
  const first = c.visualDescription.split(/[.:;]/)[0]!;
  const text = `${c.role} ${first}`;
  return THING.test(text) && !HUMAN.test(`${c.role} ${c.visualDescription}`);
}

const FIGURE = /\b(robot|android|humanoid|cyborg|mascot)s?\b/i;
const BODY = /\b(legs?|feet|sits?|sitting|stands?|standing|walks?|walking)\b/i;

/**
 * Nesne diye işaretlenmiş ama gövdeli bir figür: tarifinin ilk cümlesi robot/android/maskot diyen, ayakları olan ya da
 * oturan/yürüyen oyuncu kişidir (7 Kas, LLM bölümü: anlatıcı robot "object" geldi, iskeletsiz nesne olarak 34 çekimde
 * durdu; yönetmenin verdiği 28 jest çizilemedi, kadraj onu kişi gibi korumadı, taslak incelemede 7 kez "robot köşede
 * kesik, ince bir şerit"; TypeScript bölümündeki masada yazan robot da öyle). Ayaksız sanayi robot kolu nesne kalır.
 */
export function looksLikeFigure(c: { role: string; visualDescription: string }): boolean {
  const first = c.visualDescription.split(/[.:;]/)[0]!;
  return FIGURE.test(first) && BODY.test(c.visualDescription);
}
