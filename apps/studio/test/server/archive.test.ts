import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ search: vi.fn(), image: vi.fn(), get: vi.fn(), storage: {} }));
vi.mock("@ys/pipeline/archive", () => ({ searchArchives: deps.search, importArchiveImage: deps.image }));
vi.mock("../../src/lib/server.ts", () => ({ store: () => ({ ...deps.storage, get: deps.get }) }));
const search = await import("../../src/app/api/archive/route.ts");
const image = await import("../../src/app/api/archive/[id]/image/route.ts");
const request = (suffix = "") => new Request(`http://localhost/api/archive${suffix}`, { headers: { "accept-language": "en" } });
beforeEach(() => { vi.resetAllMocks(); });
describe("archive HTTP boundary", () => {
  it("passes the query to search and returns uncached JSON", async () => {
    deps.search.mockResolvedValue({ items: [], errors: [] });
    const result = await search.GET(request("?q=Apollo%2011"));
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(deps.search).toHaveBeenCalledWith("Apollo 11", { store: expect.any(Object) });
    expect(await result.json()).toEqual({ items: [], errors: [] });
    await search.GET(request()); expect(deps.search).toHaveBeenLastCalledWith("", expect.any(Object));
    deps.search.mockRejectedValue(new Error("Provider unavailable"));
    expect(await (await search.GET(request("?q=test"))).json()).toEqual({ error: "Provider unavailable" });
  });
  it("serves only the imported asset and reports disappearance or import failure", async () => {
    const ctx = { params: Promise.resolve({ id: "candidate" }) };
    deps.image.mockResolvedValue({ key: "image.jpg" }); deps.get.mockResolvedValue(new Uint8Array([1, 2]));
    const result = await image.GET(request(), ctx);
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
    deps.get.mockResolvedValue(null); expect((await image.GET(request(), ctx)).status).toBe(404);
    deps.image.mockRejectedValue(new Error("Invalid archive item"));
    expect(await (await image.GET(request(), ctx)).json()).toEqual({ error: "Invalid archive item" });
  });
});
