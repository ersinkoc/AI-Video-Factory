import { describe, expect, it } from "vitest";
import { COMPOSITE_EFFECTS, PARTICLE_EFFECTS, SceneEffect, SceneThree, THREE_PRESETS, VectorShot } from "@ys/core";
import { InstancedMesh, Mesh } from "three";
import { compositeStyle, effectAt } from "../src/effects.ts";
import { particleFrame } from "../src/particles.ts";
import { createScene3D } from "../src/scene3d.ts";

describe("scene motion contract", () => {
  it("keeps legacy shots valid and preserves new plans", () => {
    expect(VectorShot.parse({}).three).toBeUndefined();
    const shot = VectorShot.parse({ three: [{ preset: "atom" }], effects: [{ kind: "sparks" }] });
    expect(shot.three![0]!.camera).toBe("orbit");
    expect(shot.effects![0]!.intensity).toBe(0.5);
  });
  it("rejects unsupported engines, invalid windows, unbounded cost and invalid colours", () => {
    expect(SceneThree.safeParse({ preset: "unknown" }).success).toBe(false);
    expect(SceneEffect.safeParse({ kind: "sparks", start: 0.8, end: 0.3 }).success).toBe(false);
    expect(SceneThree.safeParse({ preset: "atom", start: 0.5, end: 0.5 }).success).toBe(false);
    expect(SceneThree.safeParse({ preset: "atom", size: 5000 }).success).toBe(false);
    expect(SceneEffect.safeParse({ kind: "sparks", intensity: 2 }).success).toBe(false);
    expect(SceneEffect.safeParse({ kind: "sparks", color: "url(external)" }).success).toBe(false);
    expect(VectorShot.safeParse({ three: Array(3).fill({ preset: "atom" }) }).success).toBe(false);
    expect(VectorShot.safeParse({ effects: Array(4).fill({ kind: "sparks" }) }).success).toBe(false);
  });
  it("samples local seconds with speed, exact boundaries and fades", () => {
    const window = { start: 0.2, end: 0.8, speed: 2 };
    expect(effectAt(window, 0.1, 10)).toMatchObject({ active: false, opacity: 0, time: 0 });
    expect(effectAt(window, 0.2, 10)).toMatchObject({ active: true, opacity: 0, time: 0 });
    expect(effectAt(window, 0.5, 10)).toMatchObject({ active: true, opacity: 1 });
    expect(effectAt(window, 0.5, 10).time).toBeCloseTo(6);
    expect(effectAt(window, 0.8, 10)).toMatchObject({ active: false, opacity: 0, progress: 1 });
    expect(effectAt(window, 1.2, 10)).toMatchObject({ active: false, opacity: 0, progress: 1 });
  });
});

describe("seekable PixiJS effects", () => {
  it.each(PARTICLE_EFFECTS)("%s is deterministic, tinted, animated and bounded", (kind) => {
    const first = particleFrame(kind, "demo", 1.2, 1920, 1080, 0xff4455);
    particleFrame(kind, "demo", 4.8, 1920, 1080);
    expect(particleFrame(kind, "demo", 1.2, 1920, 1080, 0xff4455)).toEqual(first);
    expect(particleFrame(kind, "demo", 1.8, 1920, 1080, 0xff4455)).not.toEqual(first);
    expect(particleFrame(kind, "other", 1.2, 1920, 1080, 0xff4455)).not.toEqual(first);
    expect(first.shapes.length).toBeGreaterThan(0);
    expect(first.shapes.length).toBeLessThanOrEqual(120);
    for (const shape of first.shapes) {
      expect(shape.color).toBe(0xff4455);
      expect(shape.alpha).toBeGreaterThanOrEqual(0);
      expect(shape.alpha).toBeLessThanOrEqual(1);
      for (const value of Object.values(shape)) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
    }
  });
  it.each(COMPOSITE_EFFECTS)("%s produces a visible compositing treatment", (kind) => {
    const style = compositeStyle(SceneEffect.parse({ kind }), 0.5, 1);
    expect(style.background).toBeTruthy();
  });
});

describe("procedural Three.js illustrations", () => {
  it.each(THREE_PRESETS)("%s has lit geometry and identical frames after seeking backwards", (preset) => {
    const world = createScene3D(SceneThree.parse({ preset }));
    const matrices = () => {
      const values: number[] = [];
      world.scene.traverse((object) => {
        values.push(...object.matrixWorld.elements);
        if (object instanceof InstancedMesh) values.push(...object.instanceMatrix.array);
      });
      return values;
    };
    try {
      world.sample(1.2, 0.3);
      const first = matrices();
      expect(first.every(Number.isFinite)).toBe(true);
      expect(world.scene.getObjectsByProperty("isMesh", true).length).toBeGreaterThan(0);
      world.sample(4, 0.8);
      expect(matrices()).not.toEqual(first);
      world.sample(1.2, 0.3);
      expect(matrices()).toEqual(first);
      if (preset === "wave_grid") {
        const meshes: Mesh[] = [];
        world.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
        expect(meshes).toHaveLength(1);
        expect((meshes[0] as InstancedMesh).count).toBe(225);
      }
    } finally {
      world.dispose();
    }
    expect(world.scene.children).toHaveLength(0);
  });
  it("static and push-in camera modes keep the intended path", () => {
    for (const mode of ["static", "push_in"] as const) {
      const world = createScene3D(SceneThree.parse({ preset: "crystal", camera: mode }));
      world.sample(0, 0);
      const start = world.camera.position.clone();
      world.sample(5, 1);
      expect(world.camera.position.x).toBe(0);
      if (mode === "static") expect(world.camera.position.equals(start)).toBe(true);
      else expect(world.camera.position.length()).toBeLessThan(start.length());
      world.dispose();
    }
  });
});
