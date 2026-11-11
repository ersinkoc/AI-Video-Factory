// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchivePicker } from "../../src/app/episodes/[id]/archive-picker.tsx";
import { makeState, renderIn, tr } from "./fixtures.tsx";
import type { ArchiveCandidate } from "@ys/core";
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
});
