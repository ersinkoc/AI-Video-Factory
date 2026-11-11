// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const media = vi.hoisted(() => ({ delay: vi.fn(() => 42), resume: vi.fn(), cancel: vi.fn() }));
vi.mock("remotion", () => ({ delayRender: media.delay, continueRender: media.resume, cancelRender: media.cancel, staticFile: (path: string) => `http://localhost/${path}` }));
import { loadTypography, TypographyFonts } from "../src/TypographyFonts.tsx";

const fonts = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks();
  if (fonts) Object.defineProperty(document, "fonts", fonts); else Reflect.deleteProperty(document, "fonts");
});

describe("font readiness", () => {
  it("loads local extended/ordinary Latin faces and resumes only when all are ready", async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const added = vi.fn();
    const faces: string[] = [];
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: added } });
    vi.stubGlobal("FontFace", class {
      constructor(family: string, source: string) { faces.push(family); expect(source).toContain("http://localhost/typography/"); }
      async load() { await ready; return this; }
    });
    render(<TypographyFonts selection={{ pair: "editorial" }} />);
    expect(media.delay).toHaveBeenCalledOnce();
    expect(media.resume).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(media.resume).toHaveBeenCalledWith(42));
    expect(added).toHaveBeenCalledTimes(4);
    expect(faces.some((f) => f.includes("latin-ext"))).toBe(true);
    const first = loadTypography({ pair: "editorial" });
    expect(loadTypography({ pair: "editorial" })).toBe(first);
    await first;
    expect(added).toHaveBeenCalledTimes(4);
  });
  it("cancels a selected-font failure rather than capturing a fallback", async () => {
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } });
    vi.stubGlobal("FontFace", class { async load() { throw new Error("font failed"); } });
    render(<TypographyFonts selection={{ pair: "warm" }} />);
    await waitFor(() => expect(media.cancel).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("font failed") })));
  });
  it("leaves a legacy timeline untouched", () => {
    render(<TypographyFonts />);
    expect(media.delay).not.toHaveBeenCalled();
    expect(media.cancel).not.toHaveBeenCalled();
  });
});
