// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { SceneEffect, SceneThree, VectorShot } from "@ys/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compositeStyle } from "../src/effects.ts";

const rem = vi.hoisted(() => ({ continued: [] as number[], cancelled: [] as Error[] }));
vi.mock("remotion", async (orig) => ({
  ...(await orig<typeof import("remotion")>()),
  delayRender: () => 9,
  continueRender: (h: number) => rem.continued.push(h),
  cancelRender: (e: Error) => rem.cancelled.push(e),
}));

// WebGL yok: renderer sahte, kurulum/render/serbest bırakma kaydedilir.
const gl = vi.hoisted(() => ({ fail: false, sizes: [] as number[][], renders: 0, disposed: 0 }));
vi.mock("three", async (orig) => ({
  ...(await orig<typeof import("three")>()),
  WebGLRenderer: class {
    constructor() {
      if (gl.fail) throw new Error("WebGL yok");
    }
    setPixelRatio() {}
    setSize(w: number, h: number) {
      gl.sizes.push([w, h]);
    }
    setClearColor() {}
    render() {
      gl.renders++;
    }
    dispose() {
      gl.disposed++;
    }
  },
}));

// Sahne modeli sahte: örnekleme anları ve dispose sayılır.
const model = vi.hoisted(() => ({ samples: [] as number[][], disposed: 0 }));
vi.mock("../src/scene3d.ts", () => ({
  createScene3D: () => ({
    scene: {},
    camera: {},
    sample: (t: number, p: number) => model.samples.push([t, p]),
    dispose: () => model.disposed++,
  }),
}));

const pixi = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("../src/PixiParticles.tsx", () => ({
  PixiParticles: (props: Record<string, unknown>) => {
    pixi.props.push(props);
    return <div data-pixi={String(props.kind)} />;
  },
}));

const { Scene3D } = await import("../src/Scene3D.tsx");
const { SceneEffects, SceneIllustrations } = await import("../src/SceneEffects.tsx");

afterEach(() => {
  cleanup();
  rem.continued.length = rem.cancelled.length = 0;
  gl.fail = false;
  gl.sizes.length = gl.renders = gl.disposed = 0;
  model.samples.length = model.disposed = 0;
  pixi.props.length = 0;
});

describe("Scene3D", () => {
  const spec = SceneThree.parse({ preset: "atom", x: 400, y: 300, size: 200.4 });

  it("renders each frame from absolute time, releases the render hold and frees the GPU on unmount", () => {
    const view = render(<Scene3D spec={spec} time={1.5} progress={0.25} />);
    const canvas = view.container.querySelector("canvas")!;
    expect(canvas.dataset.three).toBe("atom");
    expect(canvas.style.left).toBe(`${400 - 200.4 / 2}px`);
    expect(gl.sizes).toEqual([[201, 201]]);
    expect(model.samples).toEqual([[1.5, 0.25]]);
    expect(gl.renders).toBe(1);
    expect(rem.continued).toEqual([9]);
    view.rerender(<Scene3D spec={spec} time={2} progress={0.5} />);
    expect(model.samples.at(-1)).toEqual([2, 0.5]);
    expect(gl.renders).toBe(2);
    view.unmount();
    expect(model.disposed).toBe(1);
    expect(gl.disposed).toBe(1);
  });

  it("stops the render with a named error when WebGL cannot start", () => {
    gl.fail = true;
    render(<Scene3D spec={spec} time={0} progress={0} />);
    expect(rem.cancelled[0]!.message).toContain("Cannot render 3D illustration atom");
    expect(model.samples).toEqual([]);
    expect(rem.continued).toEqual([]);
  });
});

describe("SceneIllustrations", () => {
  it("draws only the illustrations whose window is open", () => {
    const shot = VectorShot.parse({
      three: [
        { preset: "network", start: 0, end: 0.5 },
        { preset: "crystal", start: 0.5, end: 1 },
      ],
    });
    const view = render(<SceneIllustrations spec={shot} p={0.25} durationSec={8} />);
    const canvases = [...view.container.querySelectorAll("canvas")];
    expect(canvases.map((c) => c.dataset.three)).toEqual(["network"]);
    expect(render(<SceneIllustrations spec={VectorShot.parse({})} p={0.25} durationSec={8} />).container.innerHTML).toBe("");
  });
});

describe("SceneEffects", () => {
  it("routes particles to PixiJS with a per-effect seed and tint, compositing to CSS, and skips closed or silent ones", () => {
    const shot = VectorShot.parse({
      effects: [
        { kind: "sparks", color: "#ff8800", intensity: 0.5 },
        { kind: "vignette", start: 0, end: 1 },
        { kind: "starfield", intensity: 0 },
      ],
    });
    const view = render(<SceneEffects spec={shot} p={0.5} durationSec={10} seed="s1-sh2" />);
    const layers = [...view.container.querySelectorAll<HTMLElement>("[data-effect]")];
    expect(layers.map((l) => l.dataset.effect)).toEqual(["sparks", "vignette"]);
    expect(layers[0]!.style.opacity).toBe("0.5");
    expect(pixi.props).toHaveLength(1);
    expect(pixi.props[0]).toMatchObject({ kind: "sparks", seed: "s1-sh2-fx-0", tint: 0xff8800, size: [1920, 1080] });
    expect(layers[1]!.querySelector("[data-pixi]")).toBeNull();
    expect((layers[1]!.firstElementChild as HTMLElement).style.background).toContain("radial-gradient");

    const late = VectorShot.parse({ effects: [{ kind: "sparks", start: 0.6, end: 0.9 }] });
    expect(render(<SceneEffects spec={late} p={0.5} durationSec={10} seed="x" />).container.innerHTML).toBe("");
    expect(render(<SceneEffects spec={VectorShot.parse({})} p={0.5} durationSec={10} seed="x" />).container.innerHTML).toBe("");
  });

  it("gives a particle kind no compositing style", () => {
    expect(compositeStyle(SceneEffect.parse({ kind: "sparks" }), 0.5, 1)).toEqual({});
  });
});
