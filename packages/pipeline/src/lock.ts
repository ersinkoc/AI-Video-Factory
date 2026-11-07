import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { LocalizedError, msg } from "@ys/core";
import type { AssetStore } from "@ys/storage";

/**
 * Çalışma kilidi: pipeline çalışırken bölüm klasörüne süreç kimliği yazılır. Aynı bölüm ikinci kez başlatılamaz (iki
 * süreç aynı durum dosyasını birbirinin üstüne yazardı); süreç ölmüşse (iptal, çökme) kilit bayattır ve yok sayılır.
 * Durum dosyasının "15 dk kayıt yoksa takıldı" tahmininden kesindir. Yalnız aynı makinedeki süreç denetlenebilir;
 * başka makinedeki kilit (paylaşılan S3) canlı sayılır.
 */
export interface RunLock {
  pid: number;
  host: string;
  startedAt: string;
  /** Eski kayıtlarda yok; her yeni alımda farklıdır, aynı PID'li yeni sahip de korunur. */
  token?: string;
}

const lockKey = (id: string) => `episodes/${id}/run.lock.json`;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: süreç var ama sinyal izni yok.
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    throw e;
  }
}

function parseLock(bytes: Uint8Array | null, id: string): RunLock | undefined {
  if (bytes === null) return undefined;
  try {
    const lock = JSON.parse(new TextDecoder().decode(bytes)) as RunLock | null;
    if (lock === null) return undefined;
    if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0 || typeof lock.host !== "string" || !lock.host || typeof lock.startedAt !== "string") {
      throw new Error("invalid lock");
    }
    return lock;
  } catch {
    throw new LocalizedError(msg("err.lock.invalid", { id }));
  }
}

/** Canlı kilit (yoksa ya da sahibi ölmüşse undefined). */
export async function liveLock(store: AssetStore, id: string): Promise<RunLock | undefined> {
  const lock = parseLock(await store.get(lockKey(id)), id);
  if (!lock) return undefined;
  if (lock.host !== hostname()) return lock;
  return alive(lock.pid) ? lock : undefined;
}

/**
 * Bu makinede sahibi ölmüş kilit var mı: pipeline çökmüş ya da öldürülmüş, durum dosyasındaki "sürüyor" kesin bayattır.
 * Kilit hiç yoksa false (kilitsiz işler, ör. önizleme, için bir şey söylenemez).
 */
export async function deadLock(store: AssetStore, id: string): Promise<boolean> {
  const lock = parseLock(await store.get(lockKey(id)), id);
  return Boolean(lock?.pid) && lock!.host === hostname() && !alive(lock!.pid);
}

/** Kilidi alır; başka canlı süreç tutuyorsa hata. Dönen fonksiyon kilidi bırakır (yalnız kendi kilidiyse). */
export async function acquireLock(store: AssetStore, id: string): Promise<() => Promise<void>> {
  if (!store.compareAndSwap) throw new LocalizedError(msg("err.lock.unsupported"));
  const key = lockKey(id);
  const mine: RunLock = { pid: process.pid, host: hostname(), startedAt: new Date().toISOString(), token: randomUUID() };
  const bytes = new TextEncoder().encode(JSON.stringify(mine));
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await store.get(key);
    const held = parseLock(previous, id);
    if (held && (held.host !== hostname() || alive(held.pid))) {
      throw new LocalizedError(msg("err.lock.busy", { pid: held.pid, startedAt: held.startedAt }));
    }
    if (await store.compareAndSwap(key, previous, bytes, "application/json")) {
      return async () => {
        await store.compareAndSwap!(key, bytes, new TextEncoder().encode("null"), "application/json");
      };
    }
  }
  throw new LocalizedError(msg("err.lock.contended", { id }));
}
