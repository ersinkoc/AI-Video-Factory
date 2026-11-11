import { beforeEach, expect, it, vi } from "vitest";
import { MemStore } from "../../../../packages/pipeline/test/pipeline-harness.ts";
import { putJson } from "@ys/storage";
const deps = vi.hoisted(() => ({ state: {} as any, store: undefined as unknown }));
vi.mock("../../src/lib/server.ts", () => ({ store: () => deps.store, repo: () => ({ load: async () => deps.state }) }));
const route = await import("../../src/app/api/episodes/[id]/style-comparison/route.ts");
const request = new Request("http://localhost/api/episodes/e1/style-comparison", { headers: { "accept-language": "en" } });
const get = (id = "e1") => route.GET(request, { params: Promise.resolve({ id }) });
beforeEach(() => { deps.store = new MemStore(); deps.state = { render: {} }; });
it("downloads only the current episode's immutable comparison report", async () => {
  const key = "episodes/e1/style-comparisons/report-1.json";
  await putJson(deps.store as MemStore, key, { measured: true });
  deps.state.render.styleComparison = { reportKey: key };
  const response = await get();
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ measured: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-disposition")).toContain("e1.style-comparison.json");
  for (const reportKey of ["episodes/other/style-comparisons/report-1.json", "episodes/e1/style-comparisons/../state.json", "episodes/e1/style-comparisons/missing.json"]) {
    deps.state.render.styleComparison.reportKey = reportKey; expect((await get()).status).toBe(404);
  }
  expect((await get("../e1")).status).toBe(400);
});
