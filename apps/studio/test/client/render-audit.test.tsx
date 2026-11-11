// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverviewTab } from "../../src/app/episodes/[id]/overview.tsx";
import { RenderAuditCard } from "../../src/app/episodes/[id]/render-audit-card.tsx";
import { en, makeData, makeState, renderIn, tr } from "./fixtures.tsx";

afterEach(cleanup);
const state = () => makeState({ render: { path: "video.mp4", at: "t", audit: {
  status: "complete", at: "now", findingsCount: 1, reportKey: "episodes/e/render-audits/report.json",
  findings: [{ id: "s1", kind: "freeze", startSec: 3, endSec: 5, detail: "Held image" }],
  checks: [{ name: "black_and_freeze", status: "complete" }, { name: "audio_levels", status: "skipped", reason: "No audio stream." }, { name: "local_motion", status: "failed", reason: "budget exceeded" }],
} } });

describe("render audit card", () => {
  it("seeks and audits the Short independently of the main video", () => {
    const s = state(), act = vi.fn(async () => true);
    s.short = { path: "short.mp4", at: "short-time", title: "Short", sec: 6, scenes: ["s1"], audit: structuredClone(s.render!.audit!) };
    const { container } = renderIn(<OverviewTab data={makeData(s)} act={act} />);
    const panel = screen.getByRole("region", { name: tr("audit.shortTitle") });
    fireEvent.click(within(panel).getByRole("button", { name: /0:03–0:05/ }));
    expect(container.querySelectorAll("video")[1]!.currentTime).toBe(3);
    expect(container.querySelectorAll("video")[0]!.currentTime).toBe(0);
    fireEvent.click(within(panel).getByRole("button", { name: tr("audit.rerun") }));
    expect(act).toHaveBeenCalledWith({ type: "audit-render", target: "short" });
    expect(within(panel).getByRole("link", { name: tr("audit.download") }).getAttribute("href")).toContain("&short");
  });
  it("shows shot energy, distinguishes missing samples from silence and seeks the actual time range", () => {
    const s = state(), onSeek = vi.fn();
    s.render!.audit!.rangeBasis = "current_timeline";
    s.render!.audit!.shotAudio = { sampleRate: 48000, channels: 2, referenceDbfs: -20, windowsCount: 30,
      windows: [{ id: "silent", startSec: 2, endSec: 4, rmsDbfs: null, sampledPeakDbfs: null, relativeDb: null, previousDeltaDb: null, coverage: 1, quietShare: 1, envelope: Array<number>(32).fill(0) },
        { id: "missing", startSec: 4, endSec: 6, rmsDbfs: null, sampledPeakDbfs: null, relativeDb: null, previousDeltaDb: null, coverage: 0, quietShare: 0, envelope: Array<number>(32).fill(0) }] };
    renderIn(<RenderAuditCard state={s} busy={false} onSeek={onSeek} />, "en");
    expect(screen.getByText(en("audit.currentTimeline"))).toBeTruthy();
    expect(screen.getByText(en("audit.silentSamples"))).toBeTruthy();
    expect(screen.getByText(en("audit.unmeasuredSamples"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /missing · 0:04–0:06/ }));
    expect(onSeek).toHaveBeenCalledWith(4);
    expect(screen.getByText(/Showing 2 of 30/)).toBeTruthy();
  });
  it("separates measured, skipped and failed checks and links the report", () => {
    const s = state();
    renderIn(<RenderAuditCard state={s} busy={false} onSeek={() => {}} />);
    const panel = screen.getByRole("region", { name: tr("audit.title") });
    expect(within(panel).getByText(tr("audit.checkStatus.complete"))).toBeTruthy();
    expect(within(panel).getByText(tr("audit.checkStatus.skipped"))).toBeTruthy();
    expect(within(panel).getByText(tr("audit.checkStatus.failed"))).toBeTruthy();
    expect(within(panel).getByRole("link", { name: tr("audit.download") }).getAttribute("href")).toContain(`/api/episodes/${s.id}/audit`);
    expect(within(panel).getByText(tr("audit.advisory"))).toBeTruthy();
  });

  it("seeks the main video to a finding and requests a separate audit", () => {
    const s = state();
    const act = vi.fn(async () => true);
    const { container } = renderIn(<OverviewTab data={makeData(s)} act={act} />);
    fireEvent.click(screen.getByRole("button", { name: /0:03–0:05/ }));
    expect(container.querySelector("video")!.currentTime).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: tr("audit.rerun") }));
    expect(act).toHaveBeenCalledWith({ type: "audit-render" });
  });

  it("offers auditing old exports and prevents concurrent requests", () => {
    const s = state();
    delete s.render!.audit;
    renderIn(<RenderAuditCard state={s} busy onSeek={() => {}} act={async () => true} />, "en");
    expect(screen.getByText(en("audit.absent"))).toBeTruthy();
    expect((screen.getByRole("button", { name: en("audit.run") }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not call an abandoned running audit complete", () => {
    const s = state();
    s.render!.audit!.status = "running";
    renderIn(<RenderAuditCard state={s} busy={false} onSeek={() => {}} />, "en");
    expect(screen.getByText(en("audit.interrupted"))).toBeTruthy();
    expect(screen.queryByText(en("audit.status.complete"))).toBeNull();
  });
});
