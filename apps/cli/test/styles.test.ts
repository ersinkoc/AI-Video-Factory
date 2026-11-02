import { STYLE_PACKS } from "@ys/core";
import { describe, expect, it, vi } from "vitest";
import { samplesCommand } from "../src/styles.ts";

/** CLI stil örnekleri komutu: istenen paketler pipeline'a gider, her paketin durumu bir satır (çizim sahte). */

describe("styles samples", () => {
  it("paketleri pipeline'a verir; her paket için karakter/mekân ve kaynağı yazar", async () => {
    const lines: string[] = [];
    const drawStyleSamples = vi.fn(async (_packs: string[]) => ({
      noir: { character: "c.svg", background: "b.svg", source: "drawn" as const, at: "t" },
      pixel: { character: "c.svg", source: "library" as const, at: "t" },
      blueprint: { background: "b.svg", source: "library" as const, at: "t" },
    }));
    await samplesCommand({ pipeline: { drawStyleSamples }, print: (l) => lines.push(l) }, ["noir", "pixel"]);
    expect(drawStyleSamples).toHaveBeenCalledWith(["noir", "pixel"]);
    expect(lines).toHaveLength(STYLE_PACKS.length);
    expect(lines).toContain(`${"noir".padEnd(18)} karakter  mekân  çizildi`);
    expect(lines).toContain(`${"pixel".padEnd(18)} karakter  -  bölümlerden`);
    expect(lines).toContain(`${"blueprint".padEnd(18)} -  mekân  bölümlerden`);
    expect(lines).toContain(`${"ukiyo-e".padEnd(18)} örnek yok`);
  });
});
