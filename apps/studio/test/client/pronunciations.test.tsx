// @vitest-environment happy-dom
import { act as reactAct, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  it("edits/removes scoped rules, pages effective terms and explains a no-change impact", async () => {
    const data = { ...view(), shared: [{ lang: "tr", written: "Shared", spoken: "ortak" }], overrides: { Local: "yerel" }, pending: { scenes: ["s1"] }, effective: Array.from({ length: 31 }, (_, i) => ({ written: `Term ${i}`, spoken: "term", origin: "shared" })) };
    const empty = { ...impact(), affected: [], retained: [], stages: [], scenes: [{ ...impact().scenes[0]!, recorded: undefined, status: "missing" }] };
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? Response.json(JSON.parse(init.body as string).type === "preview" ? empty : { ok: true }) : Response.json(data)); vi.stubGlobal("fetch", fetcher);
    renderIn(<PronunciationPanel id="e" busy={false} version="1" />, "en"); fireEvent.click(screen.getByRole("button", { name: en("pronunciation.title") })); await screen.findByLabelText(en("pronunciation.written"));
    fireEvent.click(within(screen.getByText(/Shared → ortak/).closest("li")!).getByRole("button", { name: en("research.edit") }));
    expect(screen.getByLabelText(en("pronunciation.written"))).toHaveProperty("value", "Shared");
    fireEvent.change(screen.getByLabelText(en("pronunciation.spoken")), { target: { value: "updated" } });
    fireEvent.click(screen.getByRole("button", { name: en("research.cancel") }));
    const local = screen.getByText(/Local → yerel/).closest("li")!;
    fireEvent.click(within(local).getByRole("button", { name: en("pronunciation.remove") }));
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.getByRole("button", { name: en("pronunciation.preview") })).toHaveProperty("disabled", false));
    const details = screen.getByText(en("pronunciation.effective")).closest("details")!; fireEvent.click(within(details).getByText(en("pronunciation.effective")));
    fireEvent.click(within(details).getByRole("button", { name: en("quality.next") })); expect(within(details).getByText(/Term 30 →/)).toBeTruthy();
    fireEvent.click(within(details).getByRole("button", { name: en("quality.previous") })); expect(within(details).getByText(/Term 0 →/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en("pronunciation.preview") })); expect(await screen.findByRole("button", { name: en("pronunciation.apply") })).toHaveProperty("disabled", true);
    expect(screen.getByText(en("pronunciation.recorded") + ": " + en("voiceAudit.unknown"))).toBeTruthy();
  });
  it.each(["http", "network"])("preserves a new rule after a %s save failure", async (failure) => {
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => { if (init?.method !== "POST") return Response.json(view()); if (failure === "network") throw "offline"; return Response.json({}, { status: 400 }); }));
    renderIn(<PronunciationPanel id="e" busy={false} version="1" />, "en"); fireEvent.click(screen.getByRole("button", { name: en("pronunciation.title") })); await screen.findByLabelText(en("pronunciation.written"));
    fireEvent.change(screen.getByLabelText(en("pronunciation.written")), { target: { value: "Word" } }); fireEvent.change(screen.getByLabelText(en("pronunciation.spoken")), { target: { value: "word" } });
    fireEvent.click(screen.getByRole("button", { name: en("pronunciation.save") })); expect((await screen.findByRole("alert")).textContent).toBe(en("pronunciation.error"));
    expect(screen.getByLabelText(en("pronunciation.written"))).toHaveProperty("value", "Word");
  });
  it("ignores an obsolete write failure after production starts", async () => {
    let reject!: (e: Error) => void;
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? new Promise<Response>((_yes, no) => { reject = no; }) : Response.json(view())));
    const v = renderIn(<PronunciationPanel id="e" busy={false} version="1" />, "en"); fireEvent.click(screen.getByRole("button", { name: en("pronunciation.title") })); await screen.findByLabelText(en("pronunciation.written"));
    fireEvent.click(screen.getByRole("button", { name: en("pronunciation.preview") }));
    v.rerender(<LocaleProvider locale="en"><PronunciationPanel id="e" busy version="1" /></LocaleProvider>); await reactAct(async () => reject(new Error("Obsolete write failure")));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
