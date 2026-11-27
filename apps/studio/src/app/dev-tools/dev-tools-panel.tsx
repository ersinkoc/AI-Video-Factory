"use client";

import type { DevTool, DevToolStatus } from "@ys/pipeline/light";
import { useEffect, useState } from "react";
import type { MessageKey } from "../../lib/i18n";
import { useI18n } from "../locale-provider";

/** Kurulum işinin durumu (API'nin JobView'ının istemcinin kullandığı kısmı). */
export interface DevToolsJob {
  status: "running" | "done" | "error";
  log: string[];
}

/** Kodlama oturumları için 3D araçları: durum, tek tek ya da toplu kurulum (`ys skills install` işi). */
export function DevToolsPanel({ tools, initial, initialJob }: { tools: readonly DevTool[]; initial: DevToolStatus[]; initialJob: DevToolsJob | null }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(initial);
  const [job, setJob] = useState<DevToolsJob | null>(initialJob);
  const [error, setError] = useState<string>();
  const running = job?.status === "running";

  const reload = async () => {
    const res = await fetch("/api/dev-tools");
    const body = (await res.json()) as { tools: DevToolStatus[]; job: DevToolsJob | null };
    setStatus(body.tools);
    setJob(body.job);
  };

  // Kurulum sürerken iki saniyede bir durum sorulur; bitince rozetler yenilenir.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void reload(), 2000);
    return () => clearInterval(timer);
  }, [running]);

  const install = async (ids: string[]) => {
    setError(undefined);
    const res = await fetch("/api/dev-tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await reload();
  };

  const of = (id: string) => status.find((s) => s.id === id);
  const missing = status.some((s) => !s.ready);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={running || !missing} onClick={() => void install([])}>
          {t("devTools.installMissing")}
        </button>
        {job && (
          <span className={`text-sm ${job.status === "error" ? "text-bad" : job.status === "done" ? "text-ok" : "text-muted"}`} role="status">
            {t(job.status === "running" ? "devTools.job.running" : job.status === "done" ? "devTools.job.done" : "devTools.job.error")}
          </span>
        )}
      </div>
      {job && job.log.length > 0 && <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted">{job.log.slice(-12).join("\n")}</pre>}
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <ul className="grid gap-3">
        {tools.map((tool) => {
          const s = of(tool.id);
          const label = !s || s.installed === 0 ? t("devTools.status.missing") : s.ready ? t("devTools.status.ready") : t("devTools.status.partial", { installed: s.installed, total: s.total });
          return (
            <li key={tool.id} className="card grid gap-2" data-tool={tool.id}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold">{tool.id}</h2>
                <span className={`text-xs ${s?.ready ? "text-ok" : "text-muted"}`}>{label}</span>
                <button type="button" className="btn ml-auto" disabled={running || s?.ready} onClick={() => void install([tool.id])}>
                  {t("devTools.install")}
                </button>
              </div>
              <p className="text-sm">{t(`devTools.desc.${tool.id}` as MessageKey)}</p>
              <p className="text-xs text-muted">
                {t("devTools.source")}:{" "}
                <a className="underline" href={`https://github.com/${tool.repo}`} target="_blank" rel="noreferrer">
                  {tool.repo}
                </a>
                {" · "}
                {t("devTools.licence")}: {tool.licence}
                {" · "}
                {t("devTools.parts")}: {tool.kind === "mcp" ? t("devTools.kind.mcp") : tool.skills.join(", ")}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
