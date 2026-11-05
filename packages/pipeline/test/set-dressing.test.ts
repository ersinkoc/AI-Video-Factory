import { Timeline } from "@ys/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EpisodeState } from "../src/index.ts";

const dress = vi.fn();
vi.mock("@ys/video/sets", () => ({ dressVisuals: (...a: unknown[]) => dress(...a) }));
const { setsOf, withSets } = await import("../src/set-dressing.ts");

/** Zaman çizelgesine set eşyaları: yalnız çizilmiş ve reddedilmemiş eşyalar, kapalıysa ya da kayıt yoksa dokunulmaz. */

const state = (input: object, extra: Partial<EpisodeState> = {}) => ({ input: { topic: "x", ...input }, ...extra }) as unknown as EpisodeState;
const TIMELINE = Timeline.parse({
  episodeId: "e",
  lang: "tr",
  fps: 25,
  durationInFrames: 10,
  visuals: [{ shotId: "s1-sh1", assetUrl: "", kind: "motion_graphic", fromFrame: 0, durationInFrames: 10 }],
  audio: [],
  vectorAssets: {},
});

beforeEach(() => dress.mockReset());

describe("set eşyası zaman çizelgesinde", () => {
  it("mekânın eşyalarından çizilmiş ve reddedilmemiş olanlar, sırasıyla", () => {
    const s = state(
      {},
      {
        sets: { l1: ["a", "b", "c", "d"], l2: [] },
        vectorProps: { a: { description: "", key: "k/a.svg" }, b: { description: "" }, c: { description: "", key: "k/c.svg", rejected: true }, d: { description: "", key: "k/d.svg" } },
      },
    );
    expect(setsOf(s)).toEqual({ l1: ["a", "d"], l2: [] });
    expect(setsOf(state({}))).toEqual({});
  });

  it("yerleşimi video paketi yapar; kapalıysa ya da set kaydı yoksa zaman çizelgesi olduğu gibi", () => {
    const visuals = [{ ...TIMELINE.visuals[0]!, dressing: ["a"] }];
    dress.mockReturnValue(visuals);
    const s = state({}, { sets: { l1: ["a"] }, vectorProps: { a: { description: "", key: "k/a.svg" } } });
    expect(withSets(TIMELINE, s)).toEqual({ ...TIMELINE, visuals });
    expect(dress).toHaveBeenCalledWith(TIMELINE.visuals, TIMELINE.vectorAssets, { l1: ["a"] }, 25);
    dress.mockClear();
    expect(withSets(TIMELINE, state({ setDressing: false }, { sets: { l1: ["a"] } }))).toBe(TIMELINE);
    expect(withSets(TIMELINE, state({}))).toBe(TIMELINE);
    expect(dress).not.toHaveBeenCalled();
  });
});
