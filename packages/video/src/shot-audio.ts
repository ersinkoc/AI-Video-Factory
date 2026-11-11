import type { AuditRange } from "./render-audit.ts";

export interface AudioBlock {
  startSec: number; endSec: number; rmsDbfs: number | null; sampledPeakDbfs: number | null;
}
export interface ShotAudioWindow extends AuditRange {
  rmsDbfs: number | null; sampledPeakDbfs: number | null; relativeDb: number | null; previousDeltaDb: number | null;
  coverage: number; quietShare: number;
  longestQuiet?: { startSec: number; endSec: number };
  /** RMS energy mapped from -60..0 dBFS to 0..1. Not a signed waveform. */
  envelope: number[];
}
export interface ShotAudio {
  sampleRate: number; channels: number; blockDurationSec: number; coveredUntilSec: number;
  referenceDbfs: number | null; windows: ShotAudioWindow[];
}

/** Keep the original sample rate and channels; emit three statistics per 100 ms. */
export function audioMetadataFilter(sampleRate: number, channels: number, durationSec: number, maxBytes = 16 * 1024 * 1024): string {
  if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 384000 || !Number.isInteger(channels) || channels < 1 || channels > 8 || !Number.isFinite(durationSec) || durationSec <= 0) throw new Error("Unsupported audio sample rate, duration or channel count");
  if (Math.ceil(durationSec * 10) * 256 > maxBytes) throw new Error("Shot audio exceeds the bounded metadata budget; use a shorter review export");
  return `aresample=async=1:first_pts=0,asetnsamples=n=${Math.round(sampleRate / 10)}:p=0,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level+Peak_level+Number_of_samples,ametadata=mode=print:file=-`;
}

/** Reject missing/invalid/discontinuous data instead of converting it into silence. */
export function parseAudioBlocks(text: string, sampleRate: number): AudioBlock[] {
  if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 384000) throw new Error("Invalid audio sample rate");
  const out: AudioBlock[] = [];
  let current: { startSec: number; rms?: string; peak?: string; samples?: string } | undefined;
  const level = (raw: string | undefined): number | null => {
    if (raw === "-inf") return null;
    if (raw === undefined || !raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) < -1000 || Number(raw) > 1000) throw new Error("Missing or invalid audio level metadata");
    return Number(raw);
  };
  const finish = () => {
    if (!current) return;
    const samples = Number(current.samples);
    if (!Number.isFinite(current.startSec) || current.startSec < 0 || !Number.isInteger(samples) || samples <= 0 || samples > Math.round(sampleRate / 10)) throw new Error("Invalid audio block timing metadata");
    if (Math.abs(current.startSec - (out.at(-1)?.endSec ?? 0)) > 1.1 / sampleRate) throw new Error("Discontinuous audio metadata; coverage cannot be established");
    out.push({ startSec: current.startSec, endSec: current.startSec + samples / sampleRate, rmsDbfs: level(current.rms), sampledPeakDbfs: level(current.peak) });
  };
  for (const line of text.split(/\r?\n/)) {
    const frame = /^frame:\d+\s+pts:\S+\s+pts_time:(\S+)/.exec(line);
    if (frame) { finish(); current = { startSec: Number(frame[1]) }; continue; }
    if (line.startsWith("frame:")) throw new Error("Invalid audio frame metadata");
    const value = /^lavfi\.astats\.Overall\.(RMS_level|Peak_level|Number_of_samples)=(\S+)/.exec(line);
    if (value && current) current[value[1] === "RMS_level" ? "rms" : value[1] === "Peak_level" ? "peak" : "samples"] = value[2];
  }
  finish();
  if (!out.length) throw new Error("No complete audio statistics were decoded");
  return out;
}

/** Combine channel-independent full-band statistics. Zero power serializes as null dBFS. */
export function measureShotAudio(blocks: AudioBlock[], sampleRate: number, channels: number, ranges: AuditRange[], durationSec: number): ShotAudio {
  const coveredUntilSec = Math.min(durationSec, blocks.at(-1)?.endSec ?? 0);
  const windows = ranges.map((range): ShotAudioWindow => {
    const envelopeEnergy = Array<number>(32).fill(0), envelopeDuration = Array<number>(32).fill(0);
    let energy = 0, peak: number | null = null, quietDuration = 0, covered = 0, quietStart: number | undefined;
    let longestQuiet: ShotAudioWindow["longestQuiet"];
    for (const block of blocks.filter((b) => b.startSec < range.endSec && b.endSec > range.startSec)) {
      const left = Math.max(block.startSec, range.startSec), right = Math.min(block.endSec, range.endSec), length = right - left;
      const power = block.rmsDbfs === null ? 0 : 10 ** (block.rmsDbfs / 10);
      energy += power * length; covered += length;
      if (block.sampledPeakDbfs !== null) peak = Math.max(peak ?? -Infinity, block.sampledPeakDbfs);
      if (block.rmsDbfs === null || block.rmsDbfs < -50) {
        quietDuration += length; quietStart ??= left;
        if (!longestQuiet || right - quietStart > longestQuiet.endSec - longestQuiet.startSec) longestQuiet = { startSec: quietStart, endSec: right };
      } else quietStart = undefined;
      for (let i = 0; i < 32; i++) {
        const start = range.startSec + (range.endSec - range.startSec) * i / 32;
        const end = range.startSec + (range.endSec - range.startSec) * (i + 1) / 32;
        const overlap = Math.max(0, Math.min(end, right) - Math.max(start, left));
        envelopeEnergy[i]! += power * overlap; envelopeDuration[i]! += overlap;
      }
    }
    return { ...range, rmsDbfs: energy > 0 && covered > 0 ? 10 * Math.log10(energy / covered) : null, sampledPeakDbfs: peak,
      relativeDb: null, previousDeltaDb: null, coverage: Math.min(1, covered / (range.endSec - range.startSec)), quietShare: covered ? Math.min(1, quietDuration / covered) : 0,
      ...(longestQuiet ? { longestQuiet } : {}), envelope: envelopeEnergy.map((sum, i) => sum > 0 && envelopeDuration[i]! > 0 ? Math.round(Math.max(0, Math.min(1, (10 * Math.log10(sum / envelopeDuration[i]!) + 60) / 60)) * 1000) / 1000 : 0) };
  });
  const audible = windows.filter((w) => w.rmsDbfs !== null && w.rmsDbfs > -50 && w.coverage >= .98).map((w) => w.rmsDbfs!).sort((a, b) => a - b);
  const middle = Math.floor(audible.length / 2);
  const referenceDbfs = audible.length ? audible.length % 2 ? audible[middle]! : (audible[middle - 1]! + audible[middle]!) / 2 : null;
  for (const window of windows) window.relativeDb = window.rmsDbfs === null || referenceDbfs === null ? null : window.rmsDbfs - referenceDbfs;
  let previous: ShotAudioWindow | undefined;
  for (const window of [...windows].sort((a, b) => a.startSec - b.startSec)) {
    if (previous && previous.endSec <= window.startSec + .001 && previous.coverage >= .98 && window.coverage >= .98 && previous.rmsDbfs !== null && window.rmsDbfs !== null) window.previousDeltaDb = window.rmsDbfs - previous.rmsDbfs;
    previous = window;
  }
  return { sampleRate, channels, blockDurationSec: .1, coveredUntilSec, referenceDbfs, windows };
}
