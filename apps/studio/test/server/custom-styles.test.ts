import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECIPE } from "../../../../packages/core/test/style-recipe-fixture.ts";
import { MemStore } from "../../../../packages/pipeline/test/pipeline-harness.ts";
import { InMemoryLedger } from "@ys/media-gateway";

const deps = vi.hoisted(() => ({ saved: vi.fn(), start: vi.fn(), analyst: vi.fn(), store: undefined as unknown, ledger: undefined as unknown }));
vi.mock("../../src/lib/server.ts", () => ({
 store: () => deps.store, ledger: () => deps.ledger, repo: () => ({ save: deps.saved }), startJob: deps.start,
}));
vi.mock("@ys/pipeline/style-authoring", async (orig) => {
 const actual = await orig<typeof import("@ys/pipeline/style-authoring")>();
 return { ...actual, analyzeStyleReference: (store: Parameters<typeof actual.analyzeStyleReference>[0], ledger: Parameters<typeof actual.analyzeStyleReference>[1], bytes: Uint8Array) => actual.analyzeStyleReference(store, ledger, bytes, { queryFn: (() => {
   const result = deps.analyst();
   return (async function* () { const out = await result; yield { type: "result", subtype: "success", is_error: false, structured_output: out.data, total_cost_usd: out.costUsd, duration_ms: 1 }; })();
 }) as never }) };
});
const custom = await import("../../src/app/api/styles/custom/route.ts");
const analyze = await import("../../src/app/api/styles/analyze/route.ts");
const measure = await import("../../src/app/api/styles/measure/route.ts");
const episodes = await import("../../src/app/api/episodes/route.ts");
const { readStyleJson } = await import("../../src/lib/style-request.ts");
const post = (body: unknown) => new Request("http://localhost/api/styles/custom", { method: "POST", headers: { "content-type": "application/json", "accept-language": "en" }, body: JSON.stringify(body) });
const png = "iVBORw0KGgoAAAANSUhEUgAAABQAAAAKCAIAAAA7N+mxAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVQokWP4z8BANmIY1cwwGmAM+IMAADFExzm9/RmvAAAAAElFTkSuQmCC";

beforeEach(() => {
 deps.store = new MemStore(); deps.ledger = new InMemoryLedger(); deps.saved.mockReset(); deps.start.mockReset();
 deps.analyst.mockReset().mockResolvedValue({ name: "style-analyst", model: "claude-test", costUsd: 0.01, durationMs: 1, data: RECIPE });
});

describe("reference style HTTP workflow", () => {
 it("measures freely, keeps recipes explicit and recomputes saved metadata from stored pixels", async () => {
   const response = await measure.POST(post({ mimeType: "image/png", base64: png }));
   expect(response.status).toBe(200);
   const measured = await response.json();
   expect(measured.profile.palette[0].share).toBe(1);
   expect(measured.recipe).toBeUndefined(); expect(deps.analyst).not.toHaveBeenCalled();
   expect((deps.ledger as InMemoryLedger).entries).toHaveLength(0);
   const saved = await (await custom.POST(post({ recipe: RECIPE, referenceKey: measured.referenceKey, referenceProfile: { fake: true } }))).json();
   expect(saved.recipe.palette).toEqual(RECIPE.palette); expect(saved.referenceProfile).toEqual(measured.profile);
   expect((await measure.POST(post({ mimeType: "image/png", base64: png })).then((r) => r.json())).cached).toBe(true);
   expect((await measure.POST(post({ mimeType: "image/png", base64: "AAAA" }))).status).toBe(400);
 });
 it("analyzes an image, saves an editable recipe, lists it, and binds its ID to a new episode", async () => {
   const response = await analyze.POST(post({ mimeType: "image/png", base64: png }));
   expect(response.status).toBe(200);
   const draft = await response.json();
   expect(draft.recipe).toEqual(RECIPE); expect(deps.analyst).toHaveBeenCalledTimes(1);
   expect((await analyze.POST(post({ mimeType: "image/png", base64: png }))).status).toBe(200);
   expect(deps.analyst).toHaveBeenCalledTimes(1);
   const savedResponse = await custom.POST(post({ ...draft, recipe: { ...draft.recipe, name: "My edited style" } }));
   expect(savedResponse.status).toBe(200); const saved = await savedResponse.json();
   expect(await (await custom.GET()).json()).toEqual([saved]);
   const created = await episodes.POST(post({ topic: "How messages travel", customStyleId: saved.id, stylePack: "auto" }));
   expect(created.status).toBe(200);
   expect(deps.saved.mock.calls[0]![0].input).toMatchObject({ customStyleId: saved.id, stylePack: "custom" });
   expect(deps.start).toHaveBeenCalledTimes(1);
   const list = (deps.ledger as InMemoryLedger).entries;
   expect(list).toHaveLength(1); expect(list[0]!.estimateMicros).toBe(10000);
 });
 it("rejects missing styles and bank/style conflicts before creating or starting anything", async () => {
   expect((await episodes.POST(post({ topic: "t", customStyleId: "../x" }))).status).toBe(400);
   expect((await episodes.POST(post({ topic: "t", customStyleId: 2 }))).status).toBe(400);
   const saved = await (await custom.POST(post({ recipe: RECIPE }))).json();
   expect((await episodes.POST(post({ topic: "t", customStyleId: saved.id, presenter: "someone" }))).status).toBe(400);
   expect((await episodes.POST(post({ topic: "t", customStyleId: saved.id, bankCast: ["someone"] }))).status).toBe(400);
   expect(deps.saved).not.toHaveBeenCalled(); expect(deps.start).not.toHaveBeenCalled();
 });
 it("rejects malformed and oversized requests, invalid recipes, and missing reference bytes", async () => {
   for (const body of [null, {}, { recipe: { ...RECIPE, palette: ["red"] } }, { recipe: RECIPE, referenceKey: 3 }, { recipe: RECIPE, referenceKey: "../x" }]) {
     expect((await custom.POST(post(body))).status).toBe(400);
   }
   expect((await custom.POST(post({ recipe: RECIPE, referenceKey: "library/style-references/" + "a".repeat(64) + ".jpg" }))).status).toBe(400);
   expect((await custom.POST(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
   expect((await analyze.POST(post(null))).status).toBe(400);
   expect((await analyze.POST(post({ mimeType: "image/svg+xml", base64: "AAAA" }))).status).toBe(400);
   await expect(readStyleJson(new Request("http://x", { method: "POST" }))).rejects.toThrow();
   await expect(readStyleJson(post({ big: "a".repeat(100) }), 20)).rejects.toThrow();
   expect(deps.analyst).not.toHaveBeenCalled();
 });
 it("reports model errors without silently saving a style", async () => {
   deps.analyst.mockRejectedValueOnce(new Error("model unavailable"));
   const response = await analyze.POST(post({ mimeType: "image/png", base64: png }));
   expect(response.status).toBe(400); expect((await response.json()).error).toBe("model unavailable");
   expect(await (await custom.GET()).json()).toEqual([]);
 });
});
