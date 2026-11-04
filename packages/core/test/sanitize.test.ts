import { describe, expect, it } from "vitest";
import { prefixSvgIds, sanitizeSvg } from "../src/vector.ts";

describe("SVG temizleyici (30 Eki incelemesi)", () => {
  it.each([
    ['<svg viewBox="0 0 10 10" style="background-image:\\75rl(https://evil.example/a.png)"></svg>'],
    ["<svg viewBox=\"0 0 10 10\" style=\"background-image:image-set('https://evil.example/b.png' 1x)\"></svg>"],
    ['<svg viewBox="0 0 10 10"><use href="#x" style="cursor:u&#x72;l(https://evil.example/d)"/></svg>'],
    ['<svg viewBox="0 0 10 10"><rect fill="&#117;rl(https://evil.example/c.svg#p)"/></svg>'],
    ['<svg viewBox="0 0 10 10"><rect fill="url(#a) url(https://evil.example/x)"/></svg>'],
  ])("dış kaynak yükletmez: %s", (raw) => {
    const out = sanitizeSvg(raw);
    expect(out).not.toMatch(/evil\.example/);
  });

  it("style yalnız izinli özellikleri tutar", () => {
    expect(sanitizeSvg('<svg viewBox="0 0 1 1"><rect style="fill:#fff; position:fixed; stroke:url(#g)"/></svg>')).toBe(
      '<svg viewBox="0 0 1 1"><rect style="fill:#fff;stroke:url(#g)"/></svg>',
    );
  });

  it("tırnaklı url() tek biçime iner, kimlik önekleme başvuruyu da günceller", () => {
    const svg = sanitizeSvg(`<svg viewBox="0 0 1 1"><defs><linearGradient id="g"/></defs><rect fill="url( '#g' )"/></svg>`);
    expect(prefixSvgIds(svg, "p-")).toContain('fill="url(#p-g)"');
  });

  it("kapanmamış etikette üstel geri izleme yok", () => {
    const raw = `<svg viewBox="0 0 1 1"><path${' a="x"'.repeat(40)} <</svg>`;
    const started = performance.now();
    sanitizeSvg(raw);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("temizleyici: boşluksuz öznitelikler", () => {
  it("tırnaktan hemen sonra gelen öznitelik de okunur", () => {
    expect(sanitizeSvg('<svg viewBox="0 0 1 1"><rect x="1"y="2"/></svg>')).toBe('<svg viewBox="0 0 1 1"><rect x="1" y="2"/></svg>');
  });
});

describe("temizleyici: viewBox'sız kök (4 Kas, Commons çizimleri)", () => {
  it("genişlik ve yükseklikten viewBox eklenir: render kutuya ölçekler, çizim doğal pikseliyle taşmaz", () => {
    expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="835.5" height="567"><rect width="10" height="10"/></svg>')).toBe(
      '<svg viewBox="0 0 835.5 567" xmlns="http://www.w3.org/2000/svg" width="835.5" height="567"><rect width="10" height="10"/></svg>',
    );
    expect(sanitizeSvg('<svg height="24px" width=" 24 "></svg>')).toBe('<svg viewBox="0 0 24 24" height="24px" width=" 24 "></svg>');
  });

  it("viewBox varsa, boyut yüzdeyse, eksikse ya da sayı değilse dokunulmaz", () => {
    for (const raw of [
      '<svg viewBox="0 0 5 5" width="10" height="10"></svg>',
      '<svg width="100%" height="100%"></svg>',
      '<svg width="10"></svg>',
      '<svg width="10" height="0"></svg>',
      '<svg width="1e3" height="10"></svg>',
      "<svg></svg>",
    ])
      expect(sanitizeSvg(raw)).toBe(raw);
  });
});
