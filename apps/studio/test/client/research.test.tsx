// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchPanel } from "../../src/app/episodes/[id]/research-panel.tsx";
import { en, renderIn } from "./fixtures.tsx";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const view = () => ({ revision: 2, unresolved: 1, sources: [{ id: "source-1", title: "Lab note", url: "https://example.org/lab", excerpt: "48 test cycles.", publisher: "Lab", date: "", locator: "Section 2", origin: "editor", recordedAt: "at" }], claims: [{ id: "claim-1", sceneId: "s1", quote: "48 cycles", statement: "The rig completed 48 cycles", kind: "fact", status: "stale", anchorCurrent: false, dependentShots: ["s1-sh1"], links: [{ sourceId: "source-1", relation: "supports" }], fingerprint: "a".repeat(64) }] });
describe("research panel", () => {
  it("keeps the editing revision when a newer book is refreshed, rather than overwriting concurrent edits", async () => {
    let revision = 2;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "POST" ? { ok: true } : { ...view(), revision })); vi.stubGlobal("fetch", fetcher);
    renderIn(<ResearchPanel id="e" scenes={[{ id: "s1", narration: "48 cycles" }]} busy={false} />, "en");
    fireEvent.click(screen.getByRole("button", { name: en("research.title") })); await screen.findByText("The rig completed 48 cycles");
    const source = screen.getByText("Lab note", { selector: "a" }).closest("li")!;
    fireEvent.click(within(source).getByRole("button", { name: en("research.edit"), hidden: true }));
    fireEvent.change(screen.getByLabelText(en("research.sourceTitle")), { target: { value: "My pending edit" } });
    revision = 3; fireEvent.click(screen.getByRole("button", { name: en("research.refresh") }));
    await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(2));
    await waitFor(() => expect((screen.getByRole("button", { name: en("research.saveSource") }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.submit(screen.getByRole("button", { name: en("research.saveSource") }).closest("form")!);
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    expect(JSON.parse(fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string).expectedRevision).toBe(2);
  });
  it("loads on demand, saves a source with a revision and keeps paid rewriting explicit", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "POST" ? { ok: true } : view())); vi.stubGlobal("fetch", fetcher);
    const rewrite = vi.fn(async () => true);
    renderIn(<ResearchPanel id="e" scenes={[{ id: "s1", narration: "The rig completed 48 cycles." }]} busy={false} onRewrite={rewrite} />, "en");
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en("research.title") })); await screen.findByText("The rig completed 48 cycles");
    expect(screen.getByText(en("research.hint"))).toBeTruthy(); expect(rewrite).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(en("research.sourceTitle")), { target: { value: "New source" } });
    fireEvent.change(screen.getByLabelText(en("research.url")), { target: { value: "https://example.org/new" } });
    fireEvent.change(screen.getByLabelText(en("research.excerpt")), { target: { value: "An editor supplied this passage." } });
    fireEvent.submit(screen.getByRole("button", { name: en("research.saveSource") }).closest("form")!);
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const body = JSON.parse(fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string);
    expect(body.expectedRevision).toBe(2); expect(body.mutation).toMatchObject({ type: "put-source", source: { title: "New source", excerpt: "An editor supplied this passage." } });
    await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: en("research.rewrite") })); expect(rewrite).toHaveBeenCalledTimes(1);
  });
  it("blocks stale approvals, allows rebinding and surfaces rejected saves", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? Response.json({ error: "Record changed" }, { status: 400 }) : Response.json(view())); vi.stubGlobal("fetch", fetcher);
    renderIn(<ResearchPanel id="e" scenes={[{ id: "s1", narration: "A different sentence." }]} busy={false} />, "en");
    fireEvent.click(screen.getByRole("button", { name: en("research.title") })); await screen.findByText("The rig completed 48 cycles");
    expect((screen.getByRole("button", { name: en("research.status.supported") }) as HTMLButtonElement).disabled).toBe(true);
    const item = screen.getByText("The rig completed 48 cycles").closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: en("research.edit") }));
    expect(screen.getByLabelText(en("research.quote"))).toHaveProperty("value", "48 cycles");
    fireEvent.submit(screen.getByRole("button", { name: en("research.saveClaim") }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Record changed");
  });
  it("edits metadata, links several sources, saves a new claim and reviews a current claim", async () => {
    const base = view(), data = { ...base, sources: [...base.sources, { ...base.sources[0]!, id: "source-2", title: "Second note" }], claims: [{ ...base.claims[0]!, anchorCurrent: true }, { ...base.claims[0]!, id: "claim-2", statement: "Reconstruction", kind: "reconstruction", anchorCurrent: true, dependentShots: [], links: [{ sourceId: "missing-source", relation: "context" }] }] };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "POST" ? { ok: true } : data)); vi.stubGlobal("fetch", fetcher);
    renderIn(<ResearchPanel id="e" scenes={[{ id: "s1", narration: "48 cycles" }]} busy={false} />, "en"); fireEvent.click(screen.getByRole("button", { name: en("research.title") })); await screen.findByText("The rig completed 48 cycles");
    const sourceForm = screen.getByRole("button", { name: en("research.saveSource") }).closest("form")!;
    for (const [field, value] of [["sourceTitle", "Edited source"], ["url", "https://example.org/edited"], ["locator", "Page 3"], ["publisher", "Press"], ["date", "2026"], ["excerpt", "48 cycles"]] as const) fireEvent.change(screen.getByLabelText(en(`research.${field}`)), { target: { value } });
    fireEvent.submit(sourceForm); await waitFor(() => expect(screen.getByLabelText(en("research.sourceTitle"))).toHaveProperty("value", ""));
    const sourceItem = screen.getByText("Lab note", { selector: "a" }).closest("li")!;
    fireEvent.click(within(sourceItem).getByRole("button", { name: en("research.edit"), hidden: true }));
    fireEvent.click(within(sourceForm).getByRole("button", { name: en("research.cancel") }));
    fireEvent.change(screen.getByLabelText(en("research.scene")), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText(en("research.quote")), { target: { value: "48 cycles" } });
    fireEvent.change(screen.getByLabelText(en("research.statement")), { target: { value: "New claim" } });
    fireEvent.change(screen.getByLabelText(en("research.kind")), { target: { value: "estimate" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Lab note" })); fireEvent.click(screen.getByRole("checkbox", { name: "Second note" }));
    fireEvent.change(screen.getByLabelText(`${en("research.relation")} Lab note`), { target: { value: "contradicts" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Lab note" })); fireEvent.click(screen.getByRole("checkbox", { name: "Lab note" }));
    fireEvent.change(screen.getByLabelText(`${en("research.relation")} Lab note`), { target: { value: "context" } });
    const claimForm = screen.getByRole("button", { name: en("research.saveClaim") }).closest("form")!;
    fireEvent.submit(claimForm); await waitFor(() => expect(screen.getByLabelText(en("research.quote"))).toHaveProperty("value", ""));
    const post = fetcher.mock.calls.filter(([, opts]) => opts?.method === "POST").map(([, opts]) => JSON.parse(opts!.body as string));
    expect(post[0].mutation.source).toMatchObject({ locator: "Page 3", publisher: "Press", date: "2026" });
    expect(post[1].mutation.claim).toMatchObject({ kind: "estimate", links: [{ sourceId: "source-2", relation: "supports" }, { sourceId: "source-1", relation: "context" }] });
    const item = screen.getByText("The rig completed 48 cycles").closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: en("research.edit") })); fireEvent.click(within(claimForm).getByRole("button", { name: en("research.cancel") }));
    fireEvent.click(within(item).getByRole("button", { name: en("research.status.disputed") }));
    await waitFor(() => expect(fetcher.mock.calls.filter(([, opts]) => opts?.method === "POST")).toHaveLength(3));
    expect(screen.getByText(/missing-source/)).toBeTruthy();
  });
  it.each(["http", "network"])("keeps rejected source edits on %s failure", async (failure) => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method !== "POST") return Response.json(view()); if (failure === "network") throw "offline"; return Response.json({}, { status: 400 }); }));
    renderIn(<ResearchPanel id="e" scenes={[{ id: "s1", narration: "48 cycles" }]} busy={false} />, "en"); fireEvent.click(screen.getByRole("button", { name: en("research.title") })); await screen.findByText("The rig completed 48 cycles");
    fireEvent.change(screen.getByLabelText(en("research.sourceTitle")), { target: { value: "Keep this draft" } }); fireEvent.change(screen.getByLabelText(en("research.url")), { target: { value: "https://example.org/new" } });
    fireEvent.submit(screen.getByRole("button", { name: en("research.saveSource") }).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe(en("research.error")); expect(screen.getByLabelText(en("research.sourceTitle"))).toHaveProperty("value", "Keep this draft");
  });
  it("loads an empty book without a script and prevents claims without scene anchors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ revision: 0, sources: [], claims: [], unresolved: 0 })));
    renderIn(<ResearchPanel id="e" busy={false} />, "en"); fireEvent.click(screen.getByRole("button", { name: en("research.title") }));
    expect(await screen.findByRole("button", { name: en("research.saveClaim") })).toHaveProperty("disabled", true);
  });
});
