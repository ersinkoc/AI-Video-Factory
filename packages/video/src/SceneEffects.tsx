import { PARTICLE_EFFECTS, type VectorShot } from "@ys/core";
import { AbsoluteFill } from "remotion";
import { compositeStyle, effectAt } from "./effects.ts";
import { PixiParticles } from "./PixiParticles.tsx";
import type { ParticleKind } from "./particles.ts";
import { Scene3D } from "./Scene3D.tsx";

export function SceneIllustrations({ spec, p, durationSec }: { spec: VectorShot; p: number; durationSec: number }) {
  return <>{spec.three?.map((item, i) => {
    const at = effectAt(item, p, durationSec);
    if (!at.active) return null;
    return <AbsoluteFill key={i} style={{ opacity: at.opacity, pointerEvents: "none" }}><Scene3D spec={item} time={at.time} progress={at.progress} /></AbsoluteFill>;
  })}</>;
}

/** Above the scene, below callouts, titles and captions. */
export function SceneEffects({ spec, p, durationSec, seed }: { spec: VectorShot; p: number; durationSec: number; seed: string }) {
  return <>{spec.effects?.map((item, i) => {
    const at = effectAt(item, p, durationSec);
    if (!at.active || item.intensity === 0) return null;
    const particle = (PARTICLE_EFFECTS as readonly string[]).includes(item.kind);
    return <AbsoluteFill data-effect={item.kind} key={i} style={{ opacity: at.opacity * item.intensity, pointerEvents: "none", overflow: "hidden" }}>
      {particle
        ? <PixiParticles kind={item.kind as ParticleKind} seed={`${seed}-fx-${i}`} size={[1920, 1080]} time={at.time} tint={parseInt(item.color.slice(1), 16)} />
        : <AbsoluteFill style={compositeStyle(item, at.progress, at.time)} />}
    </AbsoluteFill>;
  })}</>;
}
