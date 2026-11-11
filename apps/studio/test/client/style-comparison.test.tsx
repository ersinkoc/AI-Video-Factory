// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StyleComparisonCard } from "../../src/app/episodes/[id]/style-comparison-card.tsx";
import { renderIn, tr } from "./fixtures.tsx";
import type { EpisodeResponse } from "../../src/lib/types.ts";
afterEach(cleanup);
it("shows the frozen palette, seeks flagged frames and offers an explicit rerun/download", () => {
  const state = { id: "e1", render: { styleReference: { profile: { palette: [{ color: "#ffffff", share: 1 }] } }, styleSampling: {}, styleComparison: { status: "incomplete", compared: 1, eligible: 2, excludedArchive: 1, findings: [{ shotId: "shot", seconds: 2, flags: ["palette"] }], reportKey: "report" } } } as unknown as EpisodeResponse["state"];
  const onSeek = vi.fn(), act = vi.fn(async () => true);
  renderIn(<StyleComparisonCard state={state} busy={false} act={act} onSeek={onSeek} />);
  fireEvent.click(screen.getByText("shot · 2.0s")); expect(onSeek).toHaveBeenCalledWith(2);
  expect(screen.getByText(tr("comparison.download")).getAttribute("href")).toBe("/api/episodes/e1/style-comparison");
  fireEvent.click(screen.getByText(tr("comparison.run"))); expect(act).toHaveBeenCalledWith({ type: "compare-style" });
  expect(screen.getByText(tr("comparison.flag.palette"))).toBeTruthy();
});
it("keeps legacy exports without a frozen reference free of fabricated comparisons", () => {
  const view = renderIn(<StyleComparisonCard state={{ render: { path: "old.mp4", at: "old" } } as EpisodeResponse["state"]} busy={false} onSeek={() => {}} />);
  expect(view.container.textContent).toBe("");
});
