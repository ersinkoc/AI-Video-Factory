import type { ReactNode } from "react";
import { bindNumbers, fitSize, fitWrapped, type PartProps } from "./context.ts";
import { enterK, expoOut, FILM, wordsOf } from "./timing.ts";

/**
 * Kinetik tipografi (iddia): slam (satır 1,6'dan sertçe iner, headline-slam), rise (satır maskenin altından yükselir),
 * words (kelime kelime, her biri bir tempo adımında), chapter (büyük sayaç + etiket). Vurgu sözcüğü satırı oturduktan
 * sonra vurgu renginde bir hapın içine alınır (hap soldan açılır).
 */
export function Kinetic(p: PartProps) {
  const k = p.scene.kinetic!;
  const { box, colors, heading, frame, fps, enters } = p;
  const tall = p.height > p.width;
  // Dikeyde satırlar kayar (fitWrapped), yatayda her satır tek satıra sığar.
  // Sayı ardındaki kelimeyle tek kelime sayılır (bindLine; Marked da öyle çizer).
  const fit = k.lines.map((l) => pillRoom(bindLine(l, k.highlight), k.highlight && bindNumbers(k.highlight, true)));
  const size = tall ? fitWrapped(fit, box.w, box.h * 0.8, 170, heading.em) : fitSize(fit, box.w, 220, heading.em);
  // Kayan satırlar dengelenir, sonda tek kelime kalmaz (text-wrap: balance, satır sayısını artırmaz; 23 Kas, 9:16 film:
  // "Verified on / a", "that draws / it."; Chrome 157'de pretty bu kısa satırlarda bir şey değiştirmedi).
  const font = { fontFamily: heading.family, fontWeight: heading.weight, fontSize: size, lineHeight: 1.08, letterSpacing: "-0.02em", textWrap: "balance" };

  if (k.mode === "chapter") {
    const index = String(k.chapter?.index ?? 1).padStart(2, "0");
    const total = String(k.chapter?.total ?? k.chapter?.index ?? 1).padStart(2, "0");
    const q = enterK(frame, enters[0]!, fps);
    // Bölüm kartı: etiket satırları kutuya sığar, sayaç onun 2,6 katı (kutuyu aşmadan).
    const lineSize = tall ? fitWrapped(fit, box.w, box.h * 0.45, 110, heading.em) : fitSize(fit, box.w, 130, heading.em);
    const counter = Math.min(lineSize * 2.6, box.w * 0.42);
    return (
      <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", flexDirection: "column", justifyContent: "center", color: colors.fg }}>
        <div data-chapter="" style={{ overflow: "hidden", fontFamily: heading.family, fontWeight: heading.weight, fontSize: counter, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ display: "inline-block", transform: `translateY(${(1 - q) * 100}%)` }}>{index}</span>
          <span style={{ fontSize: counter * 0.28, opacity: 0.45, marginLeft: counter * 0.1 }}>/{total}</span>
        </div>
        {k.lines.map((line, i) => (
          <Line key={i} text={line} highlight={k.highlight} q={enterK(frame, enters[i + 1]!, fps)} pill={pillK(frame, enters[i + 1]!, fps)} colors={colors} style={{ ...font, fontSize: lineSize }} />
        ))}
      </div>
    );
  }

  let n = 0;
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: tall ? "flex-start" : "center", textAlign: tall ? "left" : "center", color: colors.fg }}>
      {k.lines.map((line, i) => {
        if (k.mode === "words") {
          const marks = markedWords(line, k.highlight);
          const words = wordsOf(line).map((w, j) => ({ w, at: enters[n++]!, hot: marks[j]! }));
          const done = words.at(-1)!.at;
          return (
            // Kelimeler taban çizgisine hizalanır: üst işaretli büyük harfli hap (PILL_LIFT) kelimesini uzatır, esnemede
            // yazısı diğerlerinden aşağıda kalırdı.
            <div key={i} style={{ ...font, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: `0 ${size * 0.26}px`, justifyContent: tall ? "flex-start" : "center" }}>
              {words.map(({ w, at, hot }, j) => {
                const q = enterK(frame, at, fps);
                // Hap iki yana PILL_BLEED taşar; vurgusuz komşunun yanında o kadar boşluk eklenir, yoksa 0,26 em'lik kelime
                // aralığı 0,06 em'e iner (23 Kas, gerçek filmde "konu" hapa yapışıktı). Vurgulu komşular tek hapta birleşir.
                const side = (k2: number) => (hot && words[k2] && !words[k2]!.hot ? PILL_BLEED : "0");
                return (
                  <span key={j} data-word="" style={{ display: "inline-block", marginLeft: side(j - 1), marginRight: side(j + 1), opacity: q, transform: `translateY(${(1 - q) * 0.25 * size}px) scale(${0.86 + 0.14 * q})` }}>
                    <Marked text={w} highlight={hot ? w : undefined} pill={pillK(frame, done, fps)} colors={colors} />
                  </span>
                );
              })}
            </div>
          );
        }
        const at = enters[i]!;
        const q = enterK(frame, at, fps);
        if (k.mode === "rise") return <Line key={i} text={line} highlight={k.highlight} q={q} pill={pillK(frame, at, fps)} colors={colors} style={font} />;
        // slam: büyükten iner, opaklık hızla gelir.
        const s = FILM.slamFrom - (FILM.slamFrom - 1) * q;
        return (
          <div key={i} data-slam="" style={{ ...font, opacity: Math.min(1, q * 3), transform: `scale(${s})`, transformOrigin: "50% 60%" }}>
            <Marked text={line} highlight={k.highlight} pill={pillK(frame, at, fps)} colors={colors} />
          </div>
        );
      })}
    </div>
  );
}

