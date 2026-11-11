import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMediaTool } from "./tools.ts";
import { audioMetadataFilter, parseAudioBlocks, type AudioBlock } from "./shot-audio.ts";

export interface VoiceAudioMeasurement { durationMs: number; sampleRate: number; channels: number; blocks: AudioBlock[] }
const LIMITS = { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 };

/** Yalnız verilen konuşma dosyası çözülür; müzik, video veya ağ kaynağı okunmaz. */
export async function measureVoiceAudio(bytes: Uint8Array, mimeType: string): Promise<VoiceAudioMeasurement> {
  if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw new Error("Voice source must contain 1 byte to 64 MiB");
  const ext = ({ "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/flac": "flac", "audio/webm": "webm" } as Record<string, string>)[mimeType];
  if (!ext) throw new Error("Unsupported voice audio MIME type");
  const dir = await mkdtemp(join(tmpdir(), "ys-voice-audit-"));
  try {
    const file = join(dir, `voice.${ext}`); await writeFile(file, bytes);
    const probe = await runMediaTool("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,duration,channels,sample_rate", "-of", "json", file], true, LIMITS);
    const info = JSON.parse(probe.stdout) as { format?: { duration?: string }; streams?: { codec_type: string; duration?: string; channels?: number; sample_rate?: string }[] };
    const stream = info.streams?.find((s) => s.codec_type === "audio");
    const duration = Number(stream?.duration ?? info.format?.duration), sampleRate = Number(stream?.sample_rate), channels = stream?.channels ?? 0;
    if (!stream || !Number.isFinite(duration) || duration <= 0 || duration > 1200) throw new Error("Voice duration must be finite and at most 1,200 seconds");
    const filter = audioMetadataFilter(sampleRate, channels, duration, LIMITS.maxBuffer);
    const decoded = await runMediaTool("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-map", "0:a:0", "-vn", "-t", String(duration), "-af", filter, "-f", "null", "-"], true, LIMITS);
    return { durationMs: duration * 1000, sampleRate, channels, blocks: parseAudioBlocks(decoded.stdout, sampleRate) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
