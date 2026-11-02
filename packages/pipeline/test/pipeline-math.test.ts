import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannedShotState } from "../src/index.ts";
import { render, resetFakes } from "./pipeline-fakes.ts";
import { harness, makeState, SCRIPT, STYLE, voiceOf, vshot } from "./pipeline-harness.ts";

vi.mock("@ys/agents", async (orig) => (await import("./pipeline-fakes.ts")).mockAgents(await orig()));
vi.mock("@ys/video/render", async () => {
  const f = await import("./pipeline-fakes.ts");
  return { renderEpisode: (o: any) => f.render.episode(o), renderStills: (o: any) => f.render.stills(o) };
});
const board = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("../src/manim.ts", async (orig) => ({ ...(await orig<object>()), renderBoard: (...a: unknown[]) => board.render(...a) }));

/**
 * Manim tahtaları timeline aşamasında yerel Manim ile üretilir (burada sahte): kütüphanede tutulur, timeline'a saydam
 * üst klip olarak girer, render ve taslak kare klasörüne kopyalanır. İzinsiz LaTeX ve render hatası bölümü durdurmaz.
 */

const shot = (id: string, startMs: number, endMs: number, vector: object): PlannedShotState =>
  ({ id, sceneId: "s1", kind: "motion_graphic", startMs, endMs, description: "", imagePrompt: "", motionPrompt: "", camera: "static", vector: vshot(vector) }) as unknown as PlannedShotState;

const SHOTS = [
  shot("s1-sh1", 0, 4000, { math: { steps: ["E = mc^2", "\\input{gizli}"] } }),
  shot("s1-sh2", 4000, 7000, { math: { graph: { points: [[1, 2], [2, 4]] } } }),
  shot("s1-sh3", 7000, 9000, {}),
];

const ready = (extra: object = {}) =>
  makeState(
    { motionMode: "vector", qa: false },
    { style: STYLE, script: SCRIPT, voice: { s1: voiceOf("s1"), s2: voiceOf("s2") }, shots: SHOTS, keyframes: {}, vectorProps: {}, ...extra },
  );

beforeEach(() => {
  resetFakes();
  board.render.mockReset();
  board.render.mockImplementation(async (spec: { graph?: object }) => {
    if (spec.graph) throw new Error("LaTeX patladı");
    return new Uint8Array([7, 7, 7]);
  });
});

describe("Manim tahtaları", () => {
  it("formül tahtası üretilir ve timeline'a girer; izinsiz adım atılır, hata çekimi tahtasız bırakır", async () => {
    const h = harness();
    for (const v of [voiceOf("s1"), voiceOf("s2")]) h.store.map.set(v.key, new Uint8Array([9]));
    const id = await h.seed(ready());
    const state = await h.pipeline.run(id, { only: "timeline" });
    // Yalnız güvenli adım Manim'e gider; süre çekimden.
    expect(board.render).toHaveBeenCalledTimes(2);
    expect(board.render.mock.calls[0]!.slice(0, 2)).toEqual([{ steps: ["E = mc^2"] }, 4]);
    const key = state.mathBoards!["s1-sh1"]!;
    expect(key).toMatch(/^library\/math\/[0-9a-f]{32}\.webm$/);
    expect(state.mathBoards!["s1-sh2"]).toBeUndefined();
    expect(h.store.map.get(key)).toEqual(new Uint8Array([7, 7, 7]));
    expect(state.timeline!.visuals.map((v) => v.overlay)).toEqual([key, undefined, undefined]);
    expect(h.logs).toContain("  s1-sh1: izin dışı LaTeX adımı atlandı: \\input{gizli}");
    expect(h.logs).toContain("  s1-sh1: Manim tahtası üretildi (4.0 sn)");
    expect(h.logs).toContain("  s1-sh2: Manim tahtası atlandı: LaTeX patladı");

    // Aynı tarif yeniden üretilmez; render klasörüne tahta da iner.
    board.render.mockClear();
    const again = await h.pipeline.run(id, { only: "timeline" });
    expect(again.mathBoards!["s1-sh1"]).toBe(key);
    expect(h.logs).toContain("  s1-sh1: Manim tahtası kütüphaneden");
    expect(board.render).toHaveBeenCalledTimes(1);
    await h.pipeline.run(id, { only: "render" });
    expect(readFileSync(join(h.workDir, id, "public", ...key.split("/")))).toEqual(Buffer.from([7, 7, 7]));
    expect(render.episode.mock.calls.at(-1)![0].timeline.visuals[0].overlay).toBe(key);
  });

  it("taslak kareleri tahtayı render klasöründe yoksa yazar, varsa dokunmaz", async () => {
    const h = harness();
    for (const v of [voiceOf("s1"), voiceOf("s2")]) h.store.map.set(v.key, new Uint8Array([9]));
    const key = "library/math/aaaa.webm";
    h.store.map.set(key, new Uint8Array([1, 2]));
    const id = await h.seed(ready({ mathBoards: { "s1-sh1": key } }));
    await h.pipeline.run(id, { only: "keyframes" });
    const file = join(h.workDir, id, "draft", "public", "library", "math", "aaaa.webm");
    expect(readFileSync(file)).toEqual(Buffer.from([1, 2]));
    expect(render.stills.mock.calls.at(-1)![0].timeline.visuals[0].overlay).toBe(key);
    // İkinci önizlemede dosya zaten var: depodan yeniden okunmaz.
    h.store.map.delete(key);
    await h.pipeline.run(id, { only: "keyframes" });
    expect(existsSync(file)).toBe(true);
    expect(h.logs.some((l) => l.includes("önizleme kareleri çıkarılamadı"))).toBe(false);
  });

  it("çekimsiz bölümde tahta aranmaz, timeline eksik veri hatası verir", async () => {
    const h = harness();
    const id = await h.seed(ready({ shots: undefined }));
    await expect(h.pipeline.run(id, { only: "timeline" })).rejects.toThrow();
    expect(board.render).not.toHaveBeenCalled();
  });
});
