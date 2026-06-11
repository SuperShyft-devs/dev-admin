import { useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import type { QuestionnaireOption, QuestionnaireQuestionCreate } from "../../../lib/api";
import {
  OPTION_SUPPORTED_TYPES,
  PREFILL_PREFERENCE_KEYS,
  Q_STATUS_OPTIONS,
  QUESTION_TYPES,
  StatusBadge,
  cap,
} from "./questionUi";
import {
  CONDITION_OPERATORS,
  type ConditionOperator,
  type EditableVisibilityCondition,
  normalizeVisibilityRule,
  stringifyRuleValue,
} from "./visibilityRules";

export interface QuestionFormProps {
  value: QuestionnaireQuestionCreate;
  onChange: (value: QuestionnaireQuestionCreate) => void;
  availableQuestionKeys?: string[];
  mode: "add" | "edit";
  error: string | null;
  submitting: boolean;
  currentStatus?: string | null;
  togglingStatus?: boolean;
  onToggleStatus?: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

type VisibilityConditionPatch = Partial<
  Pick<EditableVisibilityCondition, "type" | "operator" | "question_key" | "preference_key" | "value">
>;

export function QuestionForm({
  value,
  onChange,
  availableQuestionKeys,
  mode,
  error,
  submitting,
  currentStatus,
  togglingStatus,
  onToggleStatus,
  onSubmit,
  onCancel,
}: QuestionFormProps) {
  const showOptions = OPTION_SUPPORTED_TYPES.has(value.question_type);
  const options = value.options ?? [];
  const visibilityRules = value.visibility_rules ?? null;
  const visibilityConditions = Array.isArray(visibilityRules?.conditions) ? visibilityRules.conditions : [];
  const hasConditionalVisibility = visibilityConditions.length > 0;
  const hasAdvanced =
    hasConditionalVisibility || Boolean(value.prefill_from?.preference_key);
  const matchMode = visibilityRules?.match === "any" ? "any" : "all";
  const prefillPreferenceKey = value.prefill_from?.preference_key ?? "";
  const [showOptionKeys, setShowOptionKeys] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvanced);

  const availableParentKeys = useMemo(
    () =>
      (availableQuestionKeys ?? [])
        .filter((item) => item && item !== value.question_key)
        .sort((a, b) => a.localeCompare(b)),
    [availableQuestionKeys, value.question_key]
  );

  const getSuggestedOptionValue = (displayName: string, index: number) => {
    const normalized = displayName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalized || `option_${index + 1}`;
  };

  const setField = (patch: Partial<QuestionnaireQuestionCreate>) => {
    onChange({ ...value, ...patch });
  };

  const parseRuleValue = (operator: ConditionOperator, rawValue: string): unknown => {
    if (operator === "in" || operator === "not_in") {
      return rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return rawValue;
  };

  const getEditableVisibilityConditions = (): EditableVisibilityCondition[] =>
    visibilityConditions.map((condition) => normalizeVisibilityRule(condition));

  const persistVisibilityRules = (
    conditions: EditableVisibilityCondition[],
    nextMatch: "all" | "any" = matchMode
  ) => {
    if (conditions.length === 0) {
      setField({ visibility_rules: null });
      return;
    }
    setField({
      visibility_rules: {
        match: nextMatch,
        conditions: conditions.map((condition) =>
          condition.type === "question_answer"
            ? {
                type: "question_answer" as const,
                operator: condition.operator,
                question_key: condition.question_key.trim().toLowerCase(),
                value: condition.value,
              }
            : {
                type: "user_preference" as const,
                operator: condition.operator,
                preference_key: condition.preference_key || "diet_preference",
                value: condition.value,
              }
        ),
      },
    });
  };

  const setConditionalVisibilityEnabled = (enabled: boolean) => {
    if (!enabled) {
      setField({ visibility_rules: null });
      return;
    }
    if (visibilityConditions.length > 0) return;
    setAdvancedOpen(true);
    persistVisibilityRules([
      {
        type: "question_answer",
        operator: "equals",
        question_key: "",
        preference_key: "",
        value: "",
      },
    ]);
  };

  const updateVisibilityCondition = (index: number, patch: VisibilityConditionPatch) => {
    const normalized = getEditableVisibilityConditions();
    const current = normalized[index];
    if (!current) return;
    const nextType: EditableVisibilityCondition["type"] =
      patch.type === "user_preference" ? "user_preference" : patch.type === "question_answer" ? "question_answer" : current.type;
    const nextOperator = CONDITION_OPERATORS.some((item) => item.value === patch.operator)
      ? (patch.operator as ConditionOperator)
      : current.operator;
    const nextRawValue = patch.value ?? current.value;
    const nextCondition: EditableVisibilityCondition = {
      type: nextType,
      operator: nextOperator,
      question_key:
        nextType === "question_answer" ? String(patch.question_key ?? current.question_key ?? "") : "",
      preference_key:
        nextType === "user_preference"
          ? ((patch.preference_key === "diet_preference" || patch.preference_key === "allergies"
              ? patch.preference_key
              : current.preference_key || "diet_preference") as "diet_preference" | "allergies")
          : "",
      value: typeof nextRawValue === "string" ? parseRuleValue(nextOperator, nextRawValue) : nextRawValue,
    };
    normalized[index] = nextCondition;
    persistVisibilityRules(normalized, matchMode);
  };

  const addVisibilityCondition = () => {
    const normalized = getEditableVisibilityConditions();
    normalized.push({
      type: "question_answer",
      operator: "equals",
      question_key: "",
      preference_key: "",
      value: "",
    });
    persistVisibilityRules(normalized, matchMode);
  };

  const removeVisibilityCondition = (index: number) => {
    const normalized = getEditableVisibilityConditions();
    persistVisibilityRules(
      normalized.filter((_, itemIndex) => itemIndex !== index),
      matchMode
    );
  };

  const addOption = () => {
    const index = options.length;
    const next: QuestionnaireOption[] = [
      ...options,
      { option_value: `option_${index + 1}`, display_name: "", tooltip_text: "" },
    ];
    setField({ options: next });
  };

  const updateOption = (index: number, patch: Partial<QuestionnaireOption>) => {
    const next = [...options];
    const current = next[index];
    const currentSuggested = getSuggestedOptionValue(current.display_name, index);
    const isAutoValue = !current.option_value?.trim() || current.option_value === currentSuggested;
    const displayName = patch.display_name !== undefined ? patch.display_name : current.display_name;
    const nextPatch: Partial<QuestionnaireOption> = { ...patch };
    if (patch.display_name !== undefined && patch.option_value === undefined && isAutoValue) {
      nextPatch.option_value = getSuggestedOptionValue(displayName, index);
    }
    next[index] = { ...current, ...nextPatch };
    setField({ options: next });
  };

  const removeOption = (index: number) => {
    setField({ options: options.filter((_, i) => i !== index) });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-zinc-200 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Question basics</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Define the question identity, wording, and answer format.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Question Key <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={value.question_key}
            onChange={(e) => setField({ question_key: e.target.value.toLowerCase() })}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
            placeholder="e.g. diet_preference"
            required
          />
          <p className="mt-1 text-xs text-zinc-500">Stable key used for logic, preferences, and exports.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Question Text <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={value.question_text}
            onChange={(e) => setField({ question_text: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
            placeholder="Enter question text..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Question Type <span className="text-red-500">*</span>
          </label>
          <select
            value={value.question_type}
            onChange={(e) =>
              setField({
                question_type: e.target.value,
                options: OPTION_SUPPORTED_TYPES.has(e.target.value)
                  ? options.length > 0
                    ? options
                    : [{ option_value: "", display_name: "", tooltip_text: "" }]
                  : null,
              })
            }
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
            required
          >
            <option value="">Select type...</option>
            {QUESTION_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">Choice and scale types need configured values.</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={!!value.is_required}
              onChange={(e) => setField({ is_required: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Required
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={!!value.is_read_only}
              onChange={(e) => setField({ is_read_only: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Read only
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Help Text</label>
          <textarea
            rows={2}
            value={value.help_text ?? ""}
            onChange={(e) => setField({ help_text: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
            placeholder="Optional hint shown under the question..."
          />
        </div>

        <p className="text-xs text-zinc-500">
          Category mapping is managed from{" "}
          <span className="font-medium text-zinc-700">Categories → Manage Questions</span>.
        </p>
      </div>

      {showOptions && (
        <div className="rounded-xl border border-zinc-200 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {value.question_type === "scale" ? "Accepted units" : "Options"}{" "}
                <span className="text-red-500">*</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {value.question_type === "scale"
                  ? "Add every accepted unit users can submit (for example cm, ft)."
                  : "Add answer choices users will see. Internal keys are auto-generated from labels."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowOptionKeys((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs text-zinc-700 hover:bg-zinc-50 shrink-0"
            >
              {showOptionKeys ? "Hide internal keys" : "Edit internal keys"}
            </button>
          </div>

          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="rounded-lg border border-zinc-200 p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label>
                    <span className="mb-1 block text-xs font-medium text-zinc-600">Label shown to users</span>
                    <input
                      type="text"
                      value={option.display_name}
                      onChange={(e) => updateOption(index, { display_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      placeholder={value.question_type === "scale" ? "e.g. Centimeters" : "e.g. Coastal"}
                      required
                    />
                  </label>
                  {showOptionKeys ? (
                    <label>
                      <span className="mb-1 block text-xs font-medium text-zinc-600">Internal key</span>
                      <input
                        type="text"
                        value={option.option_value}
                        onChange={(e) => updateOption(index, { option_value: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
                        placeholder={
                          value.question_type === "scale"
                            ? "e.g. cm"
                            : `e.g. ${getSuggestedOptionValue(option.display_name, index)}`
                        }
                        required
                      />
                    </label>
                  ) : (
                    <div>
                      <span className="mb-1 block text-xs font-medium text-zinc-600">Internal key</span>
                      <div className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm font-mono bg-zinc-50 text-zinc-600">
                        {option.option_value || getSuggestedOptionValue(option.display_name, index)}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option.tooltip_text ?? ""}
                    onChange={(e) => updateOption(index, { tooltip_text: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder={
                      value.question_type === "scale" ? "Optional note for this unit" : "Tooltip text (optional)"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50"
                    aria-label="Remove option"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
            >
              <Plus className="w-3.5 h-3.5" /> Add option
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
        >
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Advanced</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Visibility rules and auto-fill from preferences</p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
          />
        </button>

        {advancedOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-zinc-200">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={hasConditionalVisibility}
                onChange={(e) => setConditionalVisibilityEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Show this question conditionally
            </label>

            {hasConditionalVisibility && (
              <div className="space-y-3 rounded-lg border border-zinc-200 p-3 bg-zinc-50">
                {visibilityConditions.map((rawCondition, index) => {
                  const condition = normalizeVisibilityRule(rawCondition);
                  const conditionValue = stringifyRuleValue(condition.value);
                  const valuePlaceholder =
                    condition.operator === "in" || condition.operator === "not_in"
                      ? "Comma separated values, e.g. yes, maybe"
                      : condition.type === "user_preference" && condition.preference_key === "allergies"
                        ? "e.g. dairy"
                        : "e.g. yes";
                  return (
                    <div key={index} className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-zinc-600">Condition {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeVisibilityCondition(index)}
                          className="p-1.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50"
                          aria-label="Remove condition"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label>
                          <span className="mb-1 block text-xs font-medium text-zinc-600">Condition type</span>
                          <select
                            value={condition.type}
                            onChange={(e) =>
                              updateVisibilityCondition(index, {
                                type: e.target.value === "user_preference" ? "user_preference" : "question_answer",
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                          >
                            <option value="question_answer">Another question answer</option>
                            <option value="user_preference">User preference</option>
                          </select>
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium text-zinc-600">Operator</span>
                          <select
                            value={condition.operator}
                            onChange={(e) =>
                              updateVisibilityCondition(index, {
                                operator: (CONDITION_OPERATORS.some((item) => item.value === e.target.value)
                                  ? e.target.value
                                  : "equals") as ConditionOperator,
                                value: conditionValue,
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                          >
                            {CONDITION_OPERATORS.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {condition.type === "question_answer" ? (
                          <label>
                            <span className="mb-1 block text-xs font-medium text-zinc-600">Question key</span>
                            <input
                              type="text"
                              value={condition.question_key}
                              list="assessment-question-keys"
                              onChange={(e) => updateVisibilityCondition(index, { question_key: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
                              placeholder="e.g. consume_coffee_or_tea"
                            />
                            <datalist id="assessment-question-keys">
                              {availableParentKeys.map((key) => (
                                <option key={key} value={key} />
                              ))}
                            </datalist>
                          </label>
                        ) : (
                          <label>
                            <span className="mb-1 block text-xs font-medium text-zinc-600">Preference field</span>
                            <select
                              value={condition.preference_key}
                              onChange={(e) =>
                                updateVisibilityCondition(index, {
                                  preference_key:
                                    e.target.value === "diet_preference" || e.target.value === "allergies"
                                      ? e.target.value
                                      : "",
                                })
                              }
                              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                            >
                              <option value="">Select preference...</option>
                              {PREFILL_PREFERENCE_KEYS.map((key) => (
                                <option key={key} value={key}>
                                  {key}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>
                          <span className="mb-1 block text-xs font-medium text-zinc-600">Expected value</span>
                          <input
                            type="text"
                            value={conditionValue}
                            onChange={(e) => updateVisibilityCondition(index, { value: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            placeholder={valuePlaceholder}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={addVisibilityCondition}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add condition
                  </button>
                  {visibilityConditions.length > 1 && (
                    <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
                      Match
                      <select
                        value={matchMode}
                        onChange={(e) =>
                          persistVisibilityRules(
                            getEditableVisibilityConditions(),
                            e.target.value === "any" ? "any" : "all"
                          )
                        }
                        className="px-2 py-1 rounded border border-zinc-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      >
                        <option value="all">All conditions</option>
                        <option value="any">Any condition</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={Boolean(prefillPreferenceKey)}
                onChange={(e) =>
                  setField({
                    prefill_from: e.target.checked
                      ? { source: "user_preference", preference_key: "diet_preference" }
                      : null,
                  })
                }
                className="h-4 w-4 rounded border-zinc-300"
              />
              Auto-fill answer from user preference
            </label>

            {prefillPreferenceKey && (
              <label className="block max-w-md">
                <span className="mb-1 block text-xs font-medium text-zinc-600">Auto-fill source</span>
                <select
                  value={prefillPreferenceKey}
                  onChange={(e) =>
                    setField({
                      prefill_from: {
                        source: "user_preference",
                        preference_key: (e.target.value || "diet_preference") as "diet_preference" | "allergies",
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  {PREFILL_PREFERENCE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {mode === "add" && (
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
          <select
            value={value.status ?? "active"}
            onChange={(e) => setField({ status: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
          >
            {Q_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {cap(status)}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "edit" && onToggleStatus && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 border border-zinc-200">
          <div>
            <p className="text-sm font-medium text-zinc-700">Status</p>
            <StatusBadge status={currentStatus} />
          </div>
          <button
            type="button"
            onClick={onToggleStatus}
            disabled={togglingStatus}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 transition-colors"
          >
            {togglingStatus ? "Updating..." : currentStatus === "active" ? "Deactivate" : "Activate"}
          </button>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Saving..." : mode === "add" ? "Create Question" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
