import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Timeline } from "../packages/core/src/index.ts";
import { auditRenderedVideo } from "../packages/video/src/render-audit.ts";

const args = process.argv.slice(2);
if (!args[0] || args.includes("--help")) {
  console.log("Usage: pnpm.cmd exec tsx scripts/audit-render.ts <video> [--timeline timeline.json] [--out report.json]\nExit: 0 = measured without findings, 1 = review findings, 2 = failed/incomplete checks. Editorial checks remain separate.");
  process.exitCode = args.includes("--help") ? 0 : 2;
} else {
  try {
    let output = `${resolve(args[0])}.audit.json`;
    let timelineFile: string | undefined;
    for (let i = 1; i < args.length; i += 2) {
      if (!args[i + 1] || !["--timeline", "--out"].includes(args[i]!)) throw new Error(`Unknown or incomplete option: ${args[i]}`);
      if (args[i] === "--out") output = resolve(args[i + 1]!);
      else timelineFile = args[i + 1];
    }
    if ([resolve(args[0]), ...(timelineFile ? [resolve(timelineFile)] : [])].some((p) => p.toLowerCase() === output.toLowerCase())) throw new Error("Report output must not overwrite the video or timeline.");
    const timeline = timelineFile ? Timeline.parse(JSON.parse(await readFile(timelineFile, "utf8"))) : undefined;
    const ranges = timeline?.visuals.map((v) => ({ id: v.shotId, startSec: v.fromFrame / timeline.fps, endSec: (v.fromFrame + v.durationInFrames) / timeline.fps }));
    const report = await auditRenderedVideo(args[0], ranges);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    console.log(`${report.findings.length} review findings; ${report.checks.filter((c) => c.status === "failed").length} failed checks. Report: ${output}`);
    process.exitCode = report.checks.some((c) => c.status === "failed") ? 2 : report.findings.length ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