/** Satırın kelimelerinden vurgu ifadesinin içine düşenler (kelime kipinde ifade birkaç kelimeye yayılabilir). */
export function markedWords(line: string, highlight?: string): boolean[] {
  const words = wordsOf(line);
  const i = highlight ? foldedIndex(line, highlight) : -1;
  if (i < 0) return words.map(() => false);
  const end = i + highlight!.length;
  let at = 0;
  return words.map((w) => {
    const from = line.indexOf(w, at);
    at = from + w.length;
    return from < end && at > i;
  });
}

/**
 * Büyük/küçük harf duyarsız arama, metnin kendi indeksiyle: her karakter tek karakterle küçülür. "İ" küçülünce iki
 * karakter ("i" + nokta) oluyordu, ondan sonraki her indeks bir kayıyordu (23 Kas, film m7: "İlk önizleme ne kadar
 * sürdü?" satırında hap "ne kadar" yerine "e kadar sürdü?"yü kapladı).
 */
export function foldedIndex(text: string, part: string): number {
  const fold = (s: string) => Array.from({ length: s.length }, (_, j) => s[j]!.toLowerCase()[0]).join("");
  return fold(text).indexOf(fold(part));
}

/** Hap, satır oturduktan sonra açılır (girişten 1,5 giriş süresi sonra, yarım saniyede). */
const pillK = (frame: number, at: number, fps: number) => expoOut((frame - at - FILM.enterSec * fps * 1.5) / (0.4 * fps));

/**
 * Maskenin altından yükselen satır. Maske iki yandan LINE_BLEED kadar geniş (negatif kenar boşluğuyla yerleşim aynı):
 * vurgu hapı yazının 0,2 em dışına taşar, dar maske onu yazının hizasında kesiyordu (23 Kas, film denetçisi Lumen m11:
 * "hap 'Lumen'in kenarında bitiyor"). Altta da hapın alt uzantı payı kadar yer var (0,2 em; yerleşim eskisi gibi 0,08 em).
 */
const LINE_BLEED = "0.3em";
function Line({ text, highlight, q, pill, colors, style }: { text: string; highlight?: string; q: number; pill: number; colors: PartProps["colors"]; style: Record<string, string | number> }) {
  return (
    <div data-line="" style={{ ...style, overflow: "hidden", padding: `0 ${LINE_BLEED} 0.2em`, margin: `0 -${LINE_BLEED} -0.12em` }}>
      <div style={{ transform: `translateY(${(1 - q) * 110}%)` }}>
        <Marked text={text} highlight={highlight} pill={pill} colors={colors} />
      </div>
    </div>
  );
}

/** Hapın metnin iki yanından taşması. */
const PILL_BLEED = "0.2em";

/**
 * Üstünde işaret olan büyük harf (İ, Ö, Ü, Ğ, Â…) için hapın üstte uzaması. Hap büyük harfin üstüne göre ayarlıdır,
 * "İ"nin noktası hapın üst kenarından ~0,02 em taşıyor, zeminle birleşip kesik görünüyordu (24 Kas, 16:9 Türkçe film m11
 * "400 İstasyon", film denetçisi; m13 "daha temiz İzmir" sınırda). Pay dolgu olarak eklenir: satır da o kadar büyür,
 * üstteki satıra yaklaşmaz, yükselen satırın maskesi noktayı kesmez.
 */
export const PILL_LIFT = 0.1;

