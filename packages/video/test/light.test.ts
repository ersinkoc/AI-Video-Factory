import type { VectorAsset } from "@ys/core";
import { describe, expect, it } from "vitest";
import { keyLight, LIGHT, lightOf, measuredSide } from "../src/light.ts";

const room = (body: string, vb = "0 0 1920 1080") => `<svg viewBox="${vb}"><rect width="1920" height="1080" fill="#8a7f70"/>${body}</svg>`;
const bg = (id: string, svg: string): VectorAsset => ({ id, kind: "background", svg, width: 1920, height: 1080, meta: {} });
// Duvardan belirgin parlak, orta boy pencere.
const WINDOW = (x: number) => `<rect x="${x}" y="200" width="300" height="400" fill="#dff1ff"/>`;

describe("ışık: yönü", () => {
  it("pencere hangi yandaysa ışık oradan gelir; ortadaysa ya da parlak şekil yoksa belirsiz", () => {
    expect(measuredSide(room(WINDOW(150)))).toBe(-1);
    expect(measuredSide(room(WINDOW(1450)))).toBe(1);
    // Ortada (ortası çizimin ortasına lean'den yakın).
    expect(measuredSide(room(WINDOW(810)))).toBeUndefined();
    // İki yanda eşit pencere: ağırlık ortada.
    expect(measuredSide(room(WINDOW(150) + WINDOW(1470)))).toBeUndefined();
    expect(measuredSide(room(""))).toBeUndefined();
  });

  it("ışık kaynağı sayılmayanlar: duvardan yeterince parlak olmayan, nokta kadar küçük, duvar kadar büyük, gradyan dolgulu", () => {
    // Duvar zaten açık: pencere ondan above kadar parlak değil.
    const light = `<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#e8f0f4"/>${WINDOW(150)}</svg>`;
    expect(measuredSide(light)).toBeUndefined();
    expect(measuredSide(room(`<rect x="100" y="100" width="20" height="20" fill="#ffffff"/>`))).toBeUndefined();
    expect(measuredSide(room(`<rect x="0" y="0" width="1100" height="1080" fill="#ffffff"/>`))).toBeUndefined();
    expect(measuredSide(room(`<rect x="150" y="200" width="300" height="400" fill="url(#sky)"/>`))).toBeUndefined();
    // Koyu pencere (gece) parlak sayılmaz.
    expect(measuredSide(room(`<rect x="150" y="200" width="300" height="400" fill="#203040"/>`))).toBeUndefined();
  });

  it("viewBox'ı okunamayan ya da düz dolgusu olmayan çizim belirsiz; viewBox kayıksa ortası ona göre", () => {
    expect(measuredSide("<svg></svg>")).toBeUndefined();
    expect(measuredSide(`<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="url(#g)"/></svg>`)).toBeUndefined();
    // viewBox 1000'den başlıyor: pencere x 1150 sol yanda.
    const shifted = `<svg viewBox="1000 0 1920 1080"><rect x="1000" width="1920" height="1080" fill="#8a7f70"/><rect x="1150" y="200" width="300" height="400" fill="#dff1ff"/></svg>`;
    expect(measuredSide(shifted)).toBe(-1);
    // Duvar (en büyük şekil) önce çizilmemiş olsa da duvar sayılır.
    const later = `<svg viewBox="0 0 1920 1080"><rect x="1450" y="200" width="300" height="400" fill="#dff1ff"/><rect width="1920" height="1080" fill="#8a7f70"/></svg>`;
    expect(measuredSide(later)).toBe(1);
  });

  it("ölçülemeyen odada yan oda kimliğinden: aynı odada hep aynı, ters açısı öbür yan; ölçülen yan ters açıda da ölçülür", () => {
    const plain = room("");
    const a = lightOf(bg("l1", plain));
    expect(lightOf(bg("l1", plain))).toBe(a);
    expect(lightOf(bg("l1~rev", plain))).toBe(-a);
    // Birçok odadan ikisi farklı yanda (tohum gerçekten dağılır).
    expect(new Set(Array.from({ length: 20 }, (_, i) => lightOf(bg(`room-${i}`, plain)))).size).toBe(2);
    expect(lightOf(bg("l9~rev", room(WINDOW(1450))))).toBe(1);
    expect(lightOf(undefined)).toBe(-1);
    // Varlık başına bir kez ölçülür (aynı nesne).
    const once = bg("l7", room(WINDOW(150)));
    expect(lightOf(once)).toBe(-1);
    once.svg = room(WINDOW(1450));
    expect(lightOf(once)).toBe(-1);
  });
});

describe("ışık: sahneye düşüşü", () => {
  it("ışık yanı aydınlık, öbür yan gölgede", () => {
    expect(keyLight(-1).background).toBe(
      `linear-gradient(90deg, rgba(255,246,228,${LIGHT.key}) 0%, rgba(255,246,228,0) 42%, rgba(12,14,30,0) 58%, rgba(12,14,30,${LIGHT.fall}) 100%)`,
    );
    expect(String(keyLight(1).background)).toMatch(/^linear-gradient\(270deg/);
  });
});
