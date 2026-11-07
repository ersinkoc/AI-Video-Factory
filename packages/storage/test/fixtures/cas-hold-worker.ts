import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(join(process.argv[2]!, ".store-cas.sqlite"));
db.exec("BEGIN IMMEDIATE");
// IPC bağlantısı test süreci sonlandırana kadar transaction'ı açık tutar.
process.on("message", () => {});
process.send!({ type: "holding" });
