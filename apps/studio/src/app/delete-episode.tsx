"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "./locale-provider";

/**
 * Bölüm kartındaki silme düğmesi (yarım kalmış ya da bitmiş bölüm): önce kartın üstünde sorar, onaylanınca siler ve
 * listeyi yeniler. İş sürerken kapalıdır; sunucu da reddeder.
 */
export function DeleteEpisode({ id, title, running }: { id: string; title: string; running: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const remove = async () => {
    setPending(true);
    setError(undefined);
    try {
      // Stüdyo API'si yazma isteklerini yalnız JSON olarak kabul eder (proxy.ts).
      const res = await fetch(`/api/episodes/${id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t("common.actionFailed"));
        return;
      }
      setAsking(false);
      router.refresh();
    } catch {
      setError(t("common.actionFailed"));
    } finally {
      setPending(false);
    }
  };

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        disabled={running}
        aria-label={t("home.delete")}
        title={running ? t("home.delete.running") : t("home.delete")}
        className="absolute right-2 bottom-2 cursor-pointer rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-bad disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Trash2 size={15} />
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label={t("home.delete")} className="absolute inset-x-2 bottom-2 grid gap-2 rounded-xl border border-bad/50 bg-panel p-3 text-sm shadow-lg">
      <p>{t("home.delete.ask", { title })}</p>
      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost px-3 py-1" onClick={() => (setAsking(false), setError(undefined))} disabled={pending}>
          {t("home.delete.no")}
        </button>
        <button type="button" className="btn bg-bad px-3 py-1 text-white hover:brightness-110" onClick={() => void remove()} disabled={pending} autoFocus>
          <Trash2 size={14} /> {t("home.delete.yes")}
        </button>
      </div>
    </div>
  );
}
