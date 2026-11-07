import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const CAS_DB = ".store-cas.sqlite";

export const sameBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean =>
  a === null ? b === null : b !== null && Buffer.from(a).equals(b);

/**
 * SQLite yalnız kısa, süreçler arası mutex olarak kullanılır; varlığın kendisi yine dosyadadır.
 * Kontrol ve rename arasında await yoktur. Süreç ölürse SQLite işletim sistemi kilidini bırakır;
 * bayat bir mutex dosyasını silip başka sahibin kilidini çalma yarışı oluşmaz.
 */
export function fsCompareAndSwap(root: string, path: string, expected: Uint8Array | null, bytes: Uint8Array): boolean {
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(join(root, CAS_DB), { timeout: 5000 });
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      let current: Uint8Array | null;
      try {
        current = readFileSync(path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        current = null;
      }
      if (!sameBytes(current, expected)) return false;
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(tmp, bytes);
        renameSync(tmp, path);
      } finally {
        rmSync(tmp, { force: true });
      }
      return true;
    } finally {
      // Veritabanına veri yazılmaz; transaction yalnız dosya işlemlerini sıraya koyar.
      db.exec("ROLLBACK");
    }
  } finally {
    db.close();
  }
}
