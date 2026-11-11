// @vitest-environment happy-dom
import { act as reactAct, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchivePicker } from "../../src/app/episodes/[id]/archive-picker.tsx";
import { makeState, renderIn, tr } from "./fixtures.tsx";
import type { ArchiveCandidate } from "@ys/core";
import { LocaleProvider } from "../../src/app/locale-provider.tsx";
const source: ArchiveCandidate = { id: `nasa-${"a".repeat(24)}`, provider: "nasa", title: "Apollo 11", creator: "NASA", date: "1969", sourceId: "apollo", sourceUrl: "https://images.nasa.gov/details/apollo", imageUrl: "https://images-assets.nasa.gov/image/apollo.jpg" };
const state = () => makeState({ shots: [{ id: "shot", sceneId: "s1", startMs: 0, endMs: 4000, description: "Space", imagePrompt: "", motionPrompt: "", kind: "still_motion", camera: "static" }] });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("archive picker", () => {
  it("searches explicitly and attaches a discovered item to the chosen shot", async () => {
    const fetcher = vi.fn(async () => Response.json({ query: "Apollo", items: [source], errors: [], at: "now" }));
    vi.stubGlobal("fetch", fetcher); const act = vi.fn(async () => true);
    renderIn(<ArchivePicker state={state()} busy={false} act={act} />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: tr("archive.title") }));
    fireEvent.change(screen.getByRole("textbox", { name: tr("archive.query") }), { target: { value: "Apollo" } });
    fireEvent.click(screen.getByRole("button", { name: tr("archive.search") }));
    await screen.findByText(source.title);
    expect(screen.getByRole("img", { name: source.title }).getAttribute("src")).toContain(`/api/archive/${source.id}/image`);
    fireEvent.click(screen.getByRole("button", { name: tr("archive.use") }));
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: "use-archive", shotId: "shot", candidateId: source.id }));
  });
  it("reports partial searches separately from genuinely empty results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ query: "Apollo", items: [], errors: [{ provider: "nasa", message: "down" }], at: "now" })));
    renderIn(<ArchivePicker state={state()} busy={false} act={async () => true} />);
    fireEvent.click(screen.getByRole("button", { name: tr("archive.title") }));
    fireEvent.change(screen.getByRole("textbox", { name: tr("archive.query") }), { target: { value: "Apollo" } });
    fireEvent.click(screen.getByRole("button", { name: tr("archive.search") }));
    expect(await screen.findByText(tr("archive.partial", { providers: "nasa" }))).toBeTruthy();
    expect(screen.queryByText(tr("archive.empty"))).toBeNull();
  });
  it("restores an existing choice, changes shots and disables selection when the plan disappears", async () => {
    const s = state(), act = vi.fn(async () => false);
    s.archives = { shot: { key: "photo.jpg", source, mimeType: "image/jpeg", width: 1, height: 1, downloadedAt: "t", originalSha256: "hash" } };
    s.shots!.push({ ...s.shots![0]!, id: "second" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ query: "Apollo", items: [source], errors: [] })));
    const view = renderIn(<ArchivePicker state={s} busy={false} act={act} />); fireEvent.click(screen.getByRole("button", { name: tr("archive.title") }));
    fireEvent.click(screen.getByRole("button", { name: tr("archive.restore") })); expect(act).toHaveBeenCalledWith({ type: "remove-archive", shotId: "shot" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "second" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Apollo" } }); fireEvent.click(screen.getByRole("button", { name: tr("archive.search") }));
    await screen.findByRole("button", { name: tr("archive.use") }); fireEvent.click(screen.getByRole("button", { name: tr("archive.use") }));
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: "use-archive", shotId: "second", candidateId: source.id }));
    expect(screen.getByRole("button", { name: tr("archive.use") })).toBeTruthy();
    view.rerender(<LocaleProvider locale="tr"><ArchivePicker state={{ ...s, shots: undefined }} busy={false} act={act} /></LocaleProvider>);
    expect((screen.getByRole("button", { name: tr("archive.use") }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(["empty", "http", "network"])("shows a distinct %s outcome", async (outcome) => {
    vi.stubGlobal("fetch", vi.fn(async () => { if (outcome === "network") throw "offline"; if (outcome === "http") return Response.json({}, { status: 503 }); return Response.json({ items: [], errors: [] }); }));
    renderIn(<ArchivePicker state={state()} busy={false} act={async () => true} />); fireEvent.click(screen.getByRole("button", { name: tr("archive.title") }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Apollo" } }); fireEvent.click(screen.getByRole("button", { name: tr("archive.search") }));
    if (outcome === "empty") expect(await screen.findByText(tr("archive.empty"))).toBeTruthy();
    else expect((await screen.findByRole("alert")).textContent).toBe(outcome === "network" ? "offline" : tr("common.actionFailed"));
  });
  it.each(["success", "failure"])("ignores a late %s after the query changes", async (outcome) => {
    let resolve!: (r: Response) => void, reject!: (e: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((yes, no) => { resolve = yes; reject = no; })));
    renderIn(<ArchivePicker state={state()} busy={false} act={async () => true} />); fireEvent.click(screen.getByRole("button", { name: tr("archive.title") }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Apollo" } }); fireEvent.click(screen.getByRole("button", { name: tr("archive.search") }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New query" } });
    await reactAct(async () => { if (outcome === "success") resolve(Response.json({ items: [source], errors: [] })); else reject(new Error("Obsolete error")); });
    expect(screen.queryByText(source.title)).toBeNull(); expect(screen.queryByRole("alert")).toBeNull();
  });
});
