import { describe, expect, it } from "vitest";
import { splitBrows } from "../src/browShape.ts";

const svg = (brows: string, extra = "") => `<svg viewBox="0 0 400 800"><g id="head"><circle cx="200" cy="170" r="80"/>${brows}${extra}</g></svg>`;
const STROKE = 'stroke="#1b1a17" stroke-width="5" fill="none"';

describe("kaşların ayrılması", () => {
  it("iki ayrı şekil: soldaki brow-l, sağdaki brow-r; ortaları dönme noktası; çizimin geri kalanı aynı", () => {
    const right = `<path d="M208 143 Q220 137 234 145" ${STROKE}/>`;
    const left = `<path d="M166 145 Q180 137 192 143" ${STROKE}/>`;
    // Çizim sırası sağ, sol olsa da taraf ortaya göre seçilir.
    const out = splitBrows(svg(`<g id="brows">${right}${left}</g>`, '<g id="eyes"><circle cx="180" cy="160" r="6"/></g>'))!;
    expect(out.svg).toBe(svg(`<g id="brows"><g id="brow-l">${left}</g><g id="brow-r">${right}</g></g>`, '<g id="eyes"><circle cx="180" cy="160" r="6"/></g>'));
    expect(out.centres["brow-l"][0]).toBeCloseTo(179, 0);
    expect(out.centres["brow-r"][0]).toBeCloseTo(221, 0);
    expect(out.centres["brow-l"][1]).toBeGreaterThan(138);
    expect(out.centres["brow-l"][1]).toBeLessThan(146);
  });

  it("iki alt yollu tek yol ayrı yollara bölünür (öznitelikler korunur); çizim dışı çocuk yerinde kalır", () => {
    const out = splitBrows(svg(`<g id="brows"><title>kaşlar</title><path id="b" d="M160 145l28 2M212 147l28-2" ${STROKE}/></g>`))!;
    const [l, r] = [/<g id="brow-l">(.*?)<\/g>/.exec(out.svg)![1]!, /<g id="brow-r">(.*?)<\/g>/.exec(out.svg)![1]!];
    expect(out.svg).toContain('<g id="brows"><title>kaşlar</title><g id="brow-l">');
    // Kimlik iki parçada birden geçmesin diye düşer.
    expect(l).toMatch(/^<path d="M160,145[^"]*" stroke="#1b1a17" stroke-width="5" fill="none"\/>$/);
    expect(r).toMatch(/^<path d="M212,147[^"]*"/);
    expect(out.centres).toEqual({ "brow-l": [174, 146], "brow-r": [226, 146] });
  });

  it("grup çocuklar dönüşümleriyle ölçülür; açık kapanan şekil ve iç içe kendini kapatan grup okunur", () => {
    const out = splitBrows(
      svg(
        `<g id="brows"><g transform="translate(-20 0)"><path d="M180 140H200"></path><g/><desc>x</desc></g><g transform="translate(20 0)"><rect x="200" y="138" width="20" height="4"/></g></g>`,
      ),
    )!;
    expect(out.centres).toEqual({ "brow-l": [170, 140], "brow-r": [230, 140] });
  });

  it("ayrılamayan kaş: grup yok, boş, kendini kapatan, kapanmamış, tek kaş (yan çizim), tek parça geniş kaş, ölçülemeyen ya da bozuk yol", () => {
    expect(splitBrows('<svg viewBox="0 0 400 800"><g id="head"/></svg>')).toBeUndefined();
    expect(splitBrows(svg('<g id="brows"></g>'))).toBeUndefined();
    expect(splitBrows(svg('<g id="brows"/>'))).toBeUndefined();
    expect(splitBrows('<svg><g id="brows"><path d="M0 0H9"/>')).toBeUndefined();
    expect(splitBrows(svg(`<path id="brows" d="M160 145H188M212 145H240"/>`))).toBeUndefined();
    expect(splitBrows(svg(`<g id="brows"><path d="M225 146 Q234 141 243 145" ${STROKE}/></g>`))).toBeUndefined();
    // Kaşlar kutusunun tamamını kaplayan tek kaş (birleşik kaş) ve ortasında küçük bir tüy: sol yan boş.
    expect(splitBrows(svg('<g id="brows"><path d="M160 145H240"/><path d="M199 140H202"/></g>'))).toBeUndefined();
    expect(splitBrows(svg('<g id="brows"><path d="M160 145H188"/><circle cx="220" cy="145" r="0"/></g>'))).toBeUndefined();
    // paper "moveTo yok" diye hata fırlatır.
    expect(splitBrows(svg('<g id="brows"><path d="L 10 10"/></g>'))).toBeUndefined();
    expect(splitBrows(svg('<g id="brows"><path stroke="#000"/></g>'))).toBeUndefined();
  });
});
