import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  diagnosticTestsApi,
  getApiError,
  type DiagnosticTestStandalone,
  type HealthParameterCreatePayload,
  type HealthParameterUpdatePayload,
} from "../../lib/api";

interface DiagnosticTestsProps {
  onRequestCreate?: (trigger: () => void) => void;
}

type ModalMode = "add" | "edit";
type SortKey = "test_id" | "test_name" | "is_available" | "display_order";
type SortDir = "asc" | "desc";
type GenderTab = "male" | "female";

function toNumberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const RANGE_KEYS_MALE = [
  "low_risk_lower_range_male",
  "low_risk_higher_range_male",
  "moderate_risk_lower_range_male",
  "moderate_risk_higher_range_male",
  "high_risk_lower_range_male",
  "high_risk_higher_range_male",
] as const;

const RANGE_KEYS_FEMALE = [
  "low_risk_lower_range_female",
  "low_risk_higher_range_female",
  "moderate_risk_lower_range_female",
  "moderate_risk_higher_range_female",
  "high_risk_lower_range_female",
  "high_risk_higher_range_female",
] as const;

type RangeKey = (typeof RANGE_KEYS_MALE)[number] | (typeof RANGE_KEYS_FEMALE)[number];

const EMPTY_FORM: Record<string, string | boolean> = {
  test_name: "",
  is_available: true,
  price: "",
  original_price: "",
  is_most_popular: false,
  gender_suitability: "",
  parameter_key: "",
  unit: "",
  meaning: "",
  low_risk_lower_range_male: "",
  low_risk_higher_range_male: "",
  moderate_risk_lower_range_male: "",
  moderate_risk_higher_range_male: "",
  high_risk_lower_range_male: "",
  high_risk_higher_range_male: "",
  low_risk_lower_range_female: "",
  low_risk_higher_range_female: "",
  moderate_risk_lower_range_female: "",
  moderate_risk_higher_range_female: "",
  high_risk_lower_range_female: "",
  high_risk_higher_range_female: "",
  causes_when_high: "",
  causes_when_low: "",
  effects_when_high: "",
  effects_when_low: "",
  what_to_do_when_low: "",
  what_to_do_when_high: "",
};

const RISK_TIERS = [
  {
    key: "low_risk",
    label: "Low Risk (Normal)",
    color: "emerald",
    dot: "bg-emerald-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
  },
  {
    key: "moderate_risk",
    label: "Moderate Risk",
    color: "amber",
    dot: "bg-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
  },
  {
    key: "high_risk",
    label: "High Risk",
    color: "red",
    dot: "bg-red-500",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
  },
] as const;

function RangeInputPair({
  lowerKey,
  higherKey,
  form,
  setForm,
}: {
  lowerKey: RangeKey;
  higherKey: RangeKey;
  form: Record<string, string | boolean>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string | boolean>>>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Lower</label>
        <input
          type="number"
          value={form[lowerKey] as string}
          onChange={(e) => setForm((prev) => ({ ...prev, [lowerKey]: e.target.value }))}
          className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-zinc-900"
          step="any"
          placeholder="—"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Upper</label>
        <input
          type="number"
          value={form[higherKey] as string}
          onChange={(e) => setForm((prev) => ({ ...prev, [higherKey]: e.target.value }))}
          className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-zinc-900"
          step="any"
          placeholder="—"
        />
      </div>
    </div>
  );
}

