import { describe, expect, it } from "vitest";
import { SceneThree, VectorAsset } from "@ys/core";
import { contrastOf, contrastThree, fillOf, groundUnder, readableOn, readableShare, THREE_CONTRAST } from "../src/threeContrast.ts";

const bg = (svg: string) => VectorAsset.parse({ id: "room", kind: "background", svg, width: 1920, height: 1080, meta: {} });
const whole = { x: 0, y: 0, w: 1920, h: 1080 };
const LIGHT: [number, number, number] = [240, 240, 240];
const DARK: [number, number, number] = [20, 20, 40];

describe("contrastOf / readableShare", () => {
  it("WCAG oranı: siyah-beyaz 21, aynı renk 1", () => {
    expect(contrastOf([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastOf([0, 0, 0], [255, 255, 255])).toBe(contrastOf([255, 255, 255], [0, 0, 0]));
    expect(contrastOf(LIGHT, LIGHT)).toBe(1);
  });
  it("rengin okunduğu hücre payı", () => {
    expect(readableShare([0, 0, 0], [LIGHT, LIGHT, DARK, DARK])).toBe(0.5);
  });
});

describe("fillOf", () => {
  const svg = '<svg><defs><linearGradient id="sky"><stop offset="0" stop-color="#000" stop-opacity="0.4"/><stop offset="1" style="stop-color:#ffffff;stop-opacity:2"/></linearGradient><radialGradient id="none"><stop offset="0"/></radialGradient></defs></svg>';
  it("dolgusuz şekil opak siyah, düz renk kendisi; okunamayan renk kodu bilinmez", () => {
    expect(fillOf(svg, undefined)).toEqual({ rgb: [0, 0, 0], alpha: 1 });
    expect(fillOf(svg, "#ff8000")).toEqual({ rgb: [255, 128, 0], alpha: 1 });
    expect(fillOf(svg, "#ff800080")).toBeUndefined();
  });
  it("degradenin duraklarının ortalama rengi ve örtücülüğü (1'e kırpılır); durağı ya da kendisi olmayan, url olmayan dolgu bilinmez", () => {
    expect(fillOf(svg, "url(#sky)")).toEqual({ rgb: [127.5, 127.5, 127.5], alpha: 0.7 });
    expect(fillOf(svg, "url('#none')")).toBeUndefined();
    expect(fillOf(svg, "url(#yok)")).toBeUndefined();
    expect(fillOf(svg, "currentColor")).toBeUndefined();
  });
});

describe("groundUnder", () => {
  it("bölgenin altındaki en üst şekillerin renkleri (kutu değil sınır: dairenin köşesi alttakini gösterir)", () => {
    const room = bg('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#ffffff"/><circle cx="960" cy="540" r="300" fill="#000000"/></svg>');
    const centre = groundUnder(room, { x: 900, y: 480, w: 120, h: 120 })!;
    expect(centre.every((c) => c.join() === "0,0,0")).toBe(true);
    // Dairenin kutusunun köşesi: beyaz zemin.
    const corner = groundUnder(room, { x: 660, y: 240, w: 60, h: 60 })!;
    expect(corner.every((c) => c.join() === "255,255,255")).toBe(true);
    // Önbellekten aynı sonuç.
    expect(groundUnder(room, { x: 900, y: 480, w: 120, h: 120 })).toEqual(centre);
  });
  it("bölgenin çoğu bilinmiyorsa (okunamayan dolgu, boş yer) ya da çizim okunamıyorsa undefined", () => {
    const patterned = bg('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="url(#desen)"/><rect width="200" height="200" fill="#ffffff"/></svg>');
    expect(groundUnder(patterned, whole)).toBeUndefined();
    expect(groundUnder(patterned, { x: 0, y: 0, w: 150, h: 150 })).toBeDefined();
    // Yarısında hiç şekil yok: bilinen pay known'ın altında.
    expect(groundUnder(bg('<svg viewBox="0 0 1920 1080"><rect width="960" height="1080" fill="#ffffff"/></svg>'), whole)).toBeUndefined();
    // Saydam katmanlar alttakiyle harmanlanır; altı boş kalan saydam katman ya da okunamayan dolgu bilinmez.
    const glass = bg('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#000000"/><g opacity="0.5"><rect width="960" height="1080" style="fill:#ffffff;fill-opacity:1"/></g><rect x="960" width="960" height="1080" fill="#ffffff" fill-opacity="0"/></svg>');
    expect(groundUnder(glass, { x: 0, y: 0, w: 900, h: 1080 })!.every((c) => Math.round(c[0]) === 128)).toBe(true);
    expect(groundUnder(glass, { x: 1000, y: 0, w: 900, h: 1080 })!.every((c) => c[0] === 0)).toBe(true);
    expect(groundUnder(bg('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#ffffff" opacity="0.3"/></svg>'), whole)).toBeUndefined();
    expect(groundUnder(bg('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#ffffff"/><rect width="1920" height="1080" fill="url(#yok)" opacity="0.5"/></svg>'), whole)).toBeUndefined();
    // Okunamayan opacity değeri opak sayılır.
    expect(groundUnder(bg('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#ffffff" opacity="yarım"/></svg>'), whole)!.every((c) => c[0] === 255)).toBe(true);
    const broken = bg("<svg></svg>");
    expect(groundUnder(broken, whole)).toBeUndefined();
    expect(groundUnder(broken, whole)).toBeUndefined();
  });
});

describe("readableOn", () => {
  it("okunuyorsa aynen; açık zeminde koyulaşır, koyu zeminde açılır, en az değişimle", () => {
    expect(readableOn("#000000", [LIGHT])).toBe("#000000");
    const dark = readableOn("#70d6ff", [LIGHT]);
    const light = readableOn("#2f4a7a", [DARK]);
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
    expect(contrastOf(rgb(dark), LIGHT)).toBeGreaterThanOrEqual(THREE_CONTRAST.min);
    expect(contrastOf(rgb(light), DARK)).toBeGreaterThanOrEqual(THREE_CONTRAST.min);
    expect(rgb(dark)[2]).toBeLessThan(255);
    expect(rgb(light)[0]).toBeGreaterThan(0x2f);
  });
  it("karışık zeminde (hiçbir karışım çoğunda okunmuyor) ve hex olmayan renkte değişmez", () => {
    const mixed = [LIGHT, LIGHT, DARK, DARK];
    expect(readableOn("#808080", mixed)).toBe("#808080");
    expect(readableOn("#70d6ff", mixed)).toBe("#70d6ff");
    expect(readableOn("red", [LIGHT])).toBe("red");
  });
});

describe("contrastThree", () => {
  const item = SceneThree.parse({ preset: "network", color: "#70d6ff", accent: "#000000" });
  it("açık duvarda renk koyulaşır, okunan vurgu kalır; zemin bilinmiyorsa ya da okunuyorsa aynı nesne", () => {
    const wall = bg('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#f0f0f0"/></svg>');
    const out = contrastThree(item, wall, whole);
    expect(out.color).not.toBe("#70d6ff");
    expect(out.accent).toBe("#000000");
    expect(contrastThree(item, bg("<svg></svg>"), whole)).toBe(item);
    const night = bg('<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#101020"/></svg>');
    const bright = SceneThree.parse({ preset: "network", color: "#70d6ff", accent: "#ffd84d" });
    expect(contrastThree(bright, night, whole)).toBe(bright);
  });
});
