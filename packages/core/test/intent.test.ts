import { describe, expect, it } from "vitest";
import { ShotIntent, Timeline, shotIntentText } from "../src/index.ts";

const intent = { subject: "student-2", action: "typing", target: "keyboard", payoff: "The program appears on the screen", narration: { startWord: 1, endWord: 4 }, reveal: .6, holdSec: 1.2 };
describe("structured shot intent", () => {
  it("accepts supported direction and retains it in a saved timeline without requiring legacy migration", () => {
    const value = ShotIntent.parse(intent);
    const old = { episodeId: "e", lang: "en", durationInFrames: 90, visuals: [{ shotId: "s", kind: "still_motion", assetUrl: "frame.png", fromFrame: 0, durationInFrames: 90 }], audio: [] };
    expect(Timeline.parse(old).visuals[0]!.intent).toBeUndefined();
    expect(Timeline.parse({ ...old, visuals: [{ ...old.visuals[0], intent }] }).visuals[0]!.intent).toEqual(value);
    expect(shotIntentText(value)).toContain("not measured evidence");
    expect(shotIntentText(undefined)).toBe("");
  });
  it.each([{ action: "arbitrary_shader" }, { reveal: 1.1 }, { reveal: -1 }, { holdSec: -1 }, { holdSec: Infinity }, { subject: " " }, { narration: { startWord: 4, endWord: 2 } }])("rejects invalid intent %j", (change) => {
    expect(ShotIntent.safeParse({ ...intent, ...change }).success).toBe(false);
  });
});
