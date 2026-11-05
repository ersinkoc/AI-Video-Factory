import type { VectorAsset } from "@ys/core";
import type { CSSProperties } from "react";
import { seedOf } from "./lens.ts";
import { luminance, plainFill, shapesOf } from "./screen.ts";

/*
 * Sahneye düşen ışık (5 Kas; kullanıcı: "sıfır hata, videoya çok yakın görüntü"). Oda düz boyanmış gibi değil, bir yandan
 * ışık alıyormuş gibi görünsün: ışık yanı hafifçe aydınlık, öbür yan hafifçe gölgede (normal alfa; karışım kipi render'ı
 * yavaşlatır). Yönetmen kararı istemez.
 *
 * Işığın yönü odanın kendi çiziminden: pencere, gökyüzü, lamba genelde duvardan belirgin parlak, orta boy şekillerdir
 * (225 arka planın yalnız 2'sinde "window" adlı öğe vardı). Parlak şekillerin alan ağırlıklı ortası çizimin ortasından
 * LIGHT.lean kadar bir yana yaslanmışsa ışık oradan gelir; değilse oda kimliğinden tohumla (aynı odanın her çekiminde aynı
 * yan; ters açısı, ~rev, öbür yan).
 *
 * Zemin gölgesi eklenmez: tasarımcı neredeyse her kişi ve nesne çiziminin altına açık bir gölge koyuyor (ölçüldü: gölgesi
 * yok sanılan karakterlerin ayaklarında da vardı), ikinci gölge koyulaştırırdı.
 */
export const LIGHT = {
  /** Işık kaynağı sayılan şekil: düz dolgulu, en az bright parlaklıkta, duvardan (en büyük şekil) above kadar parlak. */
  bright: 0.72,
  above: 0.12,
  /** Alanı çizimin bu aralığında (bütün duvar ya da bir nokta değil). */
  area: [0.004, 0.25] as const,
  /** Parlak alanın ortası çizimin ortasından en az bu kadar (genişliğin kesri) yana yaslanmalı. */
  lean: 0.08,
  /** Işık yanının aydınlığı ve öbür yanın gölgesi (alfa). */
  key: 0.07,
  fall: 0.09,
} as const;

/** Işığın geldiği yan: −1 soldan, 1 sağdan. */
export type LightSide = -1 | 1;

/** Çizimdeki ışık kaynaklarının yanı (pencere, lamba); belirgin değilse undefined. */
export function measuredSide(svg: string): LightSide | undefined {
  const found = shapesOf(svg);
  if (!found) return undefined;
  const { vb, shapes } = found;
  const total = vb[2] * vb[3];
  const plain = shapes.filter((s) => plainFill(s.fill));
  if (!plain.length) return undefined;
  const wall = plain.reduce((a, s) => (s.area > a.area ? s : a));
  const floor = luminance(wall.fill!) + LIGHT.above;
  let sum = 0;
  let mass = 0;
  for (const s of plain) {
    const lum = luminance(s.fill!);
    if (s === wall || lum < LIGHT.bright || lum < floor || s.area < total * LIGHT.area[0] || s.area > total * LIGHT.area[1]) continue;
    sum += (s.x + s.w / 2) * s.area;
    mass += s.area;
  }
  if (!mass) return undefined;
  const lean = (sum / mass - (vb[0] + vb[2] / 2)) / vb[2];
  return Math.abs(lean) < LIGHT.lean ? undefined : lean < 0 ? -1 : 1;
}

const sides = new WeakMap<VectorAsset, LightSide>();

/** Sahnenin ışık yanı: arka planın çiziminden, yoksa odanın kimliğinden tohumla (ters açı öbür yan); arka plan yoksa sol. */
export function lightOf(bg: VectorAsset | undefined): LightSide {
  if (!bg) return -1;
  const hit = sides.get(bg);
  if (hit) return hit;
  const reverse = bg.id.endsWith("~rev");
  const seeded: LightSide = seedOf(reverse ? bg.id.slice(0, -4) : bg.id) < 0.5 ? -1 : 1;
  const side = measuredSide(bg.svg) ?? (reverse ? (-seeded as LightSide) : seeded);
  sides.set(bg, side);
  return side;
}

/** Sahneye düşen ışık (kameranın içinde, katmanların üstünde: kamerayla birlikte yaklaşır). */
export function keyLight(side: LightSide): CSSProperties {
  return {
    background: `linear-gradient(${side < 0 ? 90 : 270}deg, rgba(255,246,228,${LIGHT.key}) 0%, rgba(255,246,228,0) 42%, rgba(12,14,30,0) 58%, rgba(12,14,30,${LIGHT.fall}) 100%)`,
  };
}
