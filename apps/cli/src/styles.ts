import { STYLE_PACKS } from "@ys/core";
import type { EpisodePipeline } from "@ys/pipeline";

export interface SamplesDeps {
  pipeline: Pick<EpisodePipeline, "drawStyleSamples">;
  print: (line: string) => void;
}

/**
 * Stil örnekleri (yeni bölüm formunun önizlemesi): bölümlerde o stilde çizilmiş karakter/mekân alınır, eksikler
 * çizilir (Claude + kalite kapısı, paket başına ~$0.2–0.3). Paket verilmezse hepsi; tamamlanmış paket atlanır.
 */
export async function samplesCommand(deps: SamplesDeps, packs: string[]): Promise<void> {
  const samples = await deps.pipeline.drawStyleSamples(packs);
  for (const p of STYLE_PACKS) {
    const s = samples[p.id];
    const parts = s ? [s.character ? "karakter" : "-", s.background ? "mekân" : "-", s.source === "drawn" ? "çizildi" : "bölümlerden"] : ["örnek yok"];
    deps.print(`${p.id.padEnd(18)} ${parts.join("  ")}`);
  }
}
