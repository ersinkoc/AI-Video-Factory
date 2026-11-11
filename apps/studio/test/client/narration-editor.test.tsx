// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NarrationEditor, NarrationUndo } from "../../src/app/episodes/[id]/narration-editor.tsx";
import { LocaleProvider } from "../../src/app/locale-provider.tsx";
import { en, okAct, renderIn, tr } from "./fixtures.tsx";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const preview = { fingerprint: "f".repeat(64), sceneId: "s1", before: "Old text", after: "New text", changed: true, stages: ["voice", "shots", "render"], clearedStages: ["voice", "render"], regenerateVoice: ["s1"], retainedVoice: ["s2"], timingScenes: ["s1", "s2"], relatedShots: ["shot-1"], archiveChoices: ["archive-1"], retainedCharacters: ["hero"], estimatedUsd: null };
describe("reviewed narration editor", () => {
  it("does not save on blur; previews dependencies and applies only the reviewed fingerprint", async () => {
    const fetch = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json(preview)); vi.stubGlobal("fetch", fetch);
    const act = okAct(); renderIn(<NarrationEditor id="e" sceneId="s1" narration="Old text" disabled={false} act={act} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New text" } }); fireEvent.blur(screen.getByRole("textbox"));
    expect(act).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: tr("edit.preview") }));
    await screen.findByRole("button", { name: tr("edit.apply") });
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ type: "preview", sceneId: "s1", narration: "New text" });
    expect(screen.getByText(tr("edit.voice", { changed: "s1", kept: "s2" }))).toBeTruthy();
    expect(screen.getByText(tr("edit.estimate", { amount: tr("edit.unknown") }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tr("edit.apply") }));
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: "edit-narration", sceneId: "s1", narration: "New text", fingerprint: preview.fingerprint }));
  });
  it("requires a new preview after draft changes or rejected application and retains the draft", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(preview))); const act = vi.fn(async () => false);
    renderIn(<NarrationEditor id="e" sceneId="s1" narration="Old text" disabled={false} act={act} />, "en");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New text" } }); fireEvent.click(screen.getByRole("button", { name: en("edit.preview") }));
    fireEvent.click(await screen.findByRole("button", { name: en("edit.apply") }));
    await screen.findByRole("alert"); expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("New text");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Another draft" } });
    expect(screen.queryByRole("button", { name: en("edit.apply") })).toBeNull();
  });
  it("does not publish a late preview after a server update and preserves a local draft", async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const act = okAct(); const { rerender } = renderIn(<NarrationEditor id="e" sceneId="s1" narration="Old text" disabled={false} act={act} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Local draft" } }); fireEvent.click(screen.getByRole("button", { name: tr("edit.preview") }));
    rerender(<LocaleProvider locale="tr"><NarrationEditor id="e" sceneId="s1" narration="Changed elsewhere" disabled={false} act={act} /></LocaleProvider>);
    finish(Response.json(preview)); await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Local draft"));
    expect(screen.queryByRole("button", { name: tr("edit.apply") })).toBeNull(); expect(act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: tr("edit.reset") }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Changed elsewhere");
  });
  it("synchronizes clean text after undo and shows preview failures without saving", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Reload required" }, { status: 400 })));
    const act = okAct(), { rerender } = renderIn(<NarrationEditor id="e" sceneId="s1" narration="Old text" disabled={false} act={act} />);
    rerender(<LocaleProvider locale="tr"><NarrationEditor id="e" sceneId="s1" narration="Restored text" disabled={false} act={act} /></LocaleProvider>);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Restored text");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New text" } }); fireEvent.click(screen.getByRole("button", { name: tr("edit.preview") }));
    expect((await screen.findByRole("alert")).textContent).toBe("Reload required"); expect(act).not.toHaveBeenCalled();
  });
  it("reviews undo before restoring the saved revision", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ editId: "edit-1", fingerprint: "hash", sceneId: "s1", narration: "Old text" })));
    const act = okAct(); renderIn(<NarrationUndo id="e" editId="edit-1" busy={false} act={act} />);
    fireEvent.click(screen.getByRole("button", { name: tr("edit.undoPreview") }));
    fireEvent.click(await screen.findByRole("button", { name: tr("edit.undoApply") }));
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: "undo-narration-edit", editId: "edit-1", fingerprint: "hash" }));
  });
});
