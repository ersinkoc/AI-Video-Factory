import type { Ambience as AmbienceKind } from "@ys/core";
import { useMemo } from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { PixiParticles } from "./PixiParticles.tsx";

/**
 * Durağan karelere canlılık veren prosedürel atmosfer katmanları. API maliyeti yok; her kare
 * `random(seed)` ile deterministik çizilir, böylece paralel render sekmeleri aynı sonucu verir. Parçacıklılar
 * (yağmur, kar, toz, kıvılcım, konfeti) PixiJS/WebGL'de (`PixiParticles`), ışık ve sis CSS gradyanıyla.
 */
export function Ambience({ kind, seed, size, part }: { kind: AmbienceKind; seed: string; size?: readonly [number, number]; part?: FogPart }) {
  switch (kind) {
    case "rain":
      // Yağmurda sahne hafifçe kararır; damlalar ve sıçramalar Pixi'de.
      return (
        <AbsoluteFill style={{ background: "rgba(20,30,45,0.18)" }}>
          <PixiParticles kind="rain" seed={seed} size={size} />
        </AbsoluteFill>
      );
    case "snow":
    case "confetti":
      return <PixiParticles kind={kind} seed={seed} size={size} />;
    case "fog":
      return <Fog seed={seed} part={part} />;
    case "dust":
    case "embers":
      // Işık saçan zerreler ekranın üstüne eklenerek karışır.
      return (
        <AbsoluteFill style={{ mixBlendMode: "screen" }}>
          <PixiParticles kind={kind} seed={seed} size={size} />
        </AbsoluteFill>
      );
    case "flicker":
      return <Flicker seed={seed} />;
    case "rays":
      return <Rays seed={seed} />;
    default:
      return null;
  }
}

/**
 * Sisin derinliği (5 Kas: sisli çekimlerin %52'si incelemede "sisli, soluk, kişi neredeyse görünmüyor" notu aldı;
 * atmosfersizlerde %6). Sis bütün sahnenin önündeydi, yüzleri de beyazlatıyordu. Gerçek siste uzaktaki daha çok
 * kaybolur: vektör sahnede "far" (bankalar ve yükselen pus) oda ile kişilerin arasında, "near" yalnız ayak hizasında
 * ince yer sisi (FOG.near: karenin alt payı ve opaklığı). part verilmezse ikisi birlikte (durağan kare).
 */
export type FogPart = "far" | "near";
export const FOG = { near: { band: 0.24, alpha: 0.3 } } as const;

function Fog({ seed, part }: { seed: string; part?: FogPart | undefined }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const offset = random(`${seed}-fog`) * 100;
  const layer = (speed: number, top: string, opacity: number) => ({
    position: "absolute" as const,
    left: "-50%",
    top,
    width: "200%",
    height: "70%",
    opacity,
    // Blur filtresi yok: render'ı 4–5 kat yavaşlatıyordu (30 Eki ölçümü). Yumuşaklık çok duraklı gradyandan geliyor.
    background:
      "radial-gradient(ellipse 30% 45% at 20% 50%, rgba(235,240,245,0.75), rgba(235,240,245,0.35) 40%, transparent 72%), radial-gradient(ellipse 25% 40% at 55% 45%, rgba(235,240,245,0.65), rgba(235,240,245,0.3) 40%, transparent 72%), radial-gradient(ellipse 30% 50% at 85% 55%, rgba(235,240,245,0.7), rgba(235,240,245,0.32) 40%, transparent 72%)",
    transform: `translateX(${Math.sin((t + offset) * speed) * 12}%)`,
  });
  const near = (
    <AbsoluteFill
      data-fog="near"
      style={{ background: `linear-gradient(to top, rgba(220,226,235,${FOG.near.alpha}), rgba(220,226,235,0) ${(FOG.near.band * 100).toFixed(0)}%)` }}
    />
  );
  if (part === "near") return <AbsoluteFill style={{ overflow: "hidden" }}>{near}</AbsoluteFill>;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill data-fog="far" style={{ background: "linear-gradient(to top, rgba(220,226,235,0.35), rgba(220,226,235,0.08) 70%)" }} />
      <div style={layer(0.07, "30%", 0.55)} />
      <div style={layer(-0.05, "50%", 0.45)} />
      {part === undefined && near}
    </AbsoluteFill>
  );
}

/** Mum/lamba ışığı: sıcak tonda düzensiz parlaklık oynaması ve kenarlarda nefes alan gölge. */
function Flicker({ seed }: { seed: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const p = random(`${seed}-flicker`) * 10;
  // Farklı frekanslı sinüslerin toplamı: periyodik görünmeyen titreme (-1..1).
  const n = Math.sin((t + p) * 7.3) * 0.5 + Math.sin((t + p) * 13.1) * 0.3 + Math.sin((t + p) * 2.1) * 0.2;
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 60% 55% at 50% 40%, rgba(255,175,90,0.55), rgba(255,175,90,0) 70%)",
          mixBlendMode: "overlay",
          opacity: 0.6 + n * 0.4,
        }}
      />
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 75% 70% at 50% 45%, rgba(0,0,0,0) 45%, rgba(15,5,0,0.6) 100%)",
          opacity: 0.55 - n * 0.3,
        }}
      />
    </AbsoluteFill>
  );
}

/**
 * Pencereden ya da ağaçlardan süzülen ışık huzmeleri. Konik gradyanla çizilir: huzme kenarları gradyan
 * duraklarından yumuşar, blur filtresi gerekmez (filtreli sürüm kare başına ~280 ms'ydi).
 */
function Rays({ seed }: { seed: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const fromLeft = random(`${seed}-rays`) < 0.5;
  const beams = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        x: random(`${seed}-beams-x-${i}`),
        speed: random(`${seed}-beams-s-${i}`),
        size: random(`${seed}-beams-z-${i}`),
        phase: random(`${seed}-beams-p-${i}`) * Math.PI * 2,
      })),
    [seed],
  );
  // Işık kaynağı kadrajın üst köşesinin dışında; huzmeler aşağı doğru yelpaze gibi açılır.
  const origin = fromLeft ? "-10% -15%" : "110% -15%";
  const start = fromLeft ? 100 : 170; // derece; konik gradyan tepeden saat yönünde
  const stops = beams
    .map((b, i) => {
      const center = start + 6 + i * 14 + b.x * 6;
      const half = 1.5 + b.size * 3;
      const a = 0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t * (0.4 + b.speed * 0.6) + b.phase));
      const color = `rgba(255,238,195,${a.toFixed(3)})`;
      return `transparent ${(center - half * 2).toFixed(1)}deg, ${color} ${center.toFixed(1)}deg, transparent ${(center + half * 2).toFixed(1)}deg`;
    })
    .join(", ");
  return (
    <AbsoluteFill
      style={{
        mixBlendMode: "screen",
        background: `conic-gradient(at ${origin}, transparent 0deg, ${stops}, transparent 360deg)`,
        maskImage: `radial-gradient(circle at ${fromLeft ? "0% 0%" : "100% 0%"}, black 10%, transparent 95%)`,
      }}
    />
  );
}