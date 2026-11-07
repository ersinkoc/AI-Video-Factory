import { FsAssetStore } from "../../src/index.ts";

const store = new FsAssetStore(process.argv[2]!);
const key = "locks/process-test";
const expected = await store.get(key);
process.once("message", async () => {
  try {
    const won = await store.compareAndSwap(key, expected, new TextEncoder().encode(String(process.pid)));
    process.send!({ type: "result", won });
    process.disconnect!();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
    process.disconnect!();
  }
});
process.send!({ type: "observed", absent: expected === null });