/**
 * Hapın altta satıra eklediği pay (em). Hap alt uzantılar için satır kutusunun 0,16 em altına iner; slam ve kelime
 * kipinde satır aralığı 1,08 olduğundan bu, alttaki satırın yüksek harflerine biniyordu, zemin vurgu renginde hap yazıyla
 * aynı renkte olduğundan "d", "t", "f" hapa karışıyordu (24 Kas, 16:9 İspanyolca film m8 "9,1 sobre 10 / Índice de
 * satisfacción"; denetçi geçirdi, gözle bulundu). Pay kenar boşluğu olarak eklenir: hapın satırı (kaymış satırda hapın
 * bulunduğu sıra) o kadar büyür, alttaki satır hapın altından başlar; 0,04 em fazlası alttaki büyük harfin vurgusuna.
 */
export const PILL_DROP = 0.2;

/** Metinde üstünde işaret olan büyük harf var mı (NFD'de büyük harf + U+0300–U+0315 arası üst birleşen işaret). */
export const capMarked = (text: string) =>
  Array.from(text.normalize("NFD")).some((c, j, all) => j > 0 && /\p{Lu}/u.test(all[j - 1]!) && c.codePointAt(0)! >= 0x300 && c.codePointAt(0)! <= 0x315);

/**
 * Metnin içindeki vurgu sözcüğünü hapa alır (büyük/küçük harf duyarsız; yoksa metin olduğu gibi). Hap alt uzantıları da
 * kapsar (inset altı −0,16 em): büyük puntoda "Senaryo"nun y'si, "Çıktı"nın Ç çengeli hapın altından taşıyordu (23 Kas,
 * film denetçisi AI Video Factory m5/m7/m8).
 */
export function Marked({ text, highlight, pill, colors }: { text: string; highlight?: string; pill: number; colors: PartProps["colors"] }): ReactNode {
  const parts = pillParts(text, highlight);
  if (!parts) return bindNumbers(text);
  const { before, mark, after } = parts;
  // Hap iki yana PILL_BLEED taşar: satırda komşu yazı olan yanda o kadar boşluk eklenir, yoksa kelime aralığı ~0,05 em'e
  // iner ve hap komşu kelimeye yapışır (23 Kas, 9:16 film: "ilk|altı ayı.", "14|çiftlik."; kelime kipi bunu zaten yapıyordu).
  return (
    <>
      {bindNumbers(before)}
      <span data-pill="" style={{ position: "relative", display: "inline-block", isolation: "isolate", paddingTop: capMarked(mark) ? `${PILL_LIFT}em` : 0, marginBottom: `${PILL_DROP}em`, marginLeft: before ? PILL_BLEED : 0, marginRight: after ? PILL_BLEED : 0, color: pill > 0.5 ? colors.onAccent : undefined }}>
        <span style={{ position: "absolute", inset: `0.04em -${PILL_BLEED} -0.16em`, borderRadius: "0.18em", background: colors.accent, transform: `scaleX(${pill})`, transformOrigin: "0 50%", zIndex: -1 }} />
        {bindNumbers(mark, true)}
      </span>
      {bindNumbers(after)}
    </>
  );
}

/**
 * Satırın hapın öncesi, hap ve sonrası. Hapın hemen ardındaki noktalama hapın içine alınır: dikeyde hap kayınca nokta tek
 * başına alt satıra düşüyordu; hap kendi içinde kayabilir.
 */
function pillParts(text: string, highlight?: string): { before: string; mark: string; after: string } | undefined {
  const i = highlight ? foldedIndex(text, highlight) : -1;
  if (i < 0) return undefined;
  const end = i + highlight!.length;
  const tail = /^[^\s]*/.exec(text.slice(end))![0];
  return { before: text.slice(0, i), mark: text.slice(i, end + tail.length), after: text.slice(end + tail.length) };
}

/** Satır, Marked'ın çizdiği gibi bağlanmış: hapın içinde sayı her kelimeye, dışında yalnız büyüklük kelimesine (bindNumbers). */
export function bindLine(text: string, highlight?: string): string {
  const parts = pillParts(text, highlight);
  return parts ? bindNumbers(parts.before) + bindNumbers(parts.mark, true) + bindNumbers(parts.after) : bindNumbers(text);
}

/**
 * Sığdırma için satır: hapın komşu yazı olan yanlardaki payı (en çok 2 × PILL_BLEED = 0,4 em) hapın son kelimesine bir
 * harf eklenerek sayılır (bir harf ~0,5 em).
 */
export function pillRoom(line: string, highlight?: string): string {
  const i = highlight ? foldedIndex(line, highlight) : -1;
  if (i < 0) return line;
  const end = i + highlight!.length;
  const stop = end + /^[^\s]*/.exec(line.slice(end))![0].length;
  if (i === 0 && stop === line.length) return line;
  return `${line.slice(0, stop)}x${line.slice(stop)}`;
}
