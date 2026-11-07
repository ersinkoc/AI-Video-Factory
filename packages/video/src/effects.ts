import type { SceneEffect } from "@ys/core";
import type { CSSProperties } from "react";

/** Stateless local time and soft edges; seeking never needs simulation warm-up. */
export function effectAt(window: { start: number; end: number; speed: number }, p: number, durationSec: number) {
  const span = window.end - window.start;
  const progress = Math.max(0, Math.min(1, (p - window.start) / span));
  const active = p >= window.start && p < window.end;
  return {
    active,
    progress,
    time: progress * span * durationSec * window.speed,
    opacity: active ? Math.min(1, progress / 0.08, (1 - progress) / 0.08) : 0,
  };
}

export function compositeStyle(effect: SceneEffect, progress: number, time: number): CSSProperties {
  switch (effect.kind) {
    case "light_sweep":
      return { background: `linear-gradient(110deg, transparent 35%, ${effect.color} 50%, transparent 65%)`, transform: `translateX(${-150 + progress * 300}%)`, mixBlendMode: "screen" };
    case "scanlines":
      return { background: `repeating-linear-gradient(0deg, transparent 0px, transparent 5px, ${effect.color} 6px, transparent 7px)`, transform: `translateY(${(time * 18) % 7}px)`, mixBlendMode: "screen" };
    case "letterbox":
      return { background: "linear-gradient(to bottom, black 0%, black 6%, transparent 6%, transparent 94%, black 94%)" };
    case "vignette":
      return { background: `radial-gradient(ellipse at center, transparent 35%, ${effect.color} 100%)`, mixBlendMode: "multiply" };
    default:
      return {};
  }
}
