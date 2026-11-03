import { describe, expect, it } from "vitest";
import { anatomical, ANATOMY_FRONT, ELBOW_FLEX, fitAngle, flexion, maxPhi, SHOULDER, STRETCH } from "../src/anatomy.ts";

type P = { rotate: number; sx: number; sy: number; tx: number; ty: number };
const at = (rotate: number, sy = 1, sx = 1): P => ({ rotate, sx, sy, tx: 0, ty: 0 });

describe("anatomi: dirseğin 3B açısı", () => {
  it("iki parça tam boyken bükülme izdüşüm açısıdır; kameraya uzanan parça açıyı değiştirir", () => {
    expect(flexion(1, 1, 120)).toBeCloseTo(120);
    expect(flexion(1, 1, -120)).toBeCloseTo(120);
    // Düşünen kişi: üst kol öne uzanmış (0,62), ön kol dik; izdüşümde 160°, gerçekte ~126°.
    expect(flexion(0.62, 1, 160)).toBeCloseTo(125.6, 1);
    // İzdüşümde düz kol, ön kol kameraya uzanmış (yarı boy): dirsek 60° bükülü.
    expect(flexion(1, 0.5, 0)).toBeCloseTo(60);
  });

  it("bükülmeyi sınırda tutan en büyük izdüşüm açısı; kameraya çok uzanan kolda her açı olur", () => {
    expect(maxPhi(1, 1, ELBOW_FLEX)).toBeCloseTo(150);
    expect(flexion(0.9, 1, maxPhi(0.9, 1, 140))).toBeCloseTo(140);
    // Öne uzanmış (0,62) üst kolla dirsek en çok ~128° bükülebilir: her izdüşüm açısı olur.
    expect(maxPhi(0.62, 1, 140)).toBe(180);
    expect(maxPhi(0.4, 0.4, ELBOW_FLEX)).toBe(180);
  });
});

describe("anatomi: açı aralığı", () => {
  it("aralıktaki açı olduğu gibi döner (kayan nokta kayması yok); 360° sarar, sonuç girdinin penceresinde", () => {
    expect(fitAngle(0.1, { min: 300, max: 420 })).toBe(0.1);
    expect(fitAngle(0.1, { min: 200, max: 300 })).toBe(-60);
    // rotate(172) = rotate(−188): sağ kol başın üstünden 8° öbür yana, sınırın içinde.
    expect(fitAngle(172, { min: -195, max: 50 })).toBe(172);
    // Sınırın dışı en yakın kenara, girdinin penceresinde: 250 (= −110) sol kolun 195 sınırına.
    expect(fitAngle(250, { min: -50, max: 195 })).toBe(195);
    expect(fitAngle(-110, { min: -50, max: 195 })).toBe(-165);
    expect(fitAngle(-80, { min: -50, max: 195 })).toBe(-50);
  });
});

describe("anatomi: poz kırpma", () => {
  it("önden: aşırı bükülen dirsek 150°'ye, yana kırılan diz 30°'ye, boyun 40°'ye; kameraya uzanan kolun dirseği serbest", () => {
    const pose = { "arm-r": at(0), "forearm-r": at(160), "shin-l": at(40), head: at(-60) };
    const { pose: out, strains } = anatomical(pose, false);
    expect(out).toBe(pose);
    expect(out["forearm-r"].rotate).toBeCloseTo(150);
    expect([out["shin-l"].rotate, out.head.rotate]).toEqual([30, -40]);
    expect(strains.map((s) => [s.part, s.what, Math.round(s.limit)])).toEqual([
      ["forearm-r", "rotate", 150],
      ["shin-l", "rotate", 30],
      ["head", "rotate", -40],
    ]);
    expect(anatomical({ "arm-r": at(10, 0.62), "forearm-r": at(160) }, false).strains).toEqual([]);
    // Üst kolu verilmeyen ön kol tam boy üst kolla ölçülür.
    expect(anatomical({ "forearm-l": at(-155) }, false).pose["forearm-l"].rotate).toBeCloseTo(-150);
  });

  it("omuz: tam boy kol gövdenin önünden 50° çaprazlar, kameraya uzanan kol daha çok; baş üstünden öbür yana 15°", () => {
    expect(anatomical({ "arm-r": at(80) }, false).pose["arm-r"].rotate).toBe(SHOULDER.inward);
    expect(anatomical({ "arm-r": at(80, 0.6) }, false).strains).toEqual([]);
    expect(anatomical({ "arm-l": at(-80) }, false).pose["arm-l"].rotate).toBe(-SHOULDER.inward);
    expect(anatomical({ "arm-l": at(190) }, false).strains).toEqual([]);
    expect(anatomical({ "arm-l": at(200) }, false).pose["arm-l"].rotate).toBe(SHOULDER.over);
    expect(ANATOMY_FRONT["arm-l"]).toEqual({ min: -SHOULDER.inward, max: SHOULDER.over });
  });

  it("profil: dirsek yalnız öne, diz yalnız geriye bükülür; kalça geriye 30°", () => {
    const { pose, strains } = anatomical({ "forearm-r": at(20), "shin-l": at(-20), "leg-r": at(50), "arm-l": at(-170) }, true);
    expect([pose["forearm-r"].rotate, pose["shin-l"].rotate, pose["leg-r"].rotate, pose["arm-l"].rotate]).toEqual([5, -5, 30, -170]);
    expect(strains).toHaveLength(3);
    // Önden 20° yana dönen dirsek profilde öne bükülmüş olabilir: önden sınır profilinkinden ayrı.
    expect(anatomical({ "forearm-r": at(-140) }, true).strains).toEqual([]);
  });

  it("parça gerçek boyundan uzun görünmez; baldır uyluğun ölçeğini taşır, ön kol taşımaz; yüz parçaları serbest", () => {
    const { pose, strains } = anatomical({ "forearm-r": at(0, 1.3), "leg-l": at(0, 0.35), "shin-l": at(0, 1 / 0.35), eyes: at(0, 0.1, 0.2) }, false);
    expect(pose["forearm-r"].sy).toBe(STRETCH.max);
    expect(pose["shin-l"].sy).toBeCloseTo(1 / 0.35);
    expect(pose.eyes).toEqual(at(0, 0.1, 0.2));
    expect(strains).toEqual([{ part: "forearm-r", what: "sy", value: 1.3, limit: STRETCH.max }]);
    // Kısa ön kolun içindeki el: görünen boy çarpımdır, alt sınıra kendi ölçeğiyle çekilir.
    const hand = anatomical({ "arm-r": at(0), "forearm-r": at(0, 0.5), "hand-r": at(0, 0.5) }, false);
    expect(hand.pose["hand-r"].sy).toBeCloseTo(STRETCH.min / 0.5);
    expect(hand.strains).toEqual([{ part: "hand-r", what: "sy", value: 0.25, limit: STRETCH.min }]);
    // Ters (içinden çevrilmiş) uzuv olmaz.
    expect(anatomical({ "arm-l": at(0, 1, -1) }, false).pose["arm-l"].sx).toBe(STRETCH.min);
  });
});
