import { describe, expect, it } from "vitest";
import { PAPER, paperOf, translucentShare, withPaper } from "../src/paperBase.ts";

const PAPER_C = "#fdf6ec";

describe("kâğıt zemini (suluboyanın opak altı)", () => {
  it("yarı saydam dolguların payını sayar: tanımlar, yazılar, dolgusuzlar sayılmaz; grup boyası miras kalır", () => {
    const svg = [
      '<svg viewBox="0 0 100 100">',
      '<defs><linearGradient id="g"><stop offset="0"/></linearGradient><rect width="9" height="9" opacity="0.2"/></defs>',
      '<text x="0" y="0">yazı</text>',
      '<rect width="10" height="10" fill="#e56b6f"/>',
      '<rect width="10" height="10" fill="#e56b6f" opacity="0.6"/>',
      '<g opacity="0.5"><circle r="4" fill="#355070"/></g>',
      '<g fill-opacity="0.4"><ellipse rx="3" ry="2" fill="#eaac8b"/><ellipse rx="3" ry="2" fill="#eaac8b" fill-opacity="1"/></g>',
      '<path d="M0 0H9" fill="none" stroke="#000"/>',
      '<path d="M0 0H9" style="fill:transparent"/>',
      '<rect width="10" height="10" fill="#fff" style="display:none"/>',
      '<rect width="10" height="10" fill="#fff" visibility="hidden"/>',
      '<line x1="0" y1="0" x2="9" y2="9"/>',
      "</svg>",
    ].join("");
    // Dolgulu 5 şekil: opak kare, %60 kare, %50 daire, %40 elips, tam opak elips → 3/5.
    expect(translucentShare(svg)).toBeCloseTo(3 / 5);
    expect(translucentShare("<svg></svg>")).toBe(0);
    expect(translucentShare("<g/>")).toBe(0);
    // Okunamayan opaklık tam opak sayılır.
    expect(translucentShare('<svg><rect width="1" height="1" opacity="x"/></svg>')).toBe(0);
  });

  it("nesnenin bütün içeriğinin silüeti en başa konur; soluk, koyu yarı saydam ve degrade şekiller girmez", () => {
    const svg = [
      '<svg viewBox="0 0 100 100" fill="#b56576">',
      '<ellipse cx="50" cy="95" rx="40" ry="5" fill="#1d1a24" opacity="0.4"/>',
      '<ellipse cx="50" cy="95" rx="40" ry="5" fill="black" opacity="0.5"/>',
      '<rect x="10" y="10" width="80" height="60" opacity="0.6" transform="rotate(2)" data-x="1"/>',
      '<rect x="10" y="10" width="80" height="60" fill="url(#g)" opacity="0.6"/>',
      '<rect x="10" y="10" width="80" height="60" fill="url(#g)"/>',
      '<rect x="0" y="0" width="100" height="100" fill="#fff" opacity="0.15"/>',
      '<g transform="translate(5 5)" clip-path="url(#c)" class="k"><circle cx="5" cy="5" r="4" fill="#eaac8b"/></g>',
      "<g/>",
      "</svg>",
    ].join("");
    const out = withPaper(svg, PAPER_C);
    // Çizim olduğu gibi durur, silüet kök etiketin hemen ardında.
    expect(out.replace(/<g data-paper="">.*?<\/g><\/g>/, "")).toBe(svg);
    const base = /<g data-paper="">(.*?<\/g>)<\/g>/.exec(out)![1]!;
    expect(base).toBe(
      `<rect x="10" y="10" width="80" height="60" transform="rotate(2)" fill="${PAPER_C}" stroke="none"/>` +
        `<g transform="translate(5 5)" clip-path="url(#c)"><circle cx="5" cy="5" r="4" fill="${PAPER_C}" stroke="none"/></g>`,
    );
  });

  it("kendini kapatan öğeler ve bozuk iç içelik silüeti bozmaz", () => {
    const svg = '<svg viewBox="0 0 400 800"><use href="#x"/><g/><g id="head"><g/><rect width="9" height="9" fill="#eaac8b" opacity="0.6"/></g></g><rect width="9" height="9" fill="#eaac8b" opacity="0.6"/></svg>';
    const out = withPaper(svg, PAPER_C, ["head"]);
    expect(out).toContain(`<g id="head"><g data-paper=""><rect width="9" height="9" fill="${PAPER_C}" stroke="none"/></g><g/>`);
    // Nesne: fazladan kapanış silüette grup açmaz.
    expect(withPaper(svg, PAPER_C)).toContain(`<g data-paper=""><g><rect width="9" height="9" fill="${PAPER_C}" stroke="none"/></g><rect width="9" height="9" fill="${PAPER_C}" stroke="none"/></g><use`);
  });

  it("silüete girecek şekli olmayan çizim değişmez; kökü olmayan da", () => {
    const glass = '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff" opacity="0.2"/></svg>';
    expect(withPaper(glass, PAPER_C)).toBe(glass);
    expect(withPaper("<g/>", PAPER_C)).toBe("<g/>");
    expect(withPaper(glass, PAPER_C, ["head"])).toBe(glass);
  });

  it("iskelette her parçanın silüeti kendi grubunda, iç içe parçalar ayrı; parçasız içerik silüetsiz", () => {
    const svg = [
      '<svg viewBox="0 0 400 800">',
      '<ellipse cx="200" cy="790" rx="90" ry="8" fill="#eaac8b" opacity="0.5"/>',
      '<g id="body" opacity="0.6"><rect width="80" height="200" fill="#355070"/>',
      '<g id="arm-l"><rect width="20" height="100" fill="#6d597a"/>',
      '<g id="forearm-l"><rect width="18" height="90" fill="#6d597a" fill-opacity="0.7"/></g>',
      "</g>",
      "</g>",
      '<g id="head"><circle cx="200" cy="200" r="60" fill="#eaac8b"/><g id="decor"><circle r="2" fill="#000"/></g></g>',
      '<g id="other"><rect width="5" height="5" fill="#fff"/></g>',
      "</svg>",
    ].join("");
    const out = withPaper(svg, PAPER_C, ["head", "body", "arm-l", "forearm-l", "leg-l"]);
    const groups = (id: string) => new RegExp(`<g id="${id}"[^>]*><g data-paper="">(.*?)</g>`).exec(out)?.[1];
    expect(groups("body")).toBe(`<rect width="80" height="200" fill="${PAPER_C}" stroke="none"/>`);
    expect(groups("arm-l")).toBe(`<rect width="20" height="100" fill="${PAPER_C}" stroke="none"/>`);
    expect(groups("forearm-l")).toBe(`<rect width="18" height="90" fill="${PAPER_C}" stroke="none"/>`);
    // Başın içindeki parçasız grup başın silüetine girer (siyah nokta tam opak: altında kâğıt olsa da görünmez).
    expect(out).toContain(`<g id="head"><g data-paper=""><circle cx="200" cy="200" r="60" fill="${PAPER_C}" stroke="none"/><g><circle r="2" fill="${PAPER_C}" stroke="none"/></g></g>`);
    // Yer gölgesi ve parça olmayan grup silüetsiz.
    expect(out).toContain('<g id="other"><rect');
    expect(out.match(/data-paper/g)).toHaveLength(4);
  });

  it("kâğıt rengi suluboya dokusunda paletin en açık rengi; öteki paketlerde yok", () => {
    expect(PAPER.textures).toContain("watercolor");
    expect(paperOf("watercolor", ["#355070", "#6d597a", "#b56576", "#e56b6f", "#eaac8b", "#fdf6ec"])).toBe("#fdf6ec");
    expect(paperOf("watercolor", ["#fff1e6", "#ffb4a2"])).toBe("#fff1e6");
    expect(paperOf("watercolor", [])).toBe("#fdf6ec");
    expect(paperOf("paper", ["#fdf6ec"])).toBeUndefined();
    expect(paperOf(undefined, ["#fdf6ec"])).toBeUndefined();
  });
});
