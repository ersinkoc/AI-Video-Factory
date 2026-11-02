import { z } from "zod";

/**
 * Stil dokusu: render'da sahnenin üstüne (yazıların altına) binen, koddan üretilen durağan katman: kağıt lifi,
 * suluboya lekesi, tebeşir tozu, baskı noktası, gravür taraması, film greni, ekran çizgisi. Tasarımcının SVG'leri
 * çoğu pakette aynı düz vektör dilinde çıkıyordu (stil örnekleri, 3 Kas: paketler yalnız paletle ayrışıyordu); doku
 * paketi ayırır, token harcamaz ve kütüphanedeki eski çizimlere de uygulanır. Stüdyo önizlemesi aynı katmanı kullanır.
 */
export const Texture = z.enum(["none", "paper", "watercolor", "chalk", "halftone", "hatching", "grain", "scanlines"]);
export type Texture = z.infer<typeof Texture>;

/**
 * Katman normal saydamlıkla biner: karışım modu (multiply/screen) her karede bütün kareyi yeniden harmanlatıyordu,
 * 3 sn'lik sahnede render %25–35 uzadı; normal saydamlıkla fark ~%10 (ölçüm, 3 Kas). Koyu doku çarpmaya, açık doku
 * ekrana yakın görünür.
 */
export interface TextureLayer {
  /** 1920×1080 tuvali kaplayan SVG (genişlik/yükseklik %100, oran serbest). */
  svg: string;
  opacity: number;
}

/** Gürültüden saydamlık: sabit renk, saydamlık = R kanalı × k + offset. */
const noise = (id: string, freq: string, octaves: number, seed: number, rgb: string, k: number, offset: number) => {
  const [r, g, b] = rgb.split(" ");
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${k} 0 0 0 ${offset}"/></filter>`
  );
};

const pattern = (id: string, size: number, angle: number, body: string) =>
  `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">${body}</pattern>`;

const wrap = (defs: string, fills: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="none" width="100%" height="100%"><defs>${defs}</defs>${fills
    .map((f) => `<rect width="1920" height="1080" ${f}/>`)
    .join("")}</svg>`;

/** Dokunun katmanı; "none" için yok. `id` sayfadaki öteki dokularla çakışmasın diye tanımlara önek olur. */
export function textureLayer(kind: Texture, id = "ys-tex"): TextureLayer | undefined {
  // Kağıt: ince lif + geniş, düzensiz lekeler (kahverengi).
  const paper = noise(`${id}-fib`, "0.85", 2, 7, "0.42 0.33 0.22", 0.55, -0.2) + noise(`${id}-blot`, "0.005", 3, 3, "0.45 0.35 0.2", 0.5, -0.12);
  switch (kind) {
    case "none":
      return undefined;
    case "paper":
      return { svg: wrap(paper, [`filter="url(#${id}-fib)"`, `filter="url(#${id}-blot)"`]), opacity: 0.7 };
    case "watercolor":
      // Boya birikintileri: geniş, yumuşak lekeler; üstünde kağıt lifi.
      return {
        svg: wrap(noise(`${id}-wash`, "0.0035 0.006", 4, 11, "0.32 0.22 0.26", 1.1, -0.38) + paper, [`filter="url(#${id}-wash)"`, `filter="url(#${id}-fib)"`]),
        opacity: 0.55,
      };
    case "chalk":
      // Tebeşir tozu: seyrek açık benekler ve geniş silinti izleri.
      return {
        svg: wrap(noise(`${id}-dust`, "1.1", 2, 5, "1 1 1", 3.2, -1.75) + noise(`${id}-smear`, "0.004 0.012", 3, 9, "1 1 1", 0.6, -0.22), [`filter="url(#${id}-dust)"`, `filter="url(#${id}-smear)"`]),
        opacity: 0.55,
      };
    case "halftone":
      return { svg: wrap(pattern(`${id}-dot`, 8, 45, '<circle cx="4" cy="4" r="1.7" fill="#000"/>'), [`fill="url(#${id}-dot)"`]), opacity: 0.16 };
    case "hatching":
      // Gravür: eğik ince tarama ve kağıt.
      return {
        svg: wrap(pattern(`${id}-hatch`, 6, -35, '<line x1="0" y1="0" x2="0" y2="6" stroke="#2a1d10" stroke-width="1.1"/>') + paper, [`fill="url(#${id}-hatch)"`, `filter="url(#${id}-fib)"`]),
        opacity: 0.45,
      };
    case "grain":
      // Film greni: koyu benekler (açık gri benek görüntüyü sisli gösteriyordu).
      return { svg: wrap(noise(`${id}-grain`, "0.95", 2, 13, "0.08 0.08 0.08", 1.4, -0.52), [`filter="url(#${id}-grain)"`]), opacity: 0.55 };
    case "scanlines":
      return { svg: wrap(pattern(`${id}-scan`, 4, 0, '<rect width="4" height="1.3" fill="#000"/>'), [`fill="url(#${id}-scan)"`]), opacity: 0.18 };
  }
}
