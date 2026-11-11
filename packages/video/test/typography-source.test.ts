import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), mkdir: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: io.read, writeFile: io.write, mkdir: io.mkdir }));
import { stageTypography } from "../src/typography-assets.ts";
describe("staged typography source validation", () => {
  it("refuses a Latin-only replacement for the extended Turkish asset before writing fonts", async () => {
    const real = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const require = createRequire(import.meta.url);
    const latin = await real.readFile(require.resolve("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff"));
    io.read.mockResolvedValue(latin);
    await expect(stageTypography({ pair: "clear" }, "unused-font-output")).rejects.toThrow("lacks required glyphs");
    expect(io.write).not.toHaveBeenCalled(); expect(io.mkdir).not.toHaveBeenCalled();
  });
});