function RiskRangesPanel({
  gender,
  form,
  setForm,
}: {
  gender: GenderTab;
  form: Record<string, string | boolean>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string | boolean>>>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    low_risk: true,
    moderate_risk: false,
    high_risk: false,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-2">
      {RISK_TIERS.map((tier) => {
        const lowerKey = `${tier.key}_lower_range_${gender}` as RangeKey;
        const higherKey = `${tier.key}_higher_range_${gender}` as RangeKey;
        const hasValues = !!(form[lowerKey] as string)?.trim() || !!(form[higherKey] as string)?.trim();
        const isOpen = expanded[tier.key];

        return (
          <div key={tier.key} className={`rounded-lg border ${tier.border} overflow-hidden`}>
            <button
              type="button"
              onClick={() => toggle(tier.key)}
              className={`w-full flex items-center justify-between px-3 py-2 ${tier.bg} text-left`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${tier.dot}`} />
                <span className={`text-sm font-medium ${tier.text}`}>{tier.label}</span>
                {hasValues && !isOpen && (
                  <span className="text-xs text-zinc-500 ml-1">
                    ({(form[lowerKey] as string) || "—"} – {(form[higherKey] as string) || "—"})
                  </span>
                )}
              </span>
              <ChevronDown
                className={`w-4 h-4 ${tier.text} transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="px-3 py-3 bg-white">
                <RangeInputPair
                  lowerKey={lowerKey}
                  higherKey={higherKey}
                  form={form}
                  setForm={setForm}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DiagnosticTests({ onRequestCreate }: DiagnosticTestsProps) {
  const [rows, setRows] = useState<DiagnosticTestStandalone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [editing, setEditing] = useState<DiagnosticTestStandalone | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("test_id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [genderTab, setGenderTab] = useState<GenderTab>("male");

  const fetchTests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticTestsApi.list({ parameter_type: "test" });
      setRows(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTests();
  }, [fetchTests]);

  const openCreate = useCallback(() => {
    setModalMode("add");
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setGenderTab("male");
    setModalOpen(true);
  }, []);

  useEffect(() => {
    onRequestCreate?.(openCreate);
  }, [onRequestCreate, openCreate]);

  const openEdit = (row: DiagnosticTestStandalone) => {
    setModalMode("edit");
    setEditing(row);
    const toStr = (v: number | null | undefined) => (v != null ? String(v) : "");
    setForm({
      test_name: row.test_name,
      is_available: row.is_available,
      price: toStr(row.price),
      original_price: toStr(row.original_price),
      is_most_popular: !!row.is_most_popular,
      gender_suitability: row.gender_suitability ?? "",
      parameter_key: row.parameter_key ?? "",
      unit: row.unit ?? "",
      meaning: row.meaning ?? "",
      low_risk_lower_range_male: toStr(row.low_risk_lower_range_male),
      low_risk_higher_range_male: toStr(row.low_risk_higher_range_male),
      moderate_risk_lower_range_male: toStr(row.moderate_risk_lower_range_male),
      moderate_risk_higher_range_male: toStr(row.moderate_risk_higher_range_male),
      high_risk_lower_range_male: toStr(row.high_risk_lower_range_male),
      high_risk_higher_range_male: toStr(row.high_risk_higher_range_male),
      low_risk_lower_range_female: toStr(row.low_risk_lower_range_female),
      low_risk_higher_range_female: toStr(row.low_risk_higher_range_female),
      moderate_risk_lower_range_female: toStr(row.moderate_risk_lower_range_female),
      moderate_risk_higher_range_female: toStr(row.moderate_risk_higher_range_female),
      high_risk_lower_range_female: toStr(row.high_risk_lower_range_female),
      high_risk_higher_range_female: toStr(row.high_risk_higher_range_female),
      causes_when_high: row.causes_when_high ?? "",
      causes_when_low: row.causes_when_low ?? "",
      effects_when_high: row.effects_when_high ?? "",
      effects_when_low: row.effects_when_low ?? "",
      what_to_do_when_low: row.what_to_do_when_low ?? "",
      what_to_do_when_high: row.what_to_do_when_high ?? "",
    });
    setFormError(null);
    setGenderTab("male");
    setModalOpen(true);
  };

  const handleSort = (key: string) => {
    const nextKey = key as SortKey;
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDir("asc");
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = rows.filter((row) => !q || row.test_name.toLowerCase().includes(q));
    next.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";
      if (sortKey === "test_id") {
        left = a.test_id;
        right = b.test_id;
      } else if (sortKey === "test_name") {
        left = a.test_name.toLowerCase();
        right = b.test_name.toLowerCase();
      } else if (sortKey === "is_available") {
        left = a.is_available ? 1 : 0;
        right = b.is_available ? 1 : 0;
      } else {
        left = a.display_order ?? Number.MAX_SAFE_INTEGER;
        right = b.display_order ?? Number.MAX_SAFE_INTEGER;
      }
      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return next;
  }, [rows, search, sortDir, sortKey]);

  const handleSubmit = async () => {
    if (!(form.test_name as string).trim()) {
      setFormError("Test name is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const s = (key: string) => {
        const v = form[key] as string;
        return v.trim() ? v.trim() : undefined;
      };

      const fields: HealthParameterUpdatePayload = {
        test_name: (form.test_name as string).trim(),
        is_available: form.is_available as boolean,
        parameter_key: s("parameter_key"),
        unit: s("unit"),
        meaning: s("meaning"),
        low_risk_lower_range_male: toNumberOrUndefined(form.low_risk_lower_range_male as string),
        low_risk_higher_range_male: toNumberOrUndefined(form.low_risk_higher_range_male as string),
        moderate_risk_lower_range_male: toNumberOrUndefined(form.moderate_risk_lower_range_male as string),
        moderate_risk_higher_range_male: toNumberOrUndefined(form.moderate_risk_higher_range_male as string),
        high_risk_lower_range_male: toNumberOrUndefined(form.high_risk_lower_range_male as string),
        high_risk_higher_range_male: toNumberOrUndefined(form.high_risk_higher_range_male as string),
        low_risk_lower_range_female: toNumberOrUndefined(form.low_risk_lower_range_female as string),
        low_risk_higher_range_female: toNumberOrUndefined(form.low_risk_higher_range_female as string),
        moderate_risk_lower_range_female: toNumberOrUndefined(form.moderate_risk_lower_range_female as string),
        moderate_risk_higher_range_female: toNumberOrUndefined(form.moderate_risk_higher_range_female as string),
        high_risk_lower_range_female: toNumberOrUndefined(form.high_risk_lower_range_female as string),
        high_risk_higher_range_female: toNumberOrUndefined(form.high_risk_higher_range_female as string),
        causes_when_high: s("causes_when_high"),
        causes_when_low: s("causes_when_low"),
        effects_when_high: s("effects_when_high"),
        effects_when_low: s("effects_when_low"),
        what_to_do_when_low: s("what_to_do_when_low"),
        what_to_do_when_high: s("what_to_do_when_high"),
        price: toNumberOrUndefined(form.price as string),
        original_price: toNumberOrUndefined(form.original_price as string),
        is_most_popular: form.is_most_popular as boolean,
        gender_suitability: (form.gender_suitability as string).trim() || undefined,
      };
      if (modalMode === "add") {
        const createPayload: HealthParameterCreatePayload = {
          ...fields,
          parameter_type: "test",
          test_name: (form.test_name as string).trim(),
        };
        await diagnosticTestsApi.create(createPayload);
      } else if (editing) {
        await diagnosticTestsApi.update(editing.test_id, fields);
      }
      setModalOpen(false);
      await fetchTests();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: DiagnosticTestStandalone) => {
    if (!window.confirm(`Delete test "${row.test_name}"?`)) return;
    try {
      await diagnosticTestsApi.delete(row.test_id);
      await fetchTests();
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const columns: Column<DiagnosticTestStandalone>[] = [
    {
      key: "test_name",
      label: "Test name",
      sortable: true,
      render: (row) => <span className="font-medium text-zinc-900">{row.test_name}</span>,
    },
    {
      key: "is_available",
      label: "Available",
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            row.is_available ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {row.is_available ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "display_order",
      label: "Order",
      sortable: true,
      render: (row) => row.display_order ?? "—",
    },
  ];

  return (
    <div>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900"
            placeholder="Search tests..."
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          Add Test
        </button>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRows}
            keyExtractor={(row) => row.test_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "add" ? "Add Test" : "Edit Test"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          {formError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Test name *</label>
              <input
                type="text"
                value={form.test_name as string}
                onChange={(e) => setForm((prev) => ({ ...prev, test_name: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                required
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700 leading-none">
              <input
                type="checkbox"
                checked={form.is_available as boolean}
                onChange={(e) => setForm((prev) => ({ ...prev, is_available: e.target.checked }))}
                className="h-4 w-4"
              />
              Available
            </label>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Price</label>
              <input
                type="number"
                value={form.price as string}
                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                step="any"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Original price</label>
              <input
                type="number"
                value={form.original_price as string}
                onChange={(e) => setForm((prev) => ({ ...prev, original_price: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                step="any"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Gender suitability</label>
              <select
                value={form.gender_suitability as string}
                onChange={(e) => setForm((prev) => ({ ...prev, gender_suitability: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">Select</option>
                <option value="male">male</option>
                <option value="female">female</option>
                <option value="both">both</option>
              </select>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700 leading-none sm:col-span-2">
              <input
                type="checkbox"
                checked={form.is_most_popular as boolean}
                onChange={(e) => setForm((prev) => ({ ...prev, is_most_popular: e.target.checked }))}
                className="h-4 w-4"
              />
              Most popular
            </label>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Parameter key</label>
              <input
                type="text"
                value={form.parameter_key as string}
                onChange={(e) => setForm((prev) => ({ ...prev, parameter_key: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                placeholder="e.g. haemoglobin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Unit</label>
              <input
                type="text"
                value={form.unit as string}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                placeholder="e.g. g/dL"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Meaning</label>
              <textarea
                value={form.meaning as string}
                onChange={(e) => setForm((prev) => ({ ...prev, meaning: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="What this parameter indicates"
              />
            </div>
          </div>

          {/* Reference Ranges by Gender */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-2">Reference ranges</label>
            <div className="flex gap-1 mb-3 bg-zinc-100 rounded-lg p-1">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenderTab(g)}
                  className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                    genderTab === g
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  {g === "male" ? "Male" : "Female"}
                </button>
              ))}
            </div>
            <RiskRangesPanel gender={genderTab} form={form} setForm={setForm} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Causes when high</label>
              <textarea
                value={form.causes_when_high as string}
                onChange={(e) => setForm((prev) => ({ ...prev, causes_when_high: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="Possible reasons / conditions"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Causes when low</label>
              <textarea
                value={form.causes_when_low as string}
                onChange={(e) => setForm((prev) => ({ ...prev, causes_when_low: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="Possible reasons / conditions"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Effects when high</label>
              <textarea
                value={form.effects_when_high as string}
                onChange={(e) => setForm((prev) => ({ ...prev, effects_when_high: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="What this may lead to"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Effects when low</label>
              <textarea
                value={form.effects_when_low as string}
                onChange={(e) => setForm((prev) => ({ ...prev, effects_when_low: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="What this may lead to"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">What to do when low</label>
              <textarea
                value={form.what_to_do_when_low as string}
                onChange={(e) => setForm((prev) => ({ ...prev, what_to_do_when_low: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="Recommended next steps"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">What to do when high</label>
              <textarea
                value={form.what_to_do_when_high as string}
                onChange={(e) => setForm((prev) => ({ ...prev, what_to_do_when_high: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="Recommended next steps"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : modalMode === "add" ? "Create Test" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
