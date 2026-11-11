import { describe, expect, it } from "vitest";
import { ShotIntent, VectorShot } from "@ys/core";
import { collectIntentFindings } from "../src/intent.ts";
import { buildTimeline, resolveShotTimes } from "../src/timing.ts";
import { makeState, SCRIPT, voiceOf } from "./pipeline-harness.ts";

const intent = () => ShotIntent.parse({ subject: "c1", action: "typing", target: "keyboard", payoff: "Code appears", narration: { startWord: 0, endWord: 1 }, reveal: .5, holdSec: 1 });
function state() {
  return makeState({}, { script: { ...SCRIPT, scenes: [SCRIPT.scenes[0]!] }, voice: { s1: voiceOf("s1", 4000) }, keyframes: {}, shots: [{ id: "s1-sh1", sceneId: "s1", startMs: 0, endMs: 4000, kind: "still_motion", description: "A coder", imagePrompt: "", motionPrompt: "", camera: "static", intent: intent(), vector: VectorShot.parse({ layers: [{ asset: "c1", x: 500, anims: [{ type: "typing" }] }, { asset: "keyboard", x: 800 }] }) }] });
}
describe("intent plan consistency", () => {
  it("preserves intent through word timing and vector/media timeline construction", () => {
    const s = state(), value = intent();
    expect(collectIntentFindings(s)).toEqual([]);
    const planned = resolveShotTimes({ scenes: [{ sceneId: "s1", shots: [{ startWord: 0, kind: "still_motion", characterIds: ["c1"], locationId: "", description: "coder", imagePrompt: "", motionPrompt: "", camera: "static", ambience: "none", intent: value }] }] }, ["s1"], s.voice!);
    expect(planned[0]!.intent).toEqual(value);
    expect(buildTimeline(s, (key) => key).visuals[0]!.intent).toEqual(value);
    delete s.shots![0]!.vector; s.keyframes = { "s1-sh1": { key: "still.png", mimeType: "image/png" } };
    expect(buildTimeline(s, (key) => key).visuals[0]!.intent).toEqual(value);
  });
  it("does not flag or migrate absent legacy intent, and treats an explicit quiet hold as valid", () => {
    const s = state(); delete s.shots![0]!.intent;
    expect(collectIntentFindings(s)).toEqual([]);
    s.shots![0]!.intent = { ...intent(), action: "hold" };
    s.shots![0]!.vector!.layers[0]!.anims = [];
    expect(collectIntentFindings(s)).toEqual([]);
    expect(collectIntentFindings({})).toEqual([]);
  });
  it("reports lost subjects/targets, gesture mismatches and impossible holds without repairing or billing", () => {
    const s = state(), shot = s.shots![0]!;
    shot.intent = { ...intent(), subject: "missing-person", target: "missing-object", reveal: .9, holdSec: 2 };
    const before = JSON.stringify(s);
    expect(collectIntentFindings(s).map((f) => f.code)).toEqual(expect.arrayContaining(["intent_subject_missing", "intent_target_missing", "intent_action_missing", "intent_hold_overrun"]));
    expect(JSON.stringify(s)).toBe(before);
    shot.intent = { ...intent(), action: "point" }; shot.vector!.layers[0]!.anims = [{ type: "point", target: 0, start: 0, end: 1 }];
    expect(collectIntentFindings(s).map((f) => f.code)).toContain("intent_target_mismatch");
  });
  it("checks the declared narration range against the saved scene alignment", () => {
    const s = state(), shot = s.shots![0]!;
    shot.intent!.narration.endWord = 99;
    expect(collectIntentFindings(s)[0]!.code).toBe("intent_narration_unavailable");
    shot.intent!.narration = { startWord: 0, endWord: 1 }; shot.startMs = 1000;
    expect(collectIntentFindings(s).map((f) => f.code)).toContain("intent_narration_outside_shot");
    shot.intent!.narration.endWord = -1;
    expect(collectIntentFindings(s)[0]!.code).toBe("intent_invalid");
  });
  it("checks text reading budgets, still-media limits and missing selectors while preserving deliberate archive choices", () => {
    const s = state(), shot = s.shots![0]!;
    shot.intent = { ...intent(), subject: "text:0", action: "reveal", holdSec: .5, target: undefined };
    shot.vector!.texts = [{ text: "Four words need time", x: 300, y: 100, style: "title", anims: [] }];
    expect(collectIntentFindings(s).map((f) => f.code)).toContain("intent_text_hold");
    shot.intent.holdSec = 2; expect(collectIntentFindings(s)).toEqual([]);
    shot.vector!.texts[0]!.anims = [{ type: "typewriter", start: .8, end: 1 }];
    expect(collectIntentFindings(s).map((f) => f.code)).toContain("intent_text_timing");
    shot.vector!.texts[0]!.anims = [];
    shot.intent.subject = "text:2"; expect(collectIntentFindings(s)[0]!.code).toBe("intent_subject_missing");
    shot.intent = intent(); delete shot.vector;
    expect(collectIntentFindings(s)[0]!.code).toBe("intent_still_action");
    s.archives = { [shot.id]: {} as never }; expect(collectIntentFindings(s)).toEqual([]);
    delete s.archives; shot.kind = "ai_clip"; expect(collectIntentFindings(s)).toEqual([]);
  });
});
