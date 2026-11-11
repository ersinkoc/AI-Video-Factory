// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShotIntentDetails } from "../../src/app/episodes/[id]/shot-intent.tsx";
import { renderIn, tr, en } from "./fixtures.tsx";
import type { ShotIntent } from "@ys/core";

afterEach(cleanup);
const intent: ShotIntent = { subject: "c2", target: "keyboard", action: "typing", payoff: "The program appears", narration: { startWord: 2, endWord: 6 }, reveal: .6, holdSec: 1.5 };
describe("shot intent details", () => {
  it("shows malformed saved metadata without crashing and selects the declared narration words", () => {
    const { rerender } = renderIn(<ShotIntentDetails intent={{ subject: "old" } as ShotIntent} narration="Some saved words" />, "en");
    expect(screen.getByText(en("intent.invalid"))).toBeTruthy();
    rerender(<ShotIntentDetails intent={{ ...intent, narration: { startWord: 1, endWord: 2 } }} narration="Some relevant words here" />);
    expect(screen.getByText("relevant words")).toBeTruthy();
  });
  it("keeps legacy shots unchanged and shows localized direction with readable names", () => {
    const { rerender } = renderIn(<ShotIntentDetails />, "tr");
    expect(screen.queryByText(tr("intent.title"))).toBeNull();
    rerender(<ShotIntentDetails intent={intent} subjectLabel="Ada" targetLabel="Klavye" />);
    expect(screen.getByText("Ada")).toBeTruthy(); expect(screen.getByText("Klavye")).toBeTruthy();
    expect(screen.getByText(tr("intent.action.typing"))).toBeTruthy();
    expect(screen.getByText(tr("intent.hint"))).toBeTruthy();
    expect(screen.getByText("2–6")).toBeTruthy(); expect(screen.getByText("60%")).toBeTruthy(); expect(screen.getByText("1.5s")).toBeTruthy();
  });
  it("shows intentional quiet holds without requesting regeneration or publication approval", () => {
    renderIn(<ShotIntentDetails intent={{ ...intent, action: "hold", target: undefined }} narrationText="The student runs the program" />, "en");
    expect(screen.getByText(en("intent.action.hold"))).toBeTruthy();
    expect(screen.getByText(en("intent.hint"))).toBeTruthy();
    expect(screen.getByText("The student runs the program")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
