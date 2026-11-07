import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Capability, Micros } from "@ys/core";

export interface CostEntry {
  at: string;
  episodeId?: string;
  stage?: string;
  /** Çekim, sahne veya karakter/mekân kimliği. */
  refId?: string;
  providerId: string;
  capability: Capability;
  estimateMicros: Micros;
  cacheHit: boolean;
  requestHash: string;
  /** Çağrının gerçek süresi (istekten dosyalar depoya yazılana kadar). */
  durationMs?: number;
  /** Faturalanan miktar ve birimi (ör. 10 "sn", 1 "görsel", 812 "karakter"). */
  units?: number;
  unitLabel?: string;
  /** Başarısız deneme; ücretlenmişse tahmini maliyet korunur, aksi halde 0 kaydedilir. */
  error?: string;
}

export interface CostLedger {
  record(entry: CostEntry): Promise<void>;
  /**
   * Bölümün ücretli API harcaması (bütçe tavanına sayılan). Claude ajan çağrıları (capability "llm") dahil değildir:
   * tavanı aşabilirler, maliyetleri ayrıca gösterilir (30 Eki kararı).
   */
  spent(episodeId: string): Promise<Micros>;
  /** Bölümün (verilmezse tümünün) kayıtları, eskiden yeniye. */
  list(episodeId?: string): Promise<CostEntry[]>;
}

export class InMemoryLedger implements CostLedger {
  readonly entries: CostEntry[] = [];

  async record(entry: CostEntry): Promise<void> {
    this.entries.push(entry);
  }

  async spent(episodeId: string): Promise<Micros> {
    return mediaSpentMicros(this.entries, episodeId);
  }

  async list(episodeId?: string): Promise<CostEntry[]> {
    return this.entries.filter((e) => !episodeId || e.episodeId === episodeId);
  }
}

/** Veritabanı olmadan da maliyet geçmişi kalsın diye JSONL dosyası. */
export class JsonlLedger implements CostLedger {
  constructor(private readonly path: string) {}

  async record(entry: CostEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(entry)}\n`);
  }

  async all(): Promise<CostEntry[]> {
    try {
      const text = await readFile(this.path, "utf8");
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CostEntry);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  async spent(episodeId: string): Promise<Micros> {
    return mediaSpentMicros(await this.all(), episodeId);
  }

  async list(episodeId?: string): Promise<CostEntry[]> {
    const all = await this.all();
    return episodeId ? all.filter((e) => e.episodeId === episodeId) : all;
  }
}

/** Aynı defter snapshot'ından bütçe toplamı: önbellek ve Claude çağrıları tavanın dışındadır. */
export function mediaSpentMicros(entries: readonly CostEntry[], episodeId: string): Micros {
  return entries
    .filter((e) => e.episodeId === episodeId && !e.cacheHit && e.capability !== "llm")
    .reduce((sum, e) => sum + e.estimateMicros, 0);
}

// ---------------- özetler ----------------

export interface CostGroup {
  key: string;
  calls: number;
  cacheHits: number;
  failures: number;
  micros: Micros;
  /** Başarılı çağrıların toplam süresi. */
  durationMs: number;
  units: number;
  unitLabel?: string;
}

/** Kayıtları bir anahtara göre (aşama, sağlayıcı, bölüm…) toplar. */
export function groupCosts(entries: readonly CostEntry[], keyOf: (e: CostEntry) => string): CostGroup[] {
  const groups = new Map<string, CostGroup>();
  for (const e of entries) {
    const key = keyOf(e);
    const g = groups.get(key) ?? { key, calls: 0, cacheHits: 0, failures: 0, micros: 0, durationMs: 0, units: 0 };
    if (e.error) {
      g.failures++;
      // Başarısız üretim de ücretlenmiş olabilir; süre/birimler yalnız başarılı çağrıların istatistiğidir.
      if (!e.cacheHit) g.micros += e.estimateMicros;
    } else if (e.cacheHit) g.cacheHits++;
    else {
      g.calls++;
      g.micros += e.estimateMicros;
      g.durationMs += e.durationMs ?? 0;
      g.units += e.units ?? 0;
      g.unitLabel ??= e.unitLabel;
    }
    groups.set(key, g);
  }
  return [...groups.values()];
}

/**
 * Sağlayıcı başına ölçülmüş ortalama çağrı süresi (ms). Süre tahminleri bununla yapılır;
 * en eski kayıtlarda süre alanı yok, onlar atlanır.
 */
export function measuredLatency(entries: readonly CostEntry[]): Record<string, { avgMs: number; n: number }> {
  const out: Record<string, { avgMs: number; n: number }> = {};
  for (const g of groupCosts(
    entries.filter((e) => e.durationMs !== undefined && !e.cacheHit && !e.error),
    (e) => e.providerId,
  )) {
    // Süzülmüş kayıtların hepsi başarılı çağrıdır: her grupta calls ≥ 1 (sıfıra bölme koruması).
    /* v8 ignore else */
    if (g.calls > 0) out[g.key] = { avgMs: Math.round(g.durationMs / g.calls), n: g.calls };
  }
  return out;
}
