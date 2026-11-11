import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EpisodePipeline, newEpisodeState } from "../packages/pipeline/src/index.ts";
import { readVoiceAudit } from "../packages/pipeline/src/voice-audit.ts";
import { LEXICON, sayPlan } from "../packages/pipeline/src/pronounce.ts";
import { InMemoryLedger, MediaGateway } from "../packages/media-gateway/src/index.ts";
import { FsAssetStore } from "../packages/storage/src/index.ts";
import { runMediaTool } from "../packages/video/src/tools.ts";
import { auditRenderedVideo } from "../packages/video/src/render-audit.ts";

// Konuşma yerine sentetik tonlar kullanılır: bu fikstür anlaşılabilirlik veya telaffuz kanıtı değildir.
const root = resolve(process.argv[2] ?? "out/voice-audit-workflow"), id = "voice-verification";
try { await access(root); throw new Error("Choose a new empty fixture directory"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
await mkdir(root, { recursive: true });
const store = new FsAssetStore(join(root, ".data/assets")), ledger = new InMemoryLedger();
const pipeline = new EpisodePipeline({ store, ledger, gateway: new MediaGateway({ store, ledger, providers: [] }), workDir: join(root, ".data/episodes") });
const encode = async (name: string, expression: string) => {
  const file = join(root, `${name}.wav`);
  await runMediaTool("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `aevalsrc=${expression}:s=48000:d=4`, "-c:a", "pcm_s16le", file], false, { timeout: 20_000, maxBuffer: 1024 * 1024 });
  const key = `episodes/${id}/voice-stems/${name}.wav`; await store.put(key, new Uint8Array(await readFile(file))); return { file, key };
};
const good = await encode("good", "(between(t\\,0.1\\,1)+between(t\\,2.2\\,3.5))*0.15*sin(2*PI*220*t)");
const silent = await encode("silent", "0"), partial = await encode("partial", "between(t\\,0.1\\,1)*0.15*sin(2*PI*220*t)");
const mixedVideo = join(root, "music-masking.mp4");
await runMediaTool("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=12:d=4", "-i", silent.file, "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=4", "-filter_complex", "[1:a][2:a]amix=inputs=2:duration=longest:normalize=0[a]", "-map", "0:v:0", "-map", "[a]", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mixedVideo], false, { timeout: 20_000, maxBuffer: 1024 * 1024 });
const mixAudit = await auditRenderedVideo(mixedVideo), mixRms = mixAudit.shotAudio?.windows[0]?.rmsDbfs;
if (mixRms === null || mixRms === undefined || mixRms < -50 || mixAudit.findings.some((f) => f.kind === "audio_gap")) throw new Error("Mixed soundtrack was not audibly energetic throughout");
const narration = "C++ 2026.", plan = sayPlan(narration, LEXICON.tr ?? {}, "tr");
const state = newEpisodeState({ topic: "Synthetic voice evidence", lang: "tr", targetSec: 16, tier: "economy", aiClipRatio: 0, budgetUsd: 0, width: 640, height: 360, fps: 12 }); state.id = id;
state.script = { scenes: ["good", "masked", "partial", "estimated", "pause"].map((sceneId) => ({ id: sceneId, beatId: "fixture", narration: sceneId === "pause" ? "…" : narration, visualIntent: "Synthetic evidence", emotion: "neutral", location: "fixture" })) };
state.voice = Object.fromEntries([["good", good.key], ["masked", silent.key], ["partial", partial.key], ["estimated", partial.key]].map(([sceneId, key]) => [sceneId!, { key: key!, mimeType: "audio/wav", durationMs: 4000, text: narration, spoken: plan.spoken, estimatedTiming: sceneId === "estimated", words: [{ text: "C++", say: "si pılas pılas", startMs: 100, endMs: 1000 }, { text: "2026.", say: "iki bin yirmi altı", startMs: 2200, endMs: 3500 }] }]));
state.done.voice = new Date().toISOString(); await pipeline.save(state);
const result = await pipeline.auditVoice(id), evidence = await readVoiceAudit(store, result);
if (!evidence?.current || result.voiceAudit?.status !== "complete") throw new Error("Voice report did not complete");
const scene = (name: string) => evidence.report.scenes.find((s) => s.sceneId === name)!;
if (!scene("masked").findings.some((f) => f.kind === "voice_silent") || !scene("partial").findings.some((f) => f.kind === "voice_word_gap") || scene("good").findings.length || scene("pause").findings.length) throw new Error("Voice masking/intentional-pause boundary failed");
if (!scene("estimated").checks.some((c) => c.name === "word_activity" && c.status === "skipped") || scene("good").forms.captions !== narration || plan.spoken === narration) throw new Error("Timing/spelling disclosure failed");
await store.put(silent.key, new Uint8Array(await readFile(good.file)));
if ((await readVoiceAudit(store, result))?.current) throw new Error("Changed source bytes retained current evidence");
await store.put(silent.key, new Uint8Array(await readFile(silent.file)));
if ((await ledger.list()).length) throw new Error("Unexpected generation ledger entries");
await writeFile(join(root, "mix-audit.json"), JSON.stringify(mixAudit, null, 2));
await writeFile(join(root, "verification.json"), JSON.stringify({ syntheticFixture: true, mixedVideo, mixedAudioRmsDbfs: mixRms, maskedVoiceSilent: true, partialWordGap: true, naturalPauseAccepted: true, captionSpellingPreserved: true, estimatedWordCheckSkipped: true, sourceChangesInvalidate: true, ledgerEntries: 0, reportKey: result.voiceAudit.reportKey, sceneCount: evidence.report.scenes.length }, null, 2));
console.log(`Verified voice-only evidence: ${root}`);
