// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchPanel } from "../../src/app/episodes/[id]/research-panel.tsx";
import { PronunciationPanel } from "../../src/app/episodes/[id]/pronunciation-panel.tsx";
import { QualityIssueBoard } from "../../src/app/episodes/[id]/quality-issue-board.tsx";
import { VoiceAuditCard } from "../../src/app/episodes/[id]/voice-audit-card.tsx";
import { LocaleProvider } from "../../src/app/locale-provider.tsx";
import { en, makeState, okAct, renderIn } from "./fixtures.tsx";
const panels = [
  { name: "research", title: en("research.title"), error: en("research.error"), render: (busy: boolean) => <ResearchPanel id="e" busy={busy} />, data: { revision: 1, sources: [], claims: [], unresolved: 0 } },
  { name: "pronunciation", title: en("pronunciation.title"), error: en("pronunciation.error"), render: (busy: boolean) => <PronunciationPanel id="e" busy={busy} version="1" />, data: { lang: "en", revision: 1, fingerprint: "fp", effective: [], shared: [], overrides: {}, pending: null } },
  { name: "quality", title: en("quality.title"), error: en("quality.error"), render: (busy: boolean) => <QualityIssueBoard id="e" busy={busy} version="1" onSeek={() => {}} />, data: { issues: [], total: 0, offset: 0, notices: [], historicalDecisions: 0 } },
  { name: "voice", title: en("voiceAudit.title"), error: en("voiceAudit.error"), render: (busy: boolean) => <VoiceAuditCard state={makeState()} busy={busy} act={okAct()} />, data: { summary: null, evidence: null } },
];
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe.each(panels)("$name panel async boundary", (panel) => {
  it.each(["http", "network"])("reports %s failure without inventing a clean result", async (failure) => {
    vi.stubGlobal("fetch", vi.fn(async () => { if (failure === "network") throw "offline"; return Response.json({}, { status: 503 }); }));
    renderIn(panel.render(false), "en"); fireEvent.click(screen.getByRole("button", { name: panel.title }));
    expect((await screen.findByRole("alert")).textContent).toBe(panel.error);
  });
  it.each(["success", "failure"])("ignores late %s after production starts", async (outcome) => {
    let resolve!: (r: Response) => void, reject!: (e: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((yes, no) => { resolve = yes; reject = no; })));
    const view = renderIn(panel.render(false), "en"); fireEvent.click(screen.getByRole("button", { name: panel.title }));
    view.rerender(<LocaleProvider locale="en">{panel.render(true)}</LocaleProvider>);
    await act(async () => { if (outcome === "success") resolve(Response.json(panel.data)); else reject(new Error("Late obsolete error")); });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("aborts a stalled read after the bounded wait", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: unknown, opts?: RequestInit) => new Promise<Response>((_yes, no) => { signal = opts?.signal ?? undefined; signal!.addEventListener("abort", () => no(new Error("Read timed out")), { once: true }); })));
    renderIn(panel.render(false), "en"); fireEvent.click(screen.getByRole("button", { name: panel.title }));
    expect(signal!.aborted).toBe(false); await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(signal!.aborted).toBe(true); expect(screen.getByRole("alert").textContent).toBe("Read timed out");
  });
});
