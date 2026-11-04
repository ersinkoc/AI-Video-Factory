import { describe, expect, it } from "vitest";
import { attachSuffix, harmonize, ordinal, romanValue, sayAbbreviation, sayInteger, sayNumber, type Part } from "../src/numbers.ts";
import { LEXICON, restoreWords, sayPlan } from "../src/pronounce.ts";

/**
 * Türkçe anlatımda sayıların ve kısaltmaların okunuşu: altyazı rakamı gösterir, TTS'e kesin kurallı okunuş gider
 * (ses motoru "1.5"i "bir nokta beş", "3/4"ü "üç bölü dört" okuyabiliyordu; rakamda ağız şekli de çıkmıyordu).
 */

const parts = (text: string): Part[] =>
  text.split(/\s+/).map((t) => {
    const lead = /^["'“‘«(\[]*/.exec(t)![0];
    const rest = t.slice(lead.length);
    const ap = rest.search(/['’]\p{L}/u);
    const body = ap > 0 ? rest.slice(0, ap) : rest;
    const core = body.replace(/[.,;:!?…"'”’»)\]]+$/u, "");
    return { lead, core, tail: rest.slice(core.length) };
  });
const say = (text: string) => sayPlan(text, LEXICON.tr!, "tr").spoken;

describe("tamsayı, sıra sayısı, ek uyumu", () => {
  it("Türkçe sayı adları: 'bir yüz', 'bir bin' yok; boş basamaklar atlanır; çok uzun dizi rakam rakam", () => {
    expect(sayInteger("0")).toBe("sıfır");
    expect(sayInteger("000")).toBe("sıfır");
    expect(sayInteger("7")).toBe("yedi");
    expect(sayInteger("100")).toBe("yüz");
    expect(sayInteger("110")).toBe("yüz on");
    expect(sayInteger("1453")).toBe("bin dört yüz elli üç");
    expect(sayInteger("2001")).toBe("iki bin bir");
    expect(sayInteger("1000000")).toBe("bir milyon");
    expect(sayInteger("2500000")).toBe("iki milyon beş yüz bin");
    expect(sayInteger("1000000000")).toBe("bir milyar");
    expect(sayInteger("1234567890123456789012")).toBe("bir iki üç dört beş altı yedi sekiz dokuz sıfır bir iki üç dört beş altı yedi sekiz dokuz sıfır bir iki");
  });

  it("sıra sayısı ünlü uyumuyla, 'dört' yumuşar", () => {
    expect(ordinal("iki")).toBe("ikinci");
    expect(ordinal("dört")).toBe("dördüncü");
    expect(ordinal("altı")).toBe("altıncı");
    expect(ordinal("on dokuz")).toBe("on dokuzuncu");
    expect(ordinal("yüz")).toBe("yüzüncü");
    expect(ordinal("kırk")).toBe("kırkıncı");
    expect(ordinal("bin dört yüz elli üç")).toBe("bin dört yüz elli üçüncü");
  });

  it("ek yeni köke uyar: ünlüler ve baştaki d/t; ünlüsüz kök ince sayılır", () => {
    expect(harmonize("dolar", "lük")).toBe("lık");
    expect(harmonize("avro", "lük")).toBe("luk");
    expect(harmonize("kat", "da")).toBe("ta");
    expect(harmonize("dolar", "ta")).toBe("da");
    expect(harmonize("yen", "ları")).toBe("leri");
    expect(harmonize("x", "da")).toBe("de");
  });

  it("Roma rakamı yalnız kanonikse; tek harfli L/C ad baş harfi olabilir", () => {
    expect(romanValue("II")).toBe(2);
    expect(romanValue("XIV")).toBe(14);
    expect(romanValue("XC")).toBe(90);
    expect(romanValue("IIII")).toBeUndefined();
    expect(romanValue("L")).toBeUndefined();
    expect(romanValue("C")).toBeUndefined();
    expect(romanValue("Mehmed")).toBeUndefined();
  });
});

describe("cümlede okunuş", () => {
  it("sıra sayıları: Roma rakamı, küçük harfli sözcükten önce, 20'ye kadar büyük harfliden önce; büyük yıl cümle sonu", () => {
    expect(say("II. Mehmed ve XIV. Louis 19. yüzyılda.")).toBe("ikinci Mehmed ve on dördüncü Louis on dokuzuncu yüzyılda.");
    expect(say("1. Dünya Savaşı")).toBe("birinci Dünya Savaşı");
    expect(say("Yıl 1453. İstanbul düştü.")).toBe("Yıl bin dört yüz elli üç. İstanbul düştü.");
    // Ardından sözcük yoksa ya da parantez açılıyorsa sıra sayısı değil.
    expect(say("Bölüm II.")).toBe("Bölüm II.");
    expect(say("Takım 11. (yeni)")).toBe("Takım on bir. (yeni)");
  });

  it("ondalık, binlik, sürüm, eksi, sıfırla başlayan", () => {
    expect(say("1,5 milyon ve 3,14 ile 0,5 ve 3,05 ve 2,00")).toBe("bir buçuk milyon ve üç virgül on dört ile sıfır virgül beş ve üç virgül sıfır beş ve iki virgül sıfır sıfır");
    expect(say("3.000 asker, 2.500.000 akçe, 1.250,75 lira")).toBe("üç bin asker, iki milyon beş yüz bin akçe, bin iki yüz elli virgül yetmiş beş lira");
    expect(say("Python 3.12, sürüm 2.1, Web 2.0.1 ve 1.5 kat")).toBe("paytın üç nokta on iki, sürüm iki nokta bir, Web iki nokta sıfır nokta bir ve bir buçuk kat");
    // Addan sonra gelse de ardından büyüklük gelirse ondalık.
    expect(say("Toplam 1.5 milyon")).toBe("Toplam bir buçuk milyon");
    expect(say("-5 derece, 007 ajan, -x")).toBe("eksi beş derece, sıfır sıfır yedi ajan, -x");
  });

  it("yüzde, para, kat, aralık, kesir, saat, bit, model adı, çağ, yaklaşık", () => {
    expect(say("%75'i ve 50% ile %7,5")).toBe("yüzde yetmiş beş'i ve yüzde elli ile yüzde yedi buçuk");
    expect(say("$1 milyarlık teklif, $500'lük hisse, 20€ bilet, €2,5 milyar zarar, £3 milyon, ₺10 ve ¥5")).toBe(
      "bir milyar dolarlık teklif, beş yüz dolar'lık hisse, yirmi avro bilet, iki buçuk milyar avro zarar, üç milyon sterlin, on lira ve beş yen",
    );
    // Para işaretinin ekleri varsa büyüklük sözcüğü yerinde kalır.
    expect(say("$5'lik milyon")).toBe("beş dolar'lık milyon");
    expect(say("10x hız, 2×'e çıktı")).toBe("on kat hız, iki kat'a çıktı");
    expect(say("1914-1918 ve (1452–1481) ile 3/4'ü, 1/2")).toBe("bin dokuz yüz on dört ile bin dokuz yüz on sekiz ve (bin dört yüz elli iki ile bin dört yüz seksen bir) ile dörtte üç'ü, ikide bir");
    expect(say("14:30'da, 09:05 ve 18:00")).toBe("on dört otuz'da, dokuz sıfır beş ve on sekiz");
    expect(say("64-bit ve GPT-2 ile COVID-19")).toBe("altmış dört bit ve GPT iki ile COVID on dokuz");
    expect(say("MÖ 3400 ve M.S. 330, MS Word")).toBe("milattan önce üç bin dört yüz ve milattan sonra üç yüz otuz, MS Word");
    expect(say("≈3 ve ~500 kişi, ≈x")).toBe("yaklaşık üç ve yaklaşık beş yüz kişi, ≈x");
  });

  it("geçersiz biçimler olduğu gibi kalır", () => {
    expect(say("%1,2,3 ve $1,2,3 ve 1,2,3x ve abc")).toBe("%1,2,3 ve $1,2,3 ve 1,2,3x ve abc");
    expect(sayNumber(parts("abc"), 0)).toBeUndefined();
  });

  it("kısaltmalar: nokta küçük harfle süren cümlede ve unvanda düşer, cümle sonunda kalır", () => {
    expect(say("kitap vb. şeyler, Dr. Ayşe ve Prof. Can, bkz. ek")).toBe("kitap ve benzeri şeyler, doktor Ayşe ve profesör Can, bakınız ek");
    expect(say("kalem, defter vs. Sonra")).toBe("kalem, defter vesaire. Sonra");
    expect(say("bunlar ör.")).toBe("bunlar örneğin.");
    // Noktasız ya da sözlükte olmayan.
    expect(sayAbbreviation(parts("vb ve"), 0)).toBeUndefined();
    expect(sayAbbreviation(parts("vd. ve"), 0)).toBeUndefined();
  });

  it("kısaltmanın açılımına ek Türkçe kuralla takılır: tamlamadan sonra zamir n'si, ünsüzden sonra kaynaştırma düşer", () => {
    expect(attachSuffix("Amerika Birleşik Devletleri", "ye")).toBe("ne");
    expect(attachSuffix("Avrupa Birliği", "den")).toBe("nden");
    expect(attachSuffix("Avrupa Birliği", "ten")).toBe("nden");
    expect(attachSuffix("Türkiye Büyük Millet Meclisi", "nin")).toBe("nin");
    expect(attachSuffix("Türkiye Büyük Millet Meclisi", "yi")).toBe("ni");
    expect(attachSuffix("Türkiye Büyük Millet Meclisi", "yle")).toBe("yle");
    expect(attachSuffix("Türk Dil Kurumu", "de")).toBe("nda");
    expect(attachSuffix("Birleşmiş Milletler", "ye")).toBe("e");
    expect(attachSuffix("Birleşmiş Milletler", "nin")).toBe("in");
    expect(attachSuffix("Birleşmiş Milletler", "yle")).toBe("le");
    expect(attachSuffix("Birleşmiş Milletler", "de")).toBe("de");
    expect(attachSuffix("Birleşmiş Milletler", "ler")).toBe("ler");
    // Tamlama olmayan ünlüyle biten açılım kendi kaynaştırmasını korur; ünsüz sertse t.
    expect(attachSuffix("nato", "ya")).toBe("ya");
    expect(attachSuffix("nato", "nun")).toBe("nun");
    expect(attachSuffix("nato", "a")).toBe("ya");
    expect(attachSuffix("Kuzey Kıbrıs", "ta")).toBe("ta");
  });

  it("cümlede kısaltma açılır, ek ona uyar; İngilizce anlatımda ek olduğu gibi", () => {
    expect(say("TBMM'nin kararı ABD'ye ve AB'den BM'ye, SSCB'nin çöküşü; TDK'ye göre MEB'de THY ile.")).toBe(
      "Türkiye Büyük Millet Meclisi'nin kararı Amerika Birleşik Devletleri'ne ve Avrupa Birliği'nden Birleşmiş Milletler'e, Sovyet Sosyalist Cumhuriyetler Birliği'nin çöküşü; Türk Dil Kurumu'na göre Milli Eğitim Bakanlığı'nda Türk Hava Yolları ile.",
    );
    // Kısaltma olmayan terimin eki yazarın biçiminde kalır; İngilizce anlatımda Türkçe ek kuralı yok.
    expect(say("C++'ın")).toBe("si pılas pılas'ın");
    // Sözcük gibi okunan kısaltma açılmaz, harflenmez: küçük harfli sözcük; ek yazarınki.
    expect(say("COBOL'un ardından NASA, NATO ve MS-DOS'u gördük.")).toBe("kobol'un ardından nasa, nato ve em es dos'u gördük.");
    expect(sayPlan("ABD'ye", { ABD: "Amerika Birleşik Devletleri" }, "en").spoken).toBe("Amerika Birleşik Devletleri'ye");
  });

  it("yalnız Türkçe; altyazı rakamı gösterir, ağız şekli okunuşu izler", () => {
    expect(sayPlan("In 1453 the city fell.", {}, "en").spoken).toBe("In 1453 the city fell.");
    const plan = sayPlan("1453'te II. Mehmed", {}, "tr");
    expect(plan.spoken).toBe("bin dört yüz elli üç'te ikinci Mehmed");
    expect(plan.used).toEqual({});
    const words = restoreWords(
      plan.spoken.split(" ").map((text, n) => ({ text, startMs: n * 100, endMs: n * 100 + 90 })),
      plan,
    );
    expect(words.map((w) => [w.text, w.say])).toEqual([
      ["1453'te", "bin dört yüz elli üç'te"],
      ["II.", "ikinci"],
      ["Mehmed", undefined],
    ]);
  });
});
