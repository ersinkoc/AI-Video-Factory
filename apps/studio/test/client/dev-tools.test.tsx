// @vitest-environment happy-dom
import { DEV_TOOLS, type DevToolStatus } from "@ys/pipeline/light";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevToolsPanel, type DevToolsJob } from "../../src/app/dev-tools/dev-tools-panel.tsx";
import { en, json, renderIn, tr } from "./fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const status = (installed: Record<string, number>): DevToolStatus[] =>
  DEV_TOOLS.map((t) => {
    const total = t.kind === "mcp" ? 1 : t.skills.length;
    const n = installed[t.id] ?? 0;
    return { id: t.id, installed: n, total, ready: n === total };
  });

function api(state: { tools: DevToolStatus[]; job: DevToolsJob | null }, fail?: string) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init && fail) return new Response(fail, { status: 409 });
      if (!init) return json(state);
      return json({ job: state.job });
    }),
  );
  return calls;
}

const card = (id: string) => document.querySelector(`[data-tool="${id}"]`) as HTMLElement;

describe("DevToolsPanel", () => {
  it("her araç: açıklama, kaynak, lisans, kurulanlar ve durum; kurulu olanın düğmesi kilitli", () => {
    api({ tools: [], job: null });
    renderIn(<DevToolsPanel tools={DEV_TOOLS} initial={status({ "threejs-skills": 9, "webgl-animation-skills": 1 })} initialJob={null} />);
    const three = within(card("threejs-skills"));
    expect(three.getByText(tr("devTools.status.ready"))).toBeTruthy();
    expect((three.getByRole("button", { name: tr("devTools.install") }) as HTMLButtonElement).disabled).toBe(true);
    expect(three.getByText(tr("devTools.desc.threejs-skills"))).toBeTruthy();
    expect(three.getByRole("link").getAttribute("href")).toBe("https://github.com/CloudAI-X/threejs-skills");
    expect(within(card("webgl-animation-skills")).getByText(tr("devTools.status.partial", { installed: 1, total: 2 }))).toBeTruthy();
    expect(card("webgl-animation-skills").textContent).toContain("shader-glsl, particle-system");
    expect(within(card("cinematic-3d-video")).getByText(tr("devTools.status.missing"))).toBeTruthy();
    expect(card("threejs-devtools-mcp").textContent).toContain(tr("devTools.kind.mcp"));
    // Durum listesinde olmayan araç kurulu değil sayılır.
    cleanup();
    renderIn(<DevToolsPanel tools={DEV_TOOLS} initial={[]} initialJob={null} />, "en");
    expect(within(card("threejs-skills")).getByText(en("devTools.status.missing"))).toBeTruthy();
  });

  it("tek araç ya da eksiklerin hepsi kurulur; iş sürerken düğmeler kilitli ve durum sorulur, bitince rozetler yenilenir", async () => {
    vi.useFakeTimers();
    const state = { tools: status({}), job: { status: "running", log: ["threejs-skills kuruluyor"] } as DevToolsJob };
    const calls = api(state);
    renderIn(<DevToolsPanel tools={DEV_TOOLS} initial={status({})} initialJob={null} />);
    await act(async () => void fireEvent.click(within(card("cinematic-3d-video")).getByRole("button", { name: tr("devTools.install") })));
    expect(calls[0]).toEqual({ url: "/api/dev-tools", body: { ids: ["cinematic-3d-video"] } });
    expect(screen.getByRole("status").textContent).toBe(tr("devTools.job.running"));
    expect(screen.getByText("threejs-skills kuruluyor")).toBeTruthy();
    expect((screen.getByRole("button", { name: tr("devTools.installMissing") }) as HTMLButtonElement).disabled).toBe(true);
    state.tools = status({ "threejs-skills": 9, "webgl-animation-skills": 2, "cinematic-3d-video": 1, "threejs-devtools-mcp": 1 });
    state.job = { status: "done", log: [] };
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(screen.getByRole("status").textContent).toBe(tr("devTools.job.done"));
    expect(within(card("cinematic-3d-video")).getByText(tr("devTools.status.ready"))).toBeTruthy();
    // Eksik kalmadı: toplu kurulum düğmesi kilitli.
    expect((screen.getByRole("button", { name: tr("devTools.installMissing") }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("toplu kurulum boş listeyle istenir; reddedilen istek ve hatalı iş görünür", async () => {
    const calls = api({ tools: status({}), job: null }, "Bir iş zaten sürüyor");
    renderIn(<DevToolsPanel tools={DEV_TOOLS} initial={status({})} initialJob={{ status: "error", log: ["Süreç çıkış kodu: 1"] }} />);
    expect(screen.getByRole("status").textContent).toBe(tr("devTools.job.error"));
    expect(screen.getByText("Süreç çıkış kodu: 1")).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: tr("devTools.installMissing") })));
    expect(calls).toEqual([{ url: "/api/dev-tools", body: { ids: [] } }]);
    expect(screen.getByRole("alert").textContent).toBe("Bir iş zaten sürüyor");
  });
});
