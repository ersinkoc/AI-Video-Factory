import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { AgentError, type QueryFn } from "@ys/agents";
import { InMemoryLedger } from "@ys/media-gateway";
import { MemStore, harness, makeState } from "./pipeline-harness.ts";
import { RECIPE } from "../../core/test/style-recipe-fixture.ts";
import { analyzeStyleReference, normalizeStyleReference, STYLE_IMAGE_MAX_BYTES } from "../src/style-authoring.ts";
import { lineStyleOf } from "../src/state.ts";
import { listCustomStyles, loadCustomStyle, saveCustomStyle } from "../src/custom-styles.ts";

const encoded = async (format: "png" | "jpeg" | "webp" = "png") => (await sharp({ create: { width: 20, height: 10, channels: 3, background: "#ff0000" } })[format]().toBuffer()).toString("base64");
const fakeQuery = (onCall: () => void) => ((() => { onCall(); return (async function* () { yield { type: "result", subtype: "success", is_error: false, structured_output: RECIPE, total_cost_usd: 0.02, duration_ms: 50 }; })(); }) as unknown as QueryFn);
describe("custom style persistence", () => {
 it("saves immutable recipes, reuses exact saves, rejects missing references and lists only valid records", async () => {
  const store = new MemStore();
  const a = await saveCustomStyle(store, RECIPE);
  expect(await saveCustomStyle(store, RECIPE)).toEqual(a);
  const b = await saveCustomStyle(store, { ...RECIPE, name: "Edited" });
  expect(b.id).not.toBe(a.id);
  expect((await loadCustomStyle(store, a.id))!.recipe.name).toBe("Warm paper");
  expect(await loadCustomStyle(store, "../state")).toBeUndefined();
  expect(await loadCustomStyle(store, "f".repeat(32))).toBeUndefined();
  store.putJsonSync("library/custom-styles/" + "e".repeat(32) + ".json", { ...a, id: "d".repeat(32) });
  store.putText("library/custom-styles/readme.txt", "ignored");
  expect(await listCustomStyles(store)).toHaveLength(2);
  await expect(saveCustomStyle(store, RECIPE, "episodes/x/state.json")).rejects.toThrow();
  await expect(saveCustomStyle(store, RECIPE, "library/style-references/" + "a".repeat(64) + ".jpg")).rejects.toThrow();
  const ref = "library/style-references/" + "a".repeat(64) + ".jpg"; await store.put(ref, await normalizeStyleReference("image/png", await encoded()));
  expect((await saveCustomStyle(store, RECIPE, ref)).referenceKey).toBe(ref);
  const c = { ...a, id: "c".repeat(32), recipe: { ...RECIPE, name: "A first" }, createdAt: b.createdAt };
  store.putJsonSync("library/custom-styles/" + c.id + ".json", c);
  const d = { ...c, id: "b".repeat(32), recipe: { ...RECIPE, name: "Z last" } };
  store.putJsonSync("library/custom-styles/" + d.id + ".json", d);
  expect((await listCustomStyles(store)).filter((s) => s.createdAt === c.createdAt).map((s) => s.recipe.name)).toEqual(expect.arrayContaining(["A first", "Z last"]));
 });
});
describe("reference normalization and analysis", () => {
 it.each(["png", "jpeg", "webp"] as const)("normalizes valid %s into a bounded metadata-free JPEG", async (format) => {
  const result = await normalizeStyleReference("image/" + format, await encoded(format));
  const meta = await sharp(result).metadata();
  expect(meta.format).toBe("jpeg"); expect(meta.width).toBe(20); expect(meta.exif).toBeUndefined();
 });
 it("rejects missing, oversized, malformed, spoofed and undecodable image payloads", async () => {
  for (const [mime, data] of [[undefined, undefined], ["image/png", "?"], ["image/svg+xml", "AAAA"], ["image/png", "A".repeat(Math.ceil(STYLE_IMAGE_MAX_BYTES / 3) * 4 + 4)], ["image/png", "A"], ["image/png", "AAAA"], ["image/jpeg", await encoded("png")]]) {
   await expect(normalizeStyleReference(mime, data)).rejects.toThrow("PNG");
  }
  await expect(normalizeStyleReference("image/png", "AB==")).rejects.toThrow();
  const tooManyPixels = (await sharp({ create: { width: 4100, height: 4100, channels: 3, background: "#000000" } }).png().toBuffer()).toString("base64");
  await expect(normalizeStyleReference("image/png", tooManyPixels)).rejects.toThrow();
 });
 it("coalesces parallel calls, caches completed analysis, records one actual charge and separates models", async () => {
  const store = new MemStore(), ledger = new InMemoryLedger();
  const bytes = await normalizeStyleReference("image/png", await encoded());
  let calls = 0; const deps = { queryFn: fakeQuery(() => calls++) };
  const [a,b] = await Promise.all([analyzeStyleReference(store, ledger, bytes, deps), analyzeStyleReference(store, ledger, bytes, deps)]);
  expect(a.recipe).toEqual(RECIPE); expect(b).toEqual(a); expect(calls).toBe(1);
  const again = await analyzeStyleReference(store, ledger, bytes, deps);
  expect(again.cached).toBe(true); expect(calls).toBe(1);
  expect(ledger.entries).toHaveLength(1); expect(ledger.entries[0]).toMatchObject({ capability: "llm", estimateMicros: 20000, stage: "style-reference" });
  await analyzeStyleReference(store, ledger, bytes, { ...deps, models: { "style-analyst": "claude-haiku-5-5" } });
  expect(calls).toBe(2);
  const saved = await saveCustomStyle(store, a.recipe, a.referenceKey);
  expect((await loadCustomStyle(store, saved.id))!.recipe).toEqual(RECIPE);
 });
 it("records billed failures, clears the in-flight slot, and retries rather than caching errors", async () => {
  const store = new MemStore(), ledger = new InMemoryLedger();
  const queryFn = (() => (async function* () { yield { type: "result", subtype: "error_max_turns", errors: ["failed"], total_cost_usd: 0.03, duration_ms: 1 }; })()) as unknown as QueryFn;
  await expect(analyzeStyleReference(store, ledger, new Uint8Array([1]), { queryFn })).rejects.toThrow(AgentError);
  expect(ledger.entries[0]!.estimateMicros).toBe(30000);
  await analyzeStyleReference(store, ledger, new Uint8Array([1]), { queryFn: fakeQuery(() => {}) });
  expect(ledger.entries).toHaveLength(2);
  const throwing = (() => { throw "not an Error"; }) as unknown as QueryFn;
  await expect(analyzeStyleReference(store, ledger, new Uint8Array([2]), { queryFn: throwing })).rejects.toBe("not an Error");
  expect(ledger.entries.at(-1)).toMatchObject({ error: "not an Error", estimateMicros: 0 });
 });
});

it("production style stage uses the saved recipe without another art-director call", async () => {
 const h = harness(); const saved = await saveCustomStyle(h.store, RECIPE);
 const id = await h.seed(makeState({ customStyleId: saved.id, stylePack: "custom" }));
 const state = await h.pipeline.run(id, { only: "style" });
 expect(state.style).toMatchObject({ artStyle: RECIPE.artStyle, motionRules: RECIPE.motionRules, craftPreset: "paper-cutout" });
 expect(lineStyleOf(state)).toBe("flat");
 expect(lineStyleOf({ ...state, input: { ...state.input, lineStyle: "ink" } })).toBe("ink");
 const missing = await h.seed(makeState({ customStyleId: "f".repeat(32) }));
 await expect(h.pipeline.run(missing, { only: "style" })).rejects.toThrow("stil bulunamadı");
});
