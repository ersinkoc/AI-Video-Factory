// @vitest-environment happy-dom
import { FigureSpec } from "@ys/core";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rem = vi.hoisted(() => ({ continued: [] as number[] }));
vi.mock("remotion", async (orig) => ({
  ...(await orig<typeof import("remotion")>()),
  delayRender: () => 9,
  continueRender: (h: number) => rem.continued.push(h),
}));

// Yalnız WebGL sahte: figür, ışıklar ve sahne gerçek three ile kurulur; render çağrıları ve serbest bırakma kaydedilir.
const gl = vi.hoisted(() => ({ fail: false, renders: [] as { scene: { children: unknown[] }; camera: Record<string, number> }[], size: [] as number[], disposed: 0, renderer: undefined as undefined | Record<string, unknown> }));
vi.mock("three", async (orig) => {
  const real = await orig<typeof import("three")>();
  class WebGLRenderer {
    shadowMap = { enabled: false, type: 0 };
    outputColorSpace = "";
    toneMapping = 0;
    constructor(public options: Record<string, unknown>) {
      if (gl.fail) throw new Error("WebGL yok");
      gl.renderer = this as unknown as Record<string, unknown>;
    }
    setPixelRatio() {}
    setSize(w: number, h: number) {
      gl.size = [w, h];
    }
    setClearColor() {}
    render(scene: { children: unknown[] }, camera: Record<string, number>) {
      gl.renders.push({ scene, camera });
    }
    dispose() {
      gl.disposed++;
    }
  }
  return { ...real, WebGLRenderer };
});

const { Figure3D, FIGURE_VIEW } = await import("../src/Figure3D.tsx");
const SPEC = FigureSpec.parse({ skin: "#f1c7a5", hair: { style: "short", color: "#3a2a20" }, top: { style: "sweater", color: "#5b7fbf" }, bottom: { style: "trousers", color: "#3b3f4a" }, shoes: "#2b2622" });

afterEach(() => {
  cleanup();
  Object.assign(gl, { fail: false, renders: [], size: [], disposed: 0, renderer: undefined });
  rem.continued.length = 0;
});

describe("3D figür (three.js)", () => {
  it("şeffaf, gölgeli tuvalde kukla tuvaline hizalı ortografik kamerayla her karede çizer; poz değişince yeniden çizer", () => {
    const pose = { "arm-r": { rotate: 30, sx: 1, sy: 1, tx: 0, ty: 0 } };
    const { container, rerender } = render(<Figure3D spec={SPEC} pose={pose} />);
    const canvas = container.querySelector("canvas")!;
    // Kenar payı: kol kaldırınca ve eğilince taşan kısım kesilmesin.
    expect(canvas.style.left).toBe(`${-FIGURE_VIEW.padX * 100}%`);
    expect(canvas.style.width).toBe(`${(1 + 2 * FIGURE_VIEW.padX) * 100}%`);
    expect(gl.renderer!.options).toMatchObject({ alpha: true, preserveDrawingBuffer: true, antialias: true });
    expect(gl.renderer!.shadowMap).toMatchObject({ enabled: true });
    expect(gl.size).toEqual([Math.round(400 * 1.3 * FIGURE_VIEW.px), Math.round(800 * 1.08 * FIGURE_VIEW.px)]);
    expect(gl.renders).toHaveLength(1);
    const { scene, camera } = gl.renders[0]!;
    // Gökyüzü ışığı, ana ışık + hedefi, kenar ve dolgu ışığı, figür.
    expect(scene.children).toHaveLength(6);
    expect([camera.left, camera.right, camera.bottom, camera.top]).toEqual([-260, 260, -16, 848]);
    expect(rem.continued).toEqual([9]);

    rerender(<Figure3D spec={SPEC} pose={{ "arm-r": { rotate: 60, sx: 1, sy: 1, tx: 0, ty: 0 } }} />);
    expect(gl.renders).toHaveLength(2);
    // Pozsuz figür dinlenme duruşunda çizilir.
    rerender(<Figure3D spec={SPEC} />);
    expect(gl.renders).toHaveLength(3);
  });

  it("WebGL açılamazsa SVG yedeği gösterilir ve render beklemez", () => {
    gl.fail = true;
    const { container } = render(<Figure3D spec={SPEC} fallback={<div data-svg="yedek" />} />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-svg]")).not.toBeNull();
    expect(rem.continued).toEqual([9]);
    expect(gl.renders).toHaveLength(0);
  });

  it("kaldırılınca figür ve renderer serbest bırakılır", () => {
    const { unmount } = render(<Figure3D spec={SPEC} />);
    act(() => unmount());
    expect(gl.disposed).toBe(1);
  });
});
