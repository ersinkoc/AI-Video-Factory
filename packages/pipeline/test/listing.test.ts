import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { FsAssetStore } from "@ys/storage";
import { EpisodeRepo, type EpisodeState } from "../src/light.ts";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("bounds a 12-episode listing to four reads and drops optional timelines before retaining the results", async () => {
  const root = mkdtempSync(join(tmpdir(), "ys-list-proof-"));
  roots.push(root);
  const store = new FsAssetStore(root);
  const repo = new EpisodeRepo(store);
  const timeline = { vectorAssets: { map: { svg: "x".repeat(256_000) } } } as unknown as EpisodeState["timeline"];
  for (let i = 0; i < 12; i++) {
    await repo.save({ id: `e${i}`, createdAt: `2026-11-${String(i + 1).padStart(2, "0")}T00:00:00Z`, input: { topic: `topic ${i}` }, done: {}, agentCostUsd: 0, timeline } as EpisodeState);
  }
  // Kontrol: varsayılan tam listeleme ve depodaki çizimler korunur.
  expect((await repo.load("e0")).timeline).toEqual(timeline);
  expect((await repo.list())[0]!.timeline).toEqual(timeline);
  const original = store.get.bind(store);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const fourStarted = new Promise<void>((resolve) => { started = resolve; });
  let active = 0;
  let peak = 0;
  vi.spyOn(store, "get").mockImplementation(async (key) => {
    peak = Math.max(peak, ++active);
    if (active === 4) started();
    await gate;
    try { return await original(key); } finally { active--; }
  });
  const pending = repo.list({ includeTimeline: false });
  await fourStarted;
  release();
  const states = await pending;
  expect(peak).toBeLessThanOrEqual(4);
  expect(states).toHaveLength(12);
  expect(states[0]!.id).toBe("e11");
  expect(states.every((s) => !("timeline" in s))).toBe(true);
  expect(JSON.stringify(states).length).toBeLessThan(10_000);
  // Okunamayan kayıt hafif listeyi de düşürmez.
  await store.put("episodes/broken/state.json", new TextEncoder().encode("{broken"));
  expect(await repo.list({ includeTimeline: false })).toHaveLength(12);
  expect((await repo.load("e0")).timeline).toEqual(timeline);
});
