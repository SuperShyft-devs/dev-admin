import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  questionnaireHealthyHabitRulesApi,
  type QuestionnaireHealthyHabitRule,
  type QuestionnaireHealthyHabitRulePayload,
  type QuestionnaireQuestion,
  getApiError,
} from "../../../lib/api";

interface HealthyHabitRulesPanelProps {
  question: QuestionnaireQuestion;
}

export function HealthyHabitRulesPanel({ question }: HealthyHabitRulesPanelProps) {
  const [rules, setRules] = useState<QuestionnaireHealthyHabitRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    habit_key: "",
    habit_label: "",
    display_order: "",
    condition_type: "option_match" as "option_match" | "scale_range",
    matched_option_values: [] as string[],
    scale_min: "",
    scale_max: "",
    scale_unit: "",
    status: "active",
  });

  const resetForm = useCallback((questionType?: string | null) => {
    setEditingId(null);
    setFormError(null);
    setForm({
      habit_key: "",
      habit_label: "",
      display_order: "",
      condition_type: questionType === "scale" ? "scale_range" : "option_match",
      matched_option_values: [],
      scale_min: "",
      scale_max: "",
      scale_unit: "",
      status: "active",
    });
  }, []);

  const fetchRules = useCallback(async () => {
    if (!question.question_id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await questionnaireHealthyHabitRulesApi.list(question.question_id);
      setRules(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [question.question_id]);

  useEffect(() => {
    if (question.question_type === "text") {
      setRules([]);
      resetForm("text");
      return;
    }
    resetForm(question.question_type);
    void fetchRules();
  }, [question.question_id, question.question_type, fetchRules, resetForm]);

  const buildPayload = (): QuestionnaireHealthyHabitRulePayload => {
    const displayRaw = form.display_order.trim();
    let displayOrder: number | null = null;
    if (displayRaw !== "") {
      const n = Number.parseInt(displayRaw, 10);
      if (Number.isNaN(n)) throw new Error("Display order must be a whole number.");
      displayOrder = n;
    }
    const base: QuestionnaireHealthyHabitRulePayload = {
      habit_key: form.habit_key.trim() || null,
      habit_label: form.habit_label.trim(),
      display_order: displayOrder,
      condition_type: form.condition_type,
      status: form.status,
      matched_option_values: null,
      scale_min: null,
      scale_max: null,
      scale_unit: null,
    };
    if (!base.habit_label) throw new Error("Habit label is required.");
    if (form.condition_type === "option_match") {
      if (form.matched_option_values.length === 0) {
        throw new Error("Select at least one option that counts as this habit.");
      }
      base.matched_option_values = [...form.matched_option_values];
      return base;
    }
    const lo = Number.parseFloat(form.scale_min);
    const hi = Number.parseFloat(form.scale_max);
    if (Number.isNaN(lo) || Number.isNaN(hi)) throw new Error("Scale min and max must be valid numbers.");
    if (!form.scale_unit.trim()) throw new Error("Select the unit for the scale range.");
    base.scale_min = lo;
    base.scale_max = hi;
    base.scale_unit = form.scale_unit.trim();
    return base;
  };

  const handleSave = async () => {
    if (!question.question_id) return;
    setFormError(null);
    let payload: QuestionnaireHealthyHabitRulePayload;
    try {
      payload = buildPayload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Invalid form.");
      return;
    }
    setSaving(true);
    try {
      if (editingId != null) {
        await questionnaireHealthyHabitRulesApi.update(question.question_id, editingId, payload);
      } else {
        await questionnaireHealthyHabitRulesApi.create(question.question_id, payload);
      }
      await fetchRules();
      resetForm(question.question_type);
      setFormOpen(false);
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: number) => {
    if (!question.question_id) return;
    setSaving(true);
    setFormError(null);
    try {
      await questionnaireHealthyHabitRulesApi.delete(question.question_id, ruleId);
      await fetchRules();
      if (editingId === ruleId) {
        resetForm(question.question_type);
        setFormOpen(false);
      }
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (rule: QuestionnaireHealthyHabitRule) => {
    setEditingId(rule.rule_id);
    setFormError(null);
    setFormOpen(true);
    setForm({
      habit_key: rule.habit_key ?? "",
      habit_label: rule.habit_label,
      display_order: rule.display_order != null ? String(rule.display_order) : "",
      condition_type: rule.condition_type === "scale_range" ? "scale_range" : "option_match",
      matched_option_values: rule.matched_option_values ? [...rule.matched_option_values] : [],
      scale_min: rule.scale_min != null ? String(rule.scale_min) : "",
      scale_max: rule.scale_max != null ? String(rule.scale_max) : "",
      scale_unit: rule.scale_unit ?? "",
      status: rule.status ?? "active",
    });
  };

  if (question.question_type === "text") {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-4 text-sm text-zinc-500">
        Healthy habit rules are not available for free-text questions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">Healthy habit rules</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            When a participant&apos;s answer matches a rule, the habit can appear in their report overview.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading rules…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-zinc-500">No rules yet.</p>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.rule_id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border border-zinc-200 bg-zinc-50 text-sm"
              >
                <div>
                  <span className="font-medium text-zinc-900">{rule.habit_label}</span>
                  {rule.habit_key && (
                    <span className="ml-2 font-mono text-xs text-zinc-500">{rule.habit_key}</span>
                  )}
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {rule.condition_type}
                    {rule.condition_type === "option_match" && rule.matched_option_values?.length
                      ? ` · ${rule.matched_option_values.join(", ")}`
                      : ""}
                    {rule.condition_type === "scale_range"
                      ? ` · ${rule.scale_unit ?? ""} ${rule.scale_min ?? ""}–${rule.scale_max ?? ""}`
                      : ""}
                    {" · "}
                    order {rule.display_order ?? "—"} · {rule.status}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(rule)}
                    className="px-2 py-1 text-xs rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(rule.rule_id)}
                    disabled={saving}
                    className="px-2 py-1 text-xs rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!formOpen && (
          <button
            type="button"
            onClick={() => {
              resetForm(question.question_type);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Add rule
          </button>
        )}
      </div>

      {formOpen && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-zinc-900">
            {editingId != null ? "Edit rule" : "New rule"}
          </p>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-600 sm:col-span-2">
              Habit label *
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.habit_label}
                onChange={(e) => setForm((p) => ({ ...p, habit_label: e.target.value }))}
                placeholder="e.g. No Alcohol"
              />
            </label>
            <label className="block text-xs text-zinc-600">
              Habit key (optional)
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.habit_key}
                onChange={(e) => setForm((p) => ({ ...p, habit_key: e.target.value }))}
                placeholder="slug_for_app"
              />
            </label>
            <label className="block text-xs text-zinc-600">
              Display order
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={form.display_order}
                onChange={(e) => setForm((p) => ({ ...p, display_order: e.target.value }))}
                placeholder="lower first"
              />
            </label>
            <label className="block text-xs text-zinc-600 sm:col-span-2">
              Condition
              <select
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                value={form.condition_type}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    condition_type: e.target.value as "option_match" | "scale_range",
                    matched_option_values: [],
                    scale_min: "",
                    scale_max: "",
                    scale_unit: "",
                  }))
                }
              >
                <option value="option_match">Option match (single / multiple choice)</option>
                {question.question_type === "scale" && <option value="scale_range">Scale range</option>}
              </select>
            </label>
            {form.condition_type === "option_match" && question.options && question.options.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs text-zinc-600 mb-1">Matching option values</p>
                <div className="flex flex-wrap gap-2">
                  {question.options.map((opt) => {
                    const v = opt.option_value ?? "";
                    const checked = form.matched_option_values.includes(v);
                    return (
                      <label key={v} className="inline-flex items-center gap-1 text-xs text-zinc-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setForm((p) => ({
                              ...p,
                              matched_option_values: checked
                                ? p.matched_option_values.filter((x) => x !== v)
                                : [...p.matched_option_values, v],
                            }))
                          }
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        <span className="font-mono">{v}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {form.condition_type === "scale_range" && (
              <>
                <label className="block text-xs text-zinc-600 sm:col-span-2">
                  Unit
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                    value={form.scale_unit}
                    onChange={(e) => setForm((p) => ({ ...p, scale_unit: e.target.value }))}
                  >
                    <option value="">Select unit</option>
                    {(question.options ?? []).map((opt) => (
                      <option key={opt.option_value} value={opt.option_value ?? ""}>
                        {opt.option_value} — {opt.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-zinc-600">
                  Min (inclusive)
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    value={form.scale_min}
                    onChange={(e) => setForm((p) => ({ ...p, scale_min: e.target.value }))}
                  />
                </label>
                <label className="block text-xs text-zinc-600">
                  Max (inclusive)
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    value={form.scale_max}
                    onChange={(e) => setForm((p) => ({ ...p, scale_max: e.target.value }))}
                  />
                </label>
              </>
            )}
            <label className="block text-xs text-zinc-600 sm:col-span-2">
              Rule status
              <select
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId != null ? "Update rule" : "Add rule"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm(question.question_type);
                setFormOpen(false);
              }}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
