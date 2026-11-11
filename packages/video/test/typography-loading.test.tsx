// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { fontFamily, Timeline, TYPOGRAPHY_PAIRS } from "@ys/core";
import { afterEach, describe, expect, it, vi } from "vitest";
const media = vi.hoisted(() => ({ delay: vi.fn(() => 42), resume: vi.fn(), cancel: vi.fn() }));
vi.mock("remotion", async (orig) => ({ ...(await orig<typeof import("remotion")>()), delayRender: media.delay, continueRender: media.resume, cancelRender: media.cancel, staticFile: (path: string) => `http://localhost/${path}`, useCurrentFrame: () => 10, useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 300 }) }));
import { loadTypography, TypographyFonts } from "../src/TypographyFonts.tsx";
import { Episode } from "../src/Episode.tsx";
import { Thumbnail } from "../src/Thumbnail.tsx";

const fonts = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks();
  if (fonts) Object.defineProperty(document, "fonts", fonts); else Reflect.deleteProperty(document, "fonts");
});

describe("font readiness", () => {
  it("uses the selected body face in captions and heading face in the thumbnail", async () => {
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } });
    vi.stubGlobal("FontFace", class { async load() { return this; } });
    const timeline = Timeline.parse({ episodeId: "e", lang: "tr", durationInFrames: 300, visuals: [], audio: [], typography: { pair: "poster" }, captions: [{ text: "Caption", startMs: 0, endMs: 1000 }] });
    render(<Episode timeline={timeline} />); await waitFor(() => expect(media.resume).toHaveBeenCalled());
    const caption = screen.getByText("Caption").parentElement!;
    expect(caption.style.fontFamily).toBe(fontFamily(TYPOGRAPHY_PAIRS.poster.body).replaceAll("'", "")); expect(caption.style.fontWeight).toBe("600");
    const view = render(<Thumbnail timeline={timeline} shotId="missing" side="left" title="Heading" />);
    const heading = view.container.querySelector<HTMLElement>("[data-title]")!;
    expect(heading.style.fontFamily).toBe(fontFamily(TYPOGRAPHY_PAIRS.poster.heading).replaceAll("'", "")); expect(heading.style.fontWeight).toBe("700");
  });
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
  it("releases the render handle without cancelling a component that already unmounted", async () => {
    let reject!: (e: Error) => void;
    const pending = new Promise<never>((_yes, no) => { reject = no; });
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } });
    vi.stubGlobal("FontFace", class { load() { return pending; } });
    const view = render(<TypographyFonts selection={{ pair: "clear" }} />); view.unmount();
    await act(async () => reject(new Error("Late font failure")));
    expect(media.resume).toHaveBeenCalledWith(42); expect(media.cancel).not.toHaveBeenCalled();
  });
});
