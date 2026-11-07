import { mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
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
import { CAS_DB, fsCompareAndSwap, sameBytes } from "./atomic.ts";

/** Üretilen tüm varlıkların yazıldığı depo. Anahtarlar her zaman "/" ile ayrılır. */
export interface AssetStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  get(key: string): Promise<Uint8Array | null>;
  /** Önekle başlayan tüm anahtarlar. */
  list(prefix: string): Promise<string[]>;
  /** Anahtarı siler; yoksa bir şey yapmaz. */
  delete(key: string): Promise<void>;
  /** Atomik koşullu yazma. Beklenen null: anahtar bulunmamalı. Desteklenmiyorsa kilit alınamaz. */
  compareAndSwap?(key: string, expected: Uint8Array | null, bytes: Uint8Array, contentType: string): Promise<boolean>;
}

/** Önekle başlayan tüm anahtarları siler (bir bölümün klasörü gibi); silinen sayısını döner. */
export async function deletePrefix(store: AssetStore, prefix: string): Promise<number> {
  const keys = await store.list(prefix);
  for (const key of keys) await store.delete(key);
  return keys.length;
}

export async function putJson(store: AssetStore, key: string, value: unknown): Promise<string> {
  return store.put(key, new TextEncoder().encode(JSON.stringify(value)), "application/json");
}

export async function getJson<T>(store: AssetStore, key: string): Promise<T | null> {
  const bytes = await store.get(key);
  return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
}

/** Docker'sız geliştirme için yerel klasör deposu. */
export class FsAssetStore implements AssetStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    const p = resolve(join(this.root, ...key.split("/")));
    const internal = join(this.root, CAS_DB).toLowerCase();
    const normalized = p.toLowerCase();
    if (normalized === internal || normalized.startsWith(`${internal}-`)) throw new Error(`Geçersiz anahtar: ${key}`);
    // Ayraçla karşılaştırılır: ".data/assets-x" gibi kardeş klasör de "root ile başlıyor" sayılmasın.
    if (!p.startsWith(this.root + sep)) throw new Error(`Geçersiz anahtar: ${key}`);
    return p;
  }

  async put(key: string, bytes: Uint8Array): Promise<string> {
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    // Geçici dosyaya yazıp yeniden adlandırma: okuyan (Stüdyo yoklaması) yarım JSON görmesin, yazarken öldürülen süreç
    // dosyayı kesik bırakmasın.
    const tmp = `${p}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, bytes);
    // Windows'ta virüs tarayıcı/dizinleyici yeni dosyayı kısa süre tutabilir (EPERM/EACCES/EBUSY): ~2 sn yeniden dene.
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, p);
        break;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (attempt >= 8 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? "")) {
          await rm(tmp, { force: true });
          throw e;
        }
        await new Promise((r) => setTimeout(r, 25 * 2 ** Math.min(attempt, 6)));
      }
    }
    return `file://${p.replaceAll("\\", "/")}`;
  }

  async compareAndSwap(key: string, expected: Uint8Array | null, bytes: Uint8Array): Promise<boolean> {
    return fsCompareAndSwap(this.root, this.pathFor(key), expected, bytes);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async list(prefix: string): Promise<string[]> {
    // Önekin klasöründen başlanır: tüm kökü (kütüphane, önbellek) gezmek her listede saniyeler sürüyordu.
    const base = prefix.slice(0, prefix.lastIndexOf("/") + 1).replace(/\/+$/, "");
    try {
      const entries = await readdir(base ? this.pathFor(base) : this.root, { recursive: true, withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && !e.name.endsWith(".tmp"))
        .map((e) => relative(this.root, join(e.parentPath, e.name)).split(sep).join("/"))
        .filter((k) => k.startsWith(prefix) && k !== CAS_DB && !k.startsWith(`${CAS_DB}-`));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    const p = this.pathFor(key);
    await rm(p, { force: true });
    // Boşalan klasörler de gider (silinen bölümün klasörü kalmasın); dolu klasörde rmdir hata verir, orada durulur.
    for (let dir = dirname(p); dir !== this.root; dir = dirname(dir)) {
      try {
        await rmdir(dir);
      } catch {
        break;
      }
    }
  }
}

export interface S3StoreOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** MinIO (yerel) ve Cloudflare R2 (bulut) için S3 uyumlu depo. */
export class S3AssetStore implements AssetStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(opts: S3StoreOptions) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: true,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  /** Kova yoksa oluşturur (yerel RustFS ilk kurulumu için). */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
    return `s3://${this.bucket}/${key}`;
  }

  async compareAndSwap(key: string, expected: Uint8Array | null, bytes: Uint8Array, contentType: string): Promise<boolean> {
    let current: Uint8Array | null = null;
    let etag: string | undefined;
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.ETag || !res.Body) throw new Error("S3 atomik okuma için ETag ve gövde gerekli");
      etag = res.ETag;
      current = await res.Body.transformToByteArray();
    } catch (e) {
      if (!(e instanceof NoSuchKey)) throw e;
    }
    if (!sameBytes(current, expected)) return false;
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType,
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
      }));
      return true;
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 409 || status === 412 || (status === 404 && etag)) return false;
      throw e;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body ? await res.Body.transformToByteArray() : null;
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      throw e;
    }
  }

  /** S3 olmayan anahtarı silmeyi de başarılı sayar. */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function createStoreFromEnv(env: NodeJS.ProcessEnv, fsRoot = ".data/assets"): AssetStore {
  if (env.STORE === "s3") {
    const required = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
    for (const k of required) if (!env[k]) throw new Error(`STORE=s3 için ${k} gerekli`);
    return new S3AssetStore({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? "auto",
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    });
  }
  return new FsAssetStore(fsRoot);
}
