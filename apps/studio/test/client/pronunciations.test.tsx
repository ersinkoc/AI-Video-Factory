// @vitest-environment happy-dom
import { act as reactAct, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PronunciationPanel } from "../../src/app/episodes/[id]/pronunciation-panel.tsx";
import { LocaleProvider } from "../../src/app/locale-provider.tsx";
import { en, renderIn, tr } from "./fixtures.tsx";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const view = () => ({ lang: "tr", revision: 3, fingerprint: "fp", effective: [{ written: "C++", spoken: "si pılas pılas", origin: "builtin" }], shared: [], overrides: {}, pending: null });
const impact = () => ({ fingerprint: "fp", revision: 3, rulesFingerprint: "rules", affected: ["s1"], retained: ["s2"], stages: ["voice", "render"], scenes: [{ sceneId: "s1", script: "C++", recorded: "si pılas pılas", spoken: "local", status: "changed" }] });
describe("pronunciation editor", () => {
  it("loads on demand, saves an explicit shared rule and requires saved rules before impact review", async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? Response.json({ ok: true }) : Response.json(view())); vi.stubGlobal("fetch", fetch);
    renderIn(<PronunciationPanel id="e" busy={false} version="1" />); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: tr("pronunciation.title") })); await screen.findByLabelText(tr("pronunciation.written"));
    fireEvent.change(screen.getByLabelText(tr("pronunciation.written")), { target: { value: "C++" } });
    fireEvent.change(screen.getByLabelText(tr("pronunciation.spoken")), { target: { value: "see plus plus" } });
    fireEvent.change(screen.getByLabelText(tr("pronunciation.scope")), { target: { value: "shared" } });
    expect(screen.getByRole("button", { name: tr("pronunciation.preview") }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: tr("pronunciation.save") }));
    await waitFor(() => expect((screen.getByLabelText(tr("pronunciation.written")) as HTMLInputElement).value).toBe(""));
    const write = fetch.mock.calls.find((c) => c[1]?.method === "POST")!; expect(JSON.parse(write[1]!.body as string)).toMatchObject({ type: "put", scope: "shared", written: "C++", spoken: "see plus plus", revision: 3 });
  });
  it("shows current/desired forms before applying a revision-bound impact", async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? JSON.parse(init.body as string).type === "preview" ? Response.json(impact()) : Response.json({ ok: true }) : Response.json(view())); vi.stubGlobal("fetch", fetch);
    renderIn(<PronunciationPanel id="e" busy={false} version="1" />, "en"); fireEvent.click(screen.getByRole("button", { name: en("pronunciation.title") })); await screen.findByLabelText(en("pronunciation.written"));
    fireEvent.click(screen.getByRole("button", { name: en("pronunciation.preview") }));
    const apply = await screen.findByRole("button", { name: en("pronunciation.apply") }); expect(screen.getByText(en("pronunciation.recorded") + ": si pılas pılas")).toBeTruthy();
    fireEvent.click(apply); await waitFor(() => expect(fetch.mock.calls.some((c) => c[1]?.method === "POST" && JSON.parse(c[1].body as string).type === "apply")).toBe(true));
    expect(JSON.parse(fetch.mock.calls.find((c) => c[1]?.method === "POST" && JSON.parse(c[1].body as string).type === "apply")![1]!.body as string)).toEqual({ type: "apply", fingerprint: "fp", revision: 3, rulesFingerprint: "rules" });
  });
  it("retains the editing revision across refresh and preserves rejected form content", async () => {
    let revision = 3; const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? Response.json({ error: "Stale rule" }, { status: 400 }) : Response.json({ ...view(), revision })); vi.stubGlobal("fetch", fetch);
    renderIn(<PronunciationPanel id="e" busy={false} version="1" />); fireEvent.click(screen.getByRole("button", { name: tr("pronunciation.title") })); await screen.findByLabelText(tr("pronunciation.written"));
    fireEvent.change(screen.getByLabelText(tr("pronunciation.written")), { target: { value: "C++" } }); fireEvent.change(screen.getByLabelText(tr("pronunciation.spoken")), { target: { value: "local" } });
    fireEvent.change(screen.getByLabelText(tr("pronunciation.scope")), { target: { value: "shared" } });
    revision = 4; fireEvent.click(screen.getByRole("button", { name: tr("research.refresh") })); await screen.findByText(tr("pronunciation.revision", { lang: "tr", revision: 4 }));
    fireEvent.click(screen.getByRole("button", { name: tr("pronunciation.save") })); expect((await screen.findByRole("alert")).textContent).toBe("Stale rule");
    expect(JSON.parse(fetch.mock.calls.find((c) => c[1]?.method === "POST")![1]!.body as string).revision).toBe(3);
    expect((screen.getByLabelText(tr("pronunciation.spoken")) as HTMLInputElement).value).toBe("local");
  });
  it("does not publish a late impact after production starts", async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? new Promise<Response>((resolve) => { finish = resolve; }) : Response.json(view())));
    const { rerender } = renderIn(<PronunciationPanel id="e" busy={false} version="1" />); fireEvent.click(screen.getByRole("button", { name: tr("pronunciation.title") })); await screen.findByLabelText(tr("pronunciation.written"));
    fireEvent.click(screen.getByRole("button", { name: tr("pronunciation.preview") }));
    rerender(<LocaleProvider locale="tr"><PronunciationPanel id="e" busy version="1" /></LocaleProvider>);
    await reactAct(async () => finish(Response.json(impact()))); expect(screen.queryByRole("button", { name: tr("pronunciation.apply") })).toBeNull();
  });
});
