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
  it("keeps seek controls safe for a retained Short without a main-video player", () => {
    const s = state(); s.short = { path: "short.mp4", at: "t", title: "Short", sec: 4, scenes: ["s1"], audit: s.render!.audit }; delete s.render;
    const view = renderIn(<OverviewTab data={makeData(s)} />); expect(view.container.querySelector("video")).toBeNull();
    expect(() => fireEvent.click(screen.getByRole("button", { name: /0:03–0:05/ }))).not.toThrow();
  });
  it("shows frozen research/source/type metadata and seeks a style finding in the main player", () => {
    const s = state(), source = { id: `nasa-${"a".repeat(24)}`, provider: "nasa" as const, sourceId: "fixture", title: "Original archive", creator: "NASA", date: "", sourceUrl: "https://images.nasa.gov/details/fixture", imageUrl: "https://images-assets.nasa.gov/image/fixture.jpg" };
    s.render!.typography = { pair: "warm" }; s.render!.research = { reportKey: "report", fingerprint: "f", revision: 1, sources: 1, claims: 2, unresolved: 1 };
    s.render!.archiveSources = ["s1", "s2"].map((shotId) => ({ shotId, key: "photo.jpg", source }));
    s.render!.styleReference = { key: "reference.jpg", profile: { version: 1, sha256: "a".repeat(64), width: 1, height: 1, sampledPixels: 1, palette: [{ color: "#ffffff", share: 1 }], tone: { p10: 1, median: 1, p90: 1, darkShare: 0, lightShare: 1 }, contrastSpan: 0, edgeDensity: 0 } };
    s.render!.styleSampling = { eligible: 1, excludedArchive: 0, samples: [{ shotId: "s1", seconds: 2 }] };
    s.render!.styleComparison = { at: "t", status: "complete", eligible: 1, excludedArchive: 0, compared: 1, findings: [{ shotId: "s1", seconds: 2, flags: ["palette"] }] };
    const view = renderIn(<OverviewTab data={makeData(s)} />);
    fireEvent.click(screen.getByRole("button", { name: "s1 · 2.0s" })); expect(view.container.querySelector("video")!.currentTime).toBe(2);
    expect(screen.getByRole("link", { name: tr("research.download") }).getAttribute("href")).toContain("research?render");
    expect(screen.getAllByRole("link", { name: "Original archive" })).toHaveLength(1);
    expect(screen.getByText("Bitter / Nunito Sans")).toBeTruthy();
  });
  it("shows bounded extra findings, decoder errors and signed measured audio changes", () => {
    const s = state(); s.render!.audit!.error = "Decoder only partially completed"; s.render!.audit!.findingsCount = 4;
    s.render!.audit!.checks.push({ name: "future_decoder_check", status: "failed" });
    s.render!.audit!.shotAudio = { sampleRate: 48000, channels: 1, referenceDbfs: -20, windowsCount: 2, windows: [1, -1].map((delta, i) => ({ id: `w${i}`, startSec: i, endSec: i + 1, rmsDbfs: -20, sampledPeakDbfs: -10, relativeDb: delta, previousDeltaDb: -delta, coverage: 1, quietShare: .1, envelope: [0, .5] })) };
    renderIn(<RenderAuditCard state={s} busy={false} onSeek={() => {}} />);
    expect(screen.getByText("Decoder only partially completed")).toBeTruthy(); expect(screen.getByText("future_decoder_check")).toBeTruthy();
    expect(screen.getByText(tr("audit.more", { n: 3 }))).toBeTruthy(); expect(screen.getAllByText("-20.0 dBFS RMS")).toHaveLength(2);
  });
});
