"use client";
import { ShotIntent } from "@ys/core/intent";
import { useI18n } from "../../locale-provider";

export function ShotIntentDetails({ intent: raw, subjectLabel, targetLabel, narrationText, narration }: { intent?: ShotIntent; subjectLabel?: string; targetLabel?: string; narrationText?: string; narration?: string }) {
  const { t } = useI18n();
  if (raw === undefined) return null;
  const parsed = ShotIntent.safeParse(raw);
  if (!parsed.success) return <p className="text-sm text-accent">{t("intent.invalid")}</p>;
  const intent = parsed.data;
  const selectedWords = narrationText ?? narration?.split(/\s+/).filter(Boolean).slice(intent.narration.startWord, intent.narration.endWord + 1).join(" ");
  return <details className="min-w-0 rounded-lg border border-line p-3">
    <summary className="cursor-pointer font-medium">{t("intent.title")}</summary>
    <p className="my-2 text-xs text-muted">{t("intent.hint")}</p>
    <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted">{t("intent.subject")}</dt><dd className="break-words">{subjectLabel ?? intent.subject}</dd>
      <dt className="text-muted">{t("intent.action")}</dt><dd className="break-words">{t(`intent.action.${intent.action}`)}</dd>
      {intent.target && <><dt className="text-muted">{t("intent.target")}</dt><dd className="break-words">{targetLabel ?? intent.target}</dd></>}
      <dt className="text-muted">{t("intent.payoff")}</dt><dd className="break-words">{intent.payoff}</dd>
      <dt className="text-muted">{t("intent.words")}</dt><dd className="break-words">{selectedWords || `${intent.narration.startWord}–${intent.narration.endWord}`}</dd>
      <dt className="text-muted">{t("intent.reveal")}</dt><dd>{Math.round(intent.reveal * 100)}%</dd>
      <dt className="text-muted">{t("intent.hold")}</dt><dd>{intent.holdSec}s</dd>
    </dl>
  </details>;
}
