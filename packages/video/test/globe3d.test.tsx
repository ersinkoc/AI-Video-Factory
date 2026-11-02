// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { globeRotation, globeView } from "../src/globe.ts";

const rem = vi.hoisted(() => ({ continued: [] as number[] }));
vi.mock("remotion", async (orig) => ({
  ...(await orig<typeof import("remotion")>()),
  delayRender: () => 7,
  continueRender: (h: number) => rem.continued.push(h),
}));

// three sahte: WebGL yok; sahneye eklenenler, render, dönüş ve serbest bırakılanlar kaydedilir.
const three = vi.hoisted(() => ({
  fail: false,
  renders: 0,
  disposed: 0,
  rotations: [] as number[][],
  added: [] as unknown[],
  load: undefined as undefined | { url: string; onLoad: (t: object) => void; onError: () => void },
  texture: {} as Record<string, unknown>,
  material: undefined as undefined | Record<string, unknown>,
}));
vi.mock("three", () => {
  class Base {
    args: unknown[];
    position = { z: 0, set: (...v: number[]) => v };
    rotation = { set: (...v: number[]) => three.rotations.push(v) };
    constructor(...args: unknown[]) {
      this.args = args;
    }
    dispose() {
      three.disposed++;
    }
  }
  class WebGLRenderer extends Base {
    capabilities = { getMaxAnisotropy: () => 16 };
    constructor(...args: unknown[]) {
      super(...args);
      if (three.fail) throw new Error("WebGL yok");
    }
    setPixelRatio() {}
    setSize() {}
    render() {
      three.renders++;
    }
  }
  class Scene extends Base {
    background: unknown;
    add(...c: unknown[]) {
      three.added.push(...c);
    }
  }
  class MeshStandardMaterial extends Base {
    constructor(...args: unknown[]) {
      super(...args);
      three.material = this as unknown as Record<string, unknown>;
    }
  }
  class BufferGeometry extends Base {
    setAttribute() {}
  }
  class TextureLoader {
    load(url: string, onLoad: (t: object) => void, _progress: unknown, onError: () => void) {
      three.load = { url, onLoad, onError };
      three.texture = { dispose: () => three.disposed++ };
      return three.texture;
    }
  }
  return {
    AdditiveBlending: 2,
    AmbientLight: Base,
    BackSide: 1,
    BufferGeometry,
    Color: Base,
    DirectionalLight: Base,
    Float32BufferAttribute: Base,
    Mesh: Base,
    MeshStandardMaterial,
    OrthographicCamera: Base,
    Points: Base,
    PointsMaterial: Base,
    Scene,
    ShaderMaterial: Base,
    SphereGeometry: Base,
    SRGBColorSpace: "srgb",
    TextureLoader,
    WebGLRenderer,
  };
});

const { Globe3D } = await import("../src/Globe3D.tsx");
const GLOBE = { lon: 35, lat: 39, cx: 960, cy: 480, r: 370, texture: '<svg width="4096" height="2048"><rect fill="#c8553d"/></svg>' };

afterEach(() => {
  cleanup();
  Object.assign(three, { fail: false, renders: 0, disposed: 0, rotations: [], added: [], load: undefined, material: undefined });
  rem.continued.length = 0;
});

describe("3D küre (three.js)", () => {
  it("doku yüklenince her karede elle render eder; küre bakış noktasına döner, render bekletmesi kalkar", () => {
    const { container, rerender } = render(<Globe3D globe={GLOBE} p={0} seed="s1" />);
    const canvas = container.querySelector("canvas")!;
    expect(canvas.width).toBe(1920);
    expect(canvas.style.objectFit).toBe("cover");
    // Yıldızlar, iki ışık, atmosfer ve Dünya sahnede; doku SVG'den.
    expect(three.added).toHaveLength(5);
    expect(decodeURIComponent(three.load!.url)).toBe(`data:image/svg+xml;charset=utf-8,${GLOBE.texture}`);
    expect(three.renders).toBe(0);
    expect(rem.continued).toEqual([]);

    act(() => three.load!.onLoad(three.texture));
    expect(three.material!.map).toBe(three.texture);
    expect(three.texture).toMatchObject({ colorSpace: "srgb", anisotropy: 16 });
    expect(three.renders).toBe(1);
    expect(rem.continued).toEqual([7]);
    const start = globeRotation(globeView(35, 39, 0).lon, globeView(35, 39, 0).lat);
    expect(three.rotations.at(-1)).toEqual([start.x, start.y, 0]);

    rerender(<Globe3D globe={GLOBE} p={0.6} seed="s1" />);
    const end = globeRotation(35, 39);
    expect(three.rotations.at(-1)).toEqual([end.x, end.y, 0]);
    expect(three.renders).toBe(2);

    // Sökülünce geometri, malzeme, doku ve renderer bırakılır.
    cleanup();
    expect(three.disposed).toBe(8);
  });

  it("WebGL açılamazsa ya da doku yüklenemezse katman boş kalır, render beklemez", () => {
    three.fail = true;
    const { container } = render(<Globe3D globe={GLOBE} p={0.5} seed="s1" />);
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(rem.continued).toEqual([7]);
    expect(three.renders).toBe(0);
    cleanup();
    expect(three.disposed).toBe(0);

    three.fail = false;
    rem.continued.length = 0;
    render(<Globe3D globe={GLOBE} p={0.5} seed="s1" />);
    three.load!.onError();
    expect(rem.continued).toEqual([7]);
    expect(three.renders).toBe(0);
  });

  it("doku, bileşen söküldükten sonra gelirse sahne kurulmaz", () => {
    render(<Globe3D globe={GLOBE} p={0.5} seed="s1" />);
    const late = three.load!;
    cleanup();
    late.onLoad(three.texture);
    expect(three.material!.map).toBeUndefined();
    expect(three.renders).toBe(0);
  });
});
