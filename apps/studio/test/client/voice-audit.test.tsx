// @vitest-environment happy-dom
import { act as reactAct, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceAuditCard } from "../../src/app/episodes/[id]/voice-audit-card.tsx";
import { LocaleProvider } from "../../src/app/locale-provider.tsx";
import { en, makeState, okAct, renderIn, tr } from "./fixtures.tsx";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const view = () => ({ summary: { status: "complete", scenes: 1, findingsCount: 1 }, evidence: { current: true, reasons: [] as string[], report: { scenes: [{ sceneId: "s1", forms: { script: "C++ 2026.", recorded: "C++ 2026.", spoken: "si pılas pılas iki bin yirmi altı", captions: "C++ 2026." }, checks: [{ name: "word_activity", status: "skipped", reason: "Estimated timing" }], findings: [{ sceneId: "s1", kind: "voice_silent", startMs: 0, endMs: 4000 }], metrics: { durationMs: 4000, coveredMs: 4000, rmsDbfs: null } }] } } });
const state = () => makeState({ script: { scenes: [{ id: "s1", beatId: "b", narration: "C++ 2026.", visualIntent: "", emotion: "", location: "" }] } });
describe("working voice audit card", () => {
  it("loads only on demand and explicitly starts a free audit job", async () => {
    const fetch = vi.fn(async () => Response.json(view())); vi.stubGlobal("fetch", fetch); const act = okAct();
    renderIn(<VoiceAuditCard state={state()} busy={false} act={act} />); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: tr("voiceAudit.title") }));
    await screen.findByText(tr("voiceAudit.kind.voice_silent"), { exact: false });
    expect(screen.getByText("si pılas pılas iki bin yirmi altı")).toBeTruthy();
    expect(screen.getByText("Estimated timing")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tr("voiceAudit.run") })); expect(act).toHaveBeenCalledWith({ type: "audit-voice" });
    expect(screen.getByRole("link", { name: tr("voiceAudit.download") }).getAttribute("href")).toContain("voice-audit?download");
  });
  it("discloses stale evidence, incomplete measurements and report errors", async () => {
    const data = view(); data.evidence.current = false; data.summary.status = "incomplete"; data.evidence.reasons = ["Voice source bytes changed"];
    const fetch = vi.fn(async () => Response.json(data)); vi.stubGlobal("fetch", fetch);
    renderIn(<VoiceAuditCard state={state()} busy={false} act={okAct()} />, "en");
    fireEvent.click(screen.getByRole("button", { name: en("voiceAudit.title") }));
    expect((await screen.findByRole("status")).textContent).toBe(en("voiceAudit.stale"));
    fetch.mockResolvedValueOnce(Response.json({ error: "Report changed" }, { status: 400 }));
    fireEvent.click(screen.getByRole("button", { name: en("research.refresh") }));
    expect((await screen.findByRole("alert")).textContent).toBe("Report changed");
  });
  it("drops late responses after a job starts and paginates long reports", async () => {
    let finish!: (response: Response) => void; const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })); vi.stubGlobal("fetch", fetch);
    const s = state(), act = okAct(), { rerender } = renderIn(<VoiceAuditCard state={s} busy={false} act={act} />);
    fireEvent.click(screen.getByRole("button", { name: tr("voiceAudit.title") }));
    rerender(<LocaleProvider locale="tr"><VoiceAuditCard state={s} busy act={act} /></LocaleProvider>);
    await reactAct(async () => finish(Response.json(view()))); await waitFor(() => expect(screen.queryByText("si pılas pılas iki bin yirmi altı")).toBeNull());
    const data = view(); data.evidence.report.scenes = Array.from({ length: 21 }, (_, i) => ({ ...data.evidence.report.scenes[0]!, sceneId: `scene-${i}` }));
    rerender(<LocaleProvider locale="tr"><VoiceAuditCard state={s} busy={false} act={act} /></LocaleProvider>); await reactAct(async () => finish(Response.json(data)));
    await screen.findByText("scene-0"); expect(screen.queryByText("scene-20")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: tr("quality.next") })); expect(screen.getByText("scene-20")).toBeTruthy();
  });
});
