import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EpisodePipeline, newEpisodeState } from "../packages/pipeline/src/index.ts";
import { InMemoryLedger, MediaGateway } from "../packages/media-gateway/src/index.ts";
import { FsAssetStore } from "../packages/storage/src/index.ts";
import { runMediaTool } from "../packages/video/src/tools.ts";

// Actual encoded test-pattern media. No model, media provider or browser renderer calls.
const root = resolve(process.argv[2] ?? "out/shot-audio-workflow");
const id = "shot-audio-verification", dir = join(root, ".data/episodes", id);
await mkdir(dir, { recursive: true });
const store = new FsAssetStore(join(root, ".data/assets")), ledger = new InMemoryLedger();
const pipeline = new EpisodePipeline({ store, ledger, gateway: new MediaGateway({ providers: [], store, ledger }), workDir: join(root, ".data/episodes"), log: console.log });
const path = join(dir, `${id}.mp4`);
await runMediaTool("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=12:d=6", "-f", "lavfi", "-i", "aevalsrc='if(lt(t,2),0.4*sin(2*PI*440*t),if(lt(t,4),0.02*sin(2*PI*440*t),0))|-if(lt(t,2),0.4*sin(2*PI*440*t),if(lt(t,4),0.02*sin(2*PI*440*t),0))':s=16000:d=6", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", path], false, { timeout: 20_000, maxBuffer: 1024 * 1024 });
const state = newEpisodeState({ topic: "Shot audio verification", lang: "en", targetSec: 6, tier: "economy", aiClipRatio: 0, budgetUsd: 1, width: 640, height: 360, fps: 12, autoApprove: true, motionMode: "still", music: false, short: false, captions: false });
state.id = id;
state.render = { path, at: new Date().toISOString(), auditRanges: [{ id: "opening", startSec: 0, endSec: 2 }, { id: "quiet", startSec: 2, endSec: 4 }, { id: "silence", startSec: 4, endSec: 6 }] };
state.done.render = state.render.at;
await pipeline.save(state);
const finished = await pipeline.auditRender(id);
const audit = finished.render!.audit!;
if (audit.status !== "complete" || audit.shotAudio?.windowsCount !== 3 || !audit.findings.some((f) => f.kind === "audio_gap") || !audit.findings.some((f) => f.kind === "audio_level_change") || (await ledger.list()).length) throw new Error("Real shot audio audit or zero-call verification failed");
await writeFile(join(root, "verification.json"), JSON.stringify({ episodeId: id, video: path, audit, ledgerEntries: 0, authoringTimelineAbsent: true }, null, 2));
console.log(`Verified shot audio audit: ${path}`);
