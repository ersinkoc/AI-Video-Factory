import { mkdtempSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FsAssetStore, putJson, type AssetStore } from "@ys/storage";
import { acquireLock, deadLock, liveLock } from "../src/light.ts";

const store = (): AssetStore => new FsAssetStore(mkdtempSync(join(tmpdir(), "ys-lock-")));
const key = "episodes/e1/run.lock.json";

afterEach(() => vi.restoreAllMocks());

describe("çalışma kilidi", () => {
  it("allows exactly one contender after both have read the same empty lock", async () => {
    const s = store();
    const read = s.get.bind(s);
    let reads = 0;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    vi.spyOn(s, "get").mockImplementation(async (k) => {
      const bytes = await read(k);
      if (++reads <= 2) {
        if (reads === 2) open();
        await gate;
      }
      return bytes;
    });
    const results = await Promise.allSettled([acquireLock(s, "e1"), acquireLock(s, "e1")]);
    const winners = results.filter((r) => r.status === "fulfilled");
    try {
      expect(winners).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    } finally {
      for (const r of winners) await r.value();
    }
    // Kontrol: başka bölüm aynı anda çalışabilir, bırakılan bölüm tekrar alınabilir.
    const releases = await Promise.all([acquireLock(s, "e1"), acquireLock(s, "e2")]);
    for (const release of releases) await release();
  });

  it("a delayed release cannot clear a newer generation owned by the same process", async () => {
    const s = store();
    const first = await acquireLock(s, "e1");
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const stale = gate.then(first);
    await first();
    const second = await acquireLock(s, "e1");
    const owner = await liveLock(s, "e1");
    open();
    await stale;
    expect(await liveLock(s, "e1")).toEqual(owner);
    await second();
    expect(await liveLock(s, "e1")).toBeUndefined();
  });

  it("rejects re-entry and propagates unknown reads instead of treating them as absence", async () => {
    const s = store();
    const release = await acquireLock(s, "e1");
    await expect(acquireLock(s, "e1")).rejects.toThrow("zaten çalışıyor");
    await release();
    vi.spyOn(s, "get").mockRejectedValue(Object.assign(new Error("disk unavailable"), { code: "EIO" }));
    await expect(acquireLock(s, "e1")).rejects.toThrow("disk unavailable");
  });

  it("fails closed on malformed ownership, unsupported storage and repeated contention", async () => {
    const s = store();
    for (const value of ["{broken", "{}", "0", JSON.stringify({ pid: -1, host: "h", startedAt: "t" }), JSON.stringify({ pid: 1, host: "", startedAt: "t" }), JSON.stringify({ pid: 1, host: "h" })]) {
      await s.put(key, new TextEncoder().encode(value), "application/json");
      await expect(acquireLock(s, "e1")).rejects.toThrow("kilidi okunamıyor veya bozuk");
    }
    await putJson(s, key, null);
    const cas = vi.spyOn(s, "compareAndSwap").mockResolvedValue(false);
    await expect(acquireLock(s, "e1")).rejects.toThrow("eşzamanlı değişti");
    expect(cas).toHaveBeenCalledTimes(8);
    s.compareAndSwap = undefined;
    await expect(acquireLock(s, "e1")).rejects.toThrow("atomik kilit");
  });

  it("only a proven missing process is stale; permission and unknown errors do not grant ownership", async () => {
    const s = store();
    await putJson(s, key, { pid: 12345, host: hostname(), startedAt: "t" });
    const kill = vi.spyOn(process, "kill");
    kill.mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EPERM" }); });
    expect(await liveLock(s, "e1")).toMatchObject({ pid: 12345 });
    await expect(acquireLock(s, "e1")).rejects.toThrow("zaten çalışıyor");
    kill.mockImplementation(() => { throw Object.assign(new Error("unknown"), { code: "EIO" }); });
    await expect(acquireLock(s, "e1")).rejects.toThrow("unknown");
    kill.mockImplementation(() => { throw Object.assign(new Error("gone"), { code: "ESRCH" }); });
    const release = await acquireLock(s, "e1");
    await release();
  });

  it("canlı başka süreç tutuyorsa ikinci çalıştırma reddedilir; bırakınca serbest", async () => {
    const s = store();
    // Bu testin ana süreci (vitest işçisi değil) canlı bir başka süreçtir.
    await putJson(s, key, { pid: process.ppid, host: hostname(), startedAt: "t" });
    await expect(acquireLock(s, "e1")).rejects.toThrow("zaten çalışıyor");
    await putJson(s, key, null);
    const release = await acquireLock(s, "e1");
    expect((await liveLock(s, "e1"))?.pid).toBe(process.pid);
    await release();
    expect(await liveLock(s, "e1")).toBeUndefined();
  });

  it("sahibi ölmüş kilit bayattır", async () => {
    const s = store();
    await putJson(s, key, { pid: 2 ** 22 + 12345, host: hostname(), startedAt: "t" });
    expect(await liveLock(s, "e1")).toBeUndefined();
    expect(await deadLock(s, "e1")).toBe(true);
    await (await acquireLock(s, "e1"))();
    // Bırakılmış (boş) ya da canlı kilit "ölü" değildir.
    expect(await deadLock(s, "e1")).toBe(false);
    await putJson(s, key, { pid: process.ppid, host: hostname(), startedAt: "t" });
    expect(await deadLock(s, "e1")).toBe(false);
  });
});
