import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// rename sahte: Windows'taki geçici kilit (EPERM/EBUSY) hatalarını taklit edebilmek için.
const renameFail = vi.hoisted(() => ({ errors: [] as (Error & { code?: string })[] }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    rename: async (from: string, to: string) => {
      const e = renameFail.errors.shift();
      if (e) throw e;
      return real.rename(from, to);
    },
  };
});

const { createStoreFromEnv, deletePrefix, FsAssetStore, getJson, putJson, S3AssetStore } = await import("../src/index.ts");

const errno = (code?: string) => Object.assign(new Error(code ?? "bilinmeyen"), code ? { code } : {});

describe("FsAssetStore", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ys-store-"));
    renameFail.errors = [];
  });
  afterEach(async () => {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });

  it("JSON yazar/okur; olmayan anahtar null, liste öneke göre süzülür ve .tmp dosyalarını atlar", async () => {
    const store = new FsAssetStore(root);
    const url = await putJson(store, "ep/a/state.json", { n: 1 });
    expect(url).toBe(`file://${join(root, "ep", "a", "state.json").replaceAll("\\", "/")}`);
    expect(await getJson(store, "ep/a/state.json")).toEqual({ n: 1 });
    expect(await getJson(store, "ep/yok.json")).toBeNull();
    await store.put("other/b.bin", new Uint8Array([1, 2]));
    await writeFile(join(root, "ep", "a", "yarim.tmp"), "x");
    expect(await store.list("ep/")).toEqual(["ep/a/state.json"]);
    expect((await store.list("")).sort()).toEqual(["ep/a/state.json", "other/b.bin"]);
  });

  it("kökün dışına çıkan anahtarı reddeder (kardeş klasör dahil)", async () => {
    const store = new FsAssetStore(join(root, "assets"));
    await expect(store.get("../assets-x/a")).rejects.toThrow("Geçersiz anahtar");
    await expect(store.put("../../a", new Uint8Array())).rejects.toThrow("Geçersiz anahtar");
  });

  it("kök yoksa liste boş; ENOENT dışındaki okuma hataları yükselir", async () => {
    expect(await new FsAssetStore(join(root, "yok")).list("")).toEqual([]);
    const store = new FsAssetStore(root);
    await store.put("dir/a.json", new Uint8Array([1]));
    await expect(store.get("dir")).rejects.toMatchObject({ code: expect.stringMatching(/EISDIR|EPERM|EACCES/) });
    await writeFile(join(root, "dosya"), "x");
    await expect(new FsAssetStore(join(root, "dosya")).list("")).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("geçici kilitte yeniden dener ve sonunda yazar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    renameFail.errors = [errno("EPERM"), errno("EBUSY"), errno("EACCES")];
    const store = new FsAssetStore(root);
    let done = false;
    const p = store.put("k.bin", new Uint8Array([7])).finally(() => (done = true));
    while (!done) {
      await vi.advanceTimersByTimeAsync(2000);
      await new Promise((r) => setImmediate(r));
    }
    await p;
    expect([...((await store.get("k.bin")) ?? [])]).toEqual([7]);
    expect(renameFail.errors).toEqual([]);
  });

  it("kalıcı hata ya da tükenen denemede geçici dosyayı siler ve hatayı iletir", async () => {
    const store = new FsAssetStore(root);
    renameFail.errors = [errno()];
    await expect(store.put("a.bin", new Uint8Array([1]))).rejects.toThrow("bilinmeyen");
    renameFail.errors = [errno("EXDEV")];
    await expect(store.put("a.bin", new Uint8Array([1]))).rejects.toMatchObject({ code: "EXDEV" });

    vi.useFakeTimers({ toFake: ["setTimeout"] });
    renameFail.errors = Array.from({ length: 9 }, () => errno("EBUSY"));
    let done = false;
    const p = store.put("b.bin", new Uint8Array([1])).catch((e: unknown) => e).finally(() => (done = true));
    while (!done) {
      await vi.advanceTimersByTimeAsync(2000);
      await new Promise((r) => setImmediate(r));
    }
    expect(await p).toMatchObject({ code: "EBUSY" });
    expect(renameFail.errors).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  it("liste önekin klasöründen başlar; olmayan klasör boş, kökün dışı reddedilir", async () => {
    const store = new FsAssetStore(root);
    await store.put("ep/a/state.json", new Uint8Array([1]));
    await store.put("ep/a/kare/1.jpg", new Uint8Array([1]));
    await store.put("ep/ab/state.json", new Uint8Array([1]));
    expect((await store.list("ep/a/")).sort()).toEqual(["ep/a/kare/1.jpg", "ep/a/state.json"]);
    expect((await store.list("ep/a")).sort()).toEqual(["ep/a/kare/1.jpg", "ep/a/state.json", "ep/ab/state.json"]);
    expect(await store.list("ep/a/st")).toEqual(["ep/a/state.json"]);
    expect(await store.list("yok/b/")).toEqual([]);
    expect((await store.list("/")).length).toBe(0);
    expect((await store.list("//")).length).toBe(0);
    await expect(store.list("../x/")).rejects.toThrow("Geçersiz anahtar");
  });

  it("siler, boşalan klasörleri de kaldırır, dolu klasörde durur; olmayan anahtar sorun değil; önekle toplu siler", async () => {
    const store = new FsAssetStore(root);
    await store.put("ep/a/kare/1.jpg", new Uint8Array([1]));
    await store.put("ep/a/state.json", new Uint8Array([1]));
    await store.put("ep/b/state.json", new Uint8Array([1]));
    await store.delete("ep/a/kare/1.jpg");
    expect(await readdir(join(root, "ep", "a"))).toEqual(["state.json"]);
    await store.delete("ep/a/yok.json");
    expect(await deletePrefix(store, "ep/a/")).toBe(1);
    expect(await readdir(join(root, "ep"))).toEqual(["b"]);
    expect(await deletePrefix(store, "ep/b/")).toBe(1);
    expect(await readdir(root)).toEqual([]);
    expect(await deletePrefix(store, "ep/c/")).toBe(0);
    await expect(store.delete("../x")).rejects.toThrow("Geçersiz anahtar");
  });

  it("atomically compares absent, empty and changed bytes across store instances", async () => {
    const a = new FsAssetStore(root);
    const b = new FsAssetStore(root);
    const empty = new Uint8Array();
    const one = new Uint8Array([1]);
    expect(await a.compareAndSwap("locks/a", null, empty)).toBe(true);
    expect(await b.compareAndSwap("locks/a", null, one)).toBe(false);
    expect(await b.compareAndSwap("locks/a", empty, one)).toBe(true);
    expect(await a.compareAndSwap("locks/a", empty, empty)).toBe(false);
    expect(await a.get("locks/a")).toEqual(one);
    expect(await a.compareAndSwap("missing", one, empty)).toBe(false);
    expect(await a.list("")).toEqual(["locks/a"]);
    for (const key of [".store-cas.sqlite", ".store-cas.sqlite-journal", "./.STORE-CAS.SQLITE", "nested/../.store-cas.sqlite", "../outside"]) {
      await expect(a.compareAndSwap(key, null, one)).rejects.toThrow("Geçersiz anahtar");
    }
  });

  it("propagates filesystem failures and releases its transaction for the next caller", async () => {
    const a = new FsAssetStore(root);
    await a.put("folder/keep", new Uint8Array([1]));
    await expect(a.compareAndSwap("folder", null, new Uint8Array())).rejects.toThrow();
    expect(await a.compareAndSwap("next", null, new Uint8Array([2]))).toBe(true);
  });
});

describe("S3AssetStore", () => {
  const opts = { region: "auto", bucket: "kova", accessKeyId: "a", secretAccessKey: "s", endpoint: "http://127.0.0.1:1" };
  afterEach(() => vi.restoreAllMocks());

  it("uses If-None-Match for absent keys and If-Match for the exact observed ETag", async () => {
    const send = vi.spyOn(S3Client.prototype, "send");
    const s = new S3AssetStore(opts);
    const bytes = new Uint8Array([1]);
    send.mockRejectedValueOnce(new NoSuchKey({ message: "missing", $metadata: {} })).mockResolvedValueOnce({} as never);
    expect(await s.compareAndSwap("lock", null, bytes, "application/json")).toBe(true);
    expect((send.mock.calls[1]![0] as PutObjectCommand).input).toMatchObject({ IfNoneMatch: "*", ContentType: "application/json", Body: bytes });
    expect((send.mock.calls[1]![0] as PutObjectCommand).input.IfMatch).toBeUndefined();
    send.mockResolvedValueOnce({ ETag: '"version-1"', Body: { transformToByteArray: async () => bytes } } as never).mockResolvedValueOnce({} as never);
    expect(await s.compareAndSwap("lock", bytes, new Uint8Array([2]), "application/json")).toBe(true);
    expect((send.mock.calls[3]![0] as PutObjectCommand).input).toMatchObject({ IfMatch: '"version-1"' });
    expect((send.mock.calls[3]![0] as PutObjectCommand).input.IfNoneMatch).toBeUndefined();
  });

  it("does not write when the expected bytes differ and propagates unknown reads", async () => {
    const send = vi.spyOn(S3Client.prototype, "send");
    const s = new S3AssetStore(opts);
    send.mockResolvedValueOnce({ ETag: "v", Body: { transformToByteArray: async () => new Uint8Array([1]) } } as never);
    expect(await s.compareAndSwap("lock", null, new Uint8Array([2]), "application/json")).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRejectedValueOnce(new Error("access denied"));
    await expect(s.compareAndSwap("lock", null, new Uint8Array(), "application/json")).rejects.toThrow("access denied");
    for (const response of [{}, { ETag: "v" }, { Body: {} }]) {
      send.mockResolvedValueOnce(response as never);
      await expect(s.compareAndSwap("lock", null, new Uint8Array(), "application/json")).rejects.toThrow("ETag ve gövde gerekli");
    }
  });

  it("returns contention for conditional conflicts but never falls back to an unconditional write", async () => {
    const send = vi.spyOn(S3Client.prototype, "send");
    const s = new S3AssetStore(opts);
    for (const status of [409, 412, 404, 500, undefined]) {
      const bytes = new Uint8Array([1]);
      send.mockResolvedValueOnce({ ETag: "v", Body: { transformToByteArray: async () => bytes } } as never)
        .mockRejectedValueOnce(Object.assign(new Error("write failed"), { $metadata: { httpStatusCode: status } }));
      const pending = s.compareAndSwap("lock", bytes, new Uint8Array(), "application/json");
      if (status === 409 || status === 412 || status === 404) expect(await pending).toBe(false);
      else await expect(pending).rejects.toThrow("write failed");
    }
    send.mockRejectedValueOnce(new NoSuchKey({ message: "missing", $metadata: {} }))
      .mockRejectedValueOnce(Object.assign(new Error("bucket missing"), { $metadata: { httpStatusCode: 404 } }));
    await expect(s.compareAndSwap("lock", null, new Uint8Array(), "application/json")).rejects.toThrow("bucket missing");
    expect(send).toHaveBeenCalledTimes(12);
  });

  it("only one writer wins after two S3 readers observe the same ETag", async () => {
    const before = new Uint8Array([0]);
    let version = "old";
    let reads = 0;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: GetObjectCommand | PutObjectCommand) => {
      if (cmd instanceof GetObjectCommand) {
        const snapshot = version;
        if (++reads === 2) open();
        await gate;
        return { ETag: snapshot, Body: { transformToByteArray: async () => before } };
      }
      if (cmd.input.IfMatch !== version) throw Object.assign(new Error("conflict"), { $metadata: { httpStatusCode: 412 } });
      version = "new";
      return {};
    }) as never);
    const results = await Promise.all([new S3AssetStore(opts), new S3AssetStore(opts)].map((s) => s.compareAndSwap("lock", before, new Uint8Array([1]), "application/json")));
    expect(results.sort()).toEqual([false, true]);
    expect(version).toBe("new");
  });

  it("kova varsa oluşturmaz, yoksa oluşturur", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const store = new S3AssetStore(opts);
    await store.ensureBucket();
    expect(send.mock.calls.map(([c]) => c.constructor)).toEqual([HeadBucketCommand]);
    send.mockReset().mockRejectedValueOnce(new Error("404")).mockResolvedValue({} as never);
    await store.ensureBucket();
    expect(send.mock.calls.map(([c]) => c.constructor)).toEqual([HeadBucketCommand, CreateBucketCommand]);
    expect(send.mock.calls[1]![0].input).toEqual({ Bucket: "kova" });
  });

  it("yazar ve s3:// adresi döner", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const url = await new S3AssetStore(opts).put("ep/a.json", new Uint8Array([1]), "application/json");
    expect(url).toBe("s3://kova/ep/a.json");
    const cmd = send.mock.calls[0]![0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({ Bucket: "kova", Key: "ep/a.json", ContentType: "application/json" });
  });

  it("sayfalı listeyi sonuna kadar okur, anahtarsız nesneyi atlar", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({ Contents: [{ Key: "p/1" }, {}], IsTruncated: true, NextContinuationToken: "t2" } as never)
      .mockResolvedValueOnce({ IsTruncated: false } as never);
    expect(await new S3AssetStore(opts).list("p/")).toEqual(["p/1"]);
    const inputs = send.mock.calls.map(([c]) => (c as ListObjectsV2Command).input);
    expect(inputs).toEqual([
      { Bucket: "kova", Prefix: "p/", ContinuationToken: undefined },
      { Bucket: "kova", Prefix: "p/", ContinuationToken: "t2" },
    ]);
  });

  it("okur; gövdesiz yanıt ve NoSuchKey null, diğer hatalar yükselir", async () => {
    const send = vi.spyOn(S3Client.prototype, "send");
    const store = new S3AssetStore(opts);
    send.mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array([9]) } } as never);
    expect([...((await store.get("a")) ?? [])]).toEqual([9]);
    expect((send.mock.calls[0]![0] as GetObjectCommand).input).toEqual({ Bucket: "kova", Key: "a" });
    send.mockResolvedValueOnce({} as never);
    expect(await store.get("a")).toBeNull();
    send.mockRejectedValueOnce(new NoSuchKey({ message: "yok", $metadata: {} }));
    expect(await store.get("a")).toBeNull();
    send.mockRejectedValueOnce(new Error("ağ"));
    await expect(store.get("a")).rejects.toThrow("ağ");
  });

  it("siler", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    await new S3AssetStore(opts).delete("ep/a.json");
    const cmd = send.mock.calls[0]![0] as DeleteObjectCommand;
    expect(cmd).toBeInstanceOf(DeleteObjectCommand);
    expect(cmd.input).toEqual({ Bucket: "kova", Key: "ep/a.json" });
  });
});

describe("createStoreFromEnv", () => {
  const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;
  it("STORE=s3 eksik değişkeni bildirir, tamamsa S3 deposu kurar; yoksa klasör deposu", async () => {
    expect(() => createStoreFromEnv(env({ STORE: "s3", S3_BUCKET: "b" }))).toThrow("STORE=s3 için S3_ACCESS_KEY_ID gerekli");
    const s3 = createStoreFromEnv(env({ STORE: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "s" }));
    expect(s3).toBeInstanceOf(S3AssetStore);
    expect(await (s3 as InstanceType<typeof S3AssetStore>)["client"].config.region()).toBe("auto");
    const s3r = createStoreFromEnv(env({ STORE: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "s", S3_REGION: "eu" }));
    expect(await (s3r as InstanceType<typeof S3AssetStore>)["client"].config.region()).toBe("eu");
    expect(createStoreFromEnv(env({}), "x")).toBeInstanceOf(FsAssetStore);
    expect(createStoreFromEnv(env({}))).toBeInstanceOf(FsAssetStore);
  });
});
