import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { FsAssetStore } from "../src/index.ts";

it("recovers the OS mutex after its holding process is terminated", async () => {
  const root = await mkdtemp(join(tmpdir(), "ys-cas-exit-"));
  const child = fork(fileURLToPath(new URL("./fixtures/cas-hold-worker.ts", import.meta.url)), [root], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("message", () => resolve());
      child.once("error", reject);
    });
    child.kill();
    await exited;
    const store = new FsAssetStore(root);
    expect(await store.compareAndSwap("locks/recovered", null, new Uint8Array([1]))).toBe(true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    await rm(root, { recursive: true, force: true });
  }
});

it("serializes two real processes after both observe the absent file", async () => {
  const root = await mkdtemp(join(tmpdir(), "ys-cas-process-"));
  const start = () => {
    const child = fork(fileURLToPath(new URL("./fixtures/cas-worker.ts", import.meta.url)), [root], {
      execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
    });
    let observed!: (absent: boolean) => void;
    let result!: (won: boolean) => void;
    const saw = new Promise<boolean>((resolve, reject) => { observed = resolve; child.once("error", reject); });
    const won = new Promise<boolean>((resolve, reject) => { result = resolve; child.once("error", reject); });
    child.on("message", (m: { type: string; absent: boolean; won: boolean }) => {
      if (m.type === "observed") observed(m.absent);
      else result(m.won);
    });
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    return { child, saw, won, exited };
  };
  const workers = [start(), start()];
  try {
    expect(await Promise.all(workers.map((w) => w.saw))).toEqual([true, true]);
    for (const w of workers) w.child.send("compare-and-swap");
    expect((await Promise.all(workers.map((w) => w.won))).sort()).toEqual([false, true]);
    expect(await Promise.all(workers.map((w) => w.exited))).toEqual([0, 0]);
  } finally {
    for (const w of workers) if (w.child.exitCode === null) w.child.kill();
    await Promise.all(workers.map((w) => w.exited));
    await rm(root, { recursive: true, force: true });
  }
});
