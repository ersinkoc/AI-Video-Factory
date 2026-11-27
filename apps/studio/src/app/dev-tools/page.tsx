import { DEV_TOOLS, DEV_TOOLS_JOB, devToolStatus } from "@ys/pipeline/light";
import { getI18n } from "../../lib/locale";
import { getJob } from "../../lib/server";
import { DevToolsPanel } from "./dev-tools-panel";

export const dynamic = "force-dynamic";

export default async function DevToolsPage() {
  const [status, { t }] = await Promise.all([devToolStatus(), getI18n()]);
  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("devTools.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("devTools.intro")}</p>
      </div>
      <DevToolsPanel tools={DEV_TOOLS} initial={status} initialJob={getJob(DEV_TOOLS_JOB) ?? null} />
    </div>
  );
}
