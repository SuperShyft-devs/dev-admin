import type { MetsightsSyncConfig, QuestionnaireQuestionCreate } from "../../../lib/api";

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

/**
 * Returns the canonical recommended metsights_sync config for a given question_type.
 * Used to surface auto-suggestions when the question type changes in the edit form.
 */
export function getMetsightsSyncSuggestion(
  questionType: string
): MetsightsSyncConfig | null {
  if (questionType === "single_choice") {
    return {
      pull: { enabled: true, strategy: "list_to_single" },
      push: { enabled: true, strategy: "single_to_list" },
    };
  }
  if (questionType === "multiple_choice") {
    return {
      pull: { enabled: true, strategy: "passthrough" },
      push: { enabled: true, strategy: "passthrough" },
    };
  }
  if (questionType === "scale") {
    return {
      pull: { enabled: true, strategy: "scale_ingest" },
      push: { enabled: true, strategy: "scale_emit" },
    };
  }
  if (questionType === "text") {
    return {
      pull: { enabled: false, strategy: "passthrough" },
      push: { enabled: false, strategy: "passthrough" },
    };
  }
  return null;
}

/**
 * Checks whether the current metsights_sync config matches the suggested config for a question_type.
 * Returns true if there is a meaningful mismatch the admin should be aware of.
 */
export function hasMetsightsSyncMismatch(
  questionType: string,
  currentSync: MetsightsSyncConfig | null | undefined
): boolean {
  if (!currentSync) return false;
  const suggestion = getMetsightsSyncSuggestion(questionType);
  if (!suggestion) return false;
  const pullMismatch =
    currentSync.pull?.strategy !== undefined &&
    currentSync.pull.strategy !== suggestion.pull?.strategy;
  const pushMismatch =
    currentSync.push?.strategy !== undefined &&
    currentSync.push.strategy !== suggestion.push?.strategy;
  return pullMismatch || pushMismatch;
}

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
