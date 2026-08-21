import { Check, CircleDot, Minus, X } from "lucide-react";

export function CompletenessFlagIcon({ present, label }: { present: boolean; label: string }) {
  if (present) {
    return (
      <span title={label}>
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      </span>
    );
  }
  return (
    <span title={label}>
      <X className="w-3.5 h-3.5 text-zinc-300" />
    </span>
  );
}

export function CompletenessQuestionnaireIcon({
  state,
}: {
  state: "filled" | "partially_filled" | "not_started";
}) {
  if (state === "filled") {
    return (
      <span title="Questionnaire filled">
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      </span>
    );
  }
  if (state === "partially_filled") {
    return (
      <span title="Questionnaire partially filled">
        <CircleDot className="w-3.5 h-3.5 text-amber-500" />
      </span>
    );
  }
  return (
    <span title="Questionnaire not started">
      <Minus className="w-3.5 h-3.5 text-zinc-400" />
    </span>
  );
}

export type CompletenessSummaryTone = "emerald" | "sky" | "violet" | "amber" | "zinc";

export function CompletenessSummaryCard({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: CompletenessSummaryTone;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  const toneClasses = {
    emerald: {
      box: "bg-emerald-50 border-emerald-200",
      count: "text-emerald-700",
      label: "text-emerald-600",
      bar: "bg-emerald-500",
    },
    sky: {
      box: "bg-sky-50 border-sky-200",
      count: "text-sky-700",
      label: "text-sky-600",
      bar: "bg-sky-500",
    },
    violet: {
      box: "bg-violet-50 border-violet-200",
      count: "text-violet-700",
      label: "text-violet-600",
      bar: "bg-violet-500",
    },
    amber: {
      box: "bg-amber-50 border-amber-200",
      count: "text-amber-700",
      label: "text-amber-600",
      bar: "bg-amber-500",
    },
    zinc: {
      box: "bg-zinc-50 border-zinc-200",
      count: "text-zinc-700",
      label: "text-zinc-600",
      bar: "bg-zinc-400",
    },
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClasses.box}`}>
      <div className={`text-lg font-semibold tabular-nums ${toneClasses.count}`}>
        {count}
        <span className="text-sm font-normal text-zinc-500">/{total}</span>
      </div>
      <div className={`text-[11px] ${toneClasses.label}`}>{label}</div>
      <div className="mt-1.5 h-1.5 w-full rounded bg-white/70 overflow-hidden">
        <div
          className={`h-full rounded transition-all ${toneClasses.bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function formatCompletenessRatio(count: number, total: number): string {
  return `${count}/${total}`;
}
