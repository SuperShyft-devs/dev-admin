import type { QuestionnaireQuestionCreate } from "../../../lib/api";

export const Q_STATUS_OPTIONS = ["active", "inactive"] as const;

export const QUESTION_TYPES = [
  { value: "text", label: "Text (free answer)" },
  { value: "single_choice", label: "Single Choice" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "scale", label: "Scale" },
] as const;

export const OPTION_SUPPORTED_TYPES = new Set(["single_choice", "multiple_choice", "scale"]);

export const PREFILL_PREFERENCE_KEYS = ["diet_preference", "allergies"] as const;

export const PULL_STRATEGIES = [
  "passthrough",
  "scale_ingest",
  "choice_ingest",
  "scale_to_bucket",
  "string_boolean",
  "list_to_single",
] as const;

export const PUSH_STRATEGIES = [
  "passthrough",
  "scale_emit",
  "choice_remap",
  "bucket_to_scale",
  "boolean_string",
  "single_to_list",
  "list_to_single",
  "skip_if_only",
] as const;

export const STRATEGY_HAS_JSON_PARAMS = new Set([
  "scale_to_bucket",
  "choice_remap",
  "bucket_to_scale",
  "choice_ingest",
  "scale_ingest",
  "scale_emit",
  "skip_if_only",
]);

export const BLANK_QUESTION: QuestionnaireQuestionCreate = {
  question_key: "",
  question_text: "",
  question_type: "",
  is_required: false,
  is_read_only: false,
  help_text: "",
  options: null,
  visibility_rules: null,
  prefill_from: null,
  status: "active",
};

export function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function StatusBadge({ status }: { status?: string | null }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium";
  if (status === "active") return <span className={`${base} bg-zinc-100 text-zinc-700`}>Active</span>;
  if (status === "inactive") return <span className={`${base} bg-zinc-100 text-zinc-600`}>Inactive</span>;
  if (status === "archived") return <span className={`${base} bg-amber-100 text-amber-700`}>Archived</span>;
  if (status === "complete") return <span className={`${base} bg-zinc-100 text-zinc-700`}>Complete</span>;
  if (status === "incomplete") return <span className={`${base} bg-zinc-100 text-zinc-600`}>Incomplete</span>;
  return <span className={`${base} bg-zinc-100 text-zinc-500`}>{status ?? "—"}</span>;
}

export function ToggleSwitch({
  enabled,
  onToggle,
  ariaLabel,
}: {
  enabled: boolean;
  onToggle: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center w-11 h-6 rounded-full transition-colors ${enabled ? "bg-zinc-900" : "bg-zinc-300"}`}
      aria-pressed={enabled}
      aria-label={ariaLabel}
    >
      <span
        className={`h-5 w-5 bg-white rounded-full shadow transform transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
