import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  diagnosticTestsApi,
  getApiError,
  type DiagnosticTestStandalone,
  type HealthParameterCreatePayload,
  type HealthParameterUpdatePayload,
} from "../../lib/api";

type ModalMode = "add" | "edit";
type SortKey = "test_id" | "test_name" | "is_available" | "display_order";
type SortDir = "asc" | "desc";

function toNumberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const EMPTY_FORM = {
  test_name: "",
  is_available: true,

  parameter_key: "",
  unit: "",
  meaning: "",
  low_risk_lower_range_male: "",
  low_risk_higher_range_male: "",
  low_risk_lower_range_female: "",
  low_risk_higher_range_female: "",
  causes_when_high: "",
  causes_when_low: "",
  effects_when_high: "",
  effects_when_low: "",
  what_to_do_when_low: "",
  what_to_do_when_high: "",
};

export function HealthMetrics() {
  const [rows, setRows] = useState<DiagnosticTestStandalone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [editing, setEditing] = useState<DiagnosticTestStandalone | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("test_id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticTestsApi.list({ parameter_type: "metric" });
      setRows(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!successMessage) return;
    const t = window.setTimeout(() => setSuccessMessage(null), 4000);
    return () => window.clearTimeout(t);
  }, [successMessage]);

  const openCreate = useCallback(() => {
    setModalMode("add");
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = (row: DiagnosticTestStandalone) => {
    setModalMode("edit");
    setEditing(row);
    setForm({
      test_name: row.test_name,
      is_available: row.is_available,

      parameter_key: row.parameter_key ?? "",
      unit: row.unit ?? "",
      meaning: row.meaning ?? "",
      low_risk_lower_range_male: row.low_risk_lower_range_male != null ? String(row.low_risk_lower_range_male) : "",
      low_risk_higher_range_male: row.low_risk_higher_range_male != null ? String(row.low_risk_higher_range_male) : "",
      low_risk_lower_range_female: row.low_risk_lower_range_female != null ? String(row.low_risk_lower_range_female) : "",
      low_risk_higher_range_female: row.low_risk_higher_range_female != null ? String(row.low_risk_higher_range_female) : "",
      causes_when_high: row.causes_when_high ?? "",
      causes_when_low: row.causes_when_low ?? "",
      effects_when_high: row.effects_when_high ?? "",
      effects_when_low: row.effects_when_low ?? "",
      what_to_do_when_low: row.what_to_do_when_low ?? "",
      what_to_do_when_high: row.what_to_do_when_high ?? "",
    });
    setFormError(null);
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
    const next = rows.filter(
      (row) =>
        !q ||
        row.test_name.toLowerCase().includes(q) ||
        (row.parameter_key ?? "").toLowerCase().includes(q)
    );
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
    if (!form.test_name.trim()) {
      setFormError("Display name is required.");
      return;
    }
    if (modalMode === "add" && !form.parameter_key.trim()) {
      setFormError("Metric key is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const fields: HealthParameterUpdatePayload = {
        test_name: form.test_name.trim(),
        is_available: form.is_available,
        parameter_key: form.parameter_key.trim() ? form.parameter_key.trim() : undefined,
        unit: form.unit.trim() ? form.unit.trim() : undefined,
        meaning: form.meaning.trim() ? form.meaning.trim() : undefined,
        low_risk_lower_range_male: toNumberOrUndefined(form.low_risk_lower_range_male),
        low_risk_higher_range_male: toNumberOrUndefined(form.low_risk_higher_range_male),
        low_risk_lower_range_female: toNumberOrUndefined(form.low_risk_lower_range_female),
        low_risk_higher_range_female: toNumberOrUndefined(form.low_risk_higher_range_female),
        causes_when_high: form.causes_when_high.trim() ? form.causes_when_high.trim() : undefined,
        causes_when_low: form.causes_when_low.trim() ? form.causes_when_low.trim() : undefined,
        effects_when_high: form.effects_when_high.trim() ? form.effects_when_high.trim() : undefined,
        effects_when_low: form.effects_when_low.trim() ? form.effects_when_low.trim() : undefined,
        what_to_do_when_low: form.what_to_do_when_low.trim() ? form.what_to_do_when_low.trim() : undefined,
        what_to_do_when_high: form.what_to_do_when_high.trim() ? form.what_to_do_when_high.trim() : undefined,
      };
      if (modalMode === "add") {
        const createPayload: HealthParameterCreatePayload = {
          ...fields,
          parameter_type: "metric",
          test_name: form.test_name.trim(),
        };
        await diagnosticTestsApi.create(createPayload);
        setSuccessMessage("Health metric created.");
      } else if (editing) {
        await diagnosticTestsApi.update(editing.test_id, fields);
        setSuccessMessage("Health metric updated.");
      }
      setModalOpen(false);
      await fetchRows();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: DiagnosticTestStandalone) => {
    if (!window.confirm(`Delete health metric "${row.test_name}"?`)) return;
    try {
      await diagnosticTestsApi.delete(row.test_id);
      setSuccessMessage("Health metric deleted.");
      await fetchRows();
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const columns: Column<DiagnosticTestStandalone>[] = [
    {
      key: "test_name",
      label: "Display name",
      sortable: true,
      render: (row) => <span className="font-medium text-zinc-900">{row.test_name}</span>,
    },
    {
      key: "parameter_key",
      label: "Metric key",
      sortable: false,
      render: (row) =>
        row.parameter_key ? (
          <code className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-700">{row.parameter_key}</code>
        ) : (
          "—"
        ),
    },
    {
      key: "is_available",
      label: "Status",
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            row.is_available ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {row.is_available ? "active" : "inactive"}
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

  const hasFilters = Boolean(search.trim());
  const showEmpty = !loading && filteredRows.length === 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Health Metrics</h1>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Health Metric
        </button>
      </div>

      {successMessage ? (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{successMessage}</div>
      ) : null}

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900"
            placeholder="Search by display name or metric key..."
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
          </div>
        ) : showEmpty ? (
          <div className="py-12 text-center text-sm text-zinc-500">
            {hasFilters ? "No health metrics match your search." : "No health metrics yet."}
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
        title={modalMode === "add" ? "Add Health Metric" : "Edit Health Metric"}
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
              <label className="block text-sm font-medium text-zinc-700 mb-1">Display name *</label>
              <input
                type="text"
                value={form.test_name}
                onChange={(e) => setForm((prev) => ({ ...prev, test_name: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Metric key {modalMode === "add" ? "*" : ""}
              </label>
              {modalMode === "add" ? (
                <>
                  <input
                    type="text"
                    value={form.parameter_key}
                    onChange={(e) => setForm((prev) => ({ ...prev, parameter_key: e.target.value }))}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                    placeholder="oxidative_stress"
                    autoComplete="off"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Use snake_case, e.g. oxidative_stress</p>
                </>
              ) : (
                <input
                  type="text"
                  value={form.parameter_key}
                  readOnly
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50 text-zinc-600 cursor-not-allowed"
                />
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-zinc-700 leading-none sm:col-span-2">
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={(e) => setForm((prev) => ({ ...prev, is_available: e.target.checked }))}
                className="h-4 w-4"
              />
              Active (available)
            </label>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Unit</label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                placeholder="e.g. score"
              />
            </div>
            <div className="hidden sm:block" aria-hidden />

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Description</label>
              <textarea
                value={form.meaning}
                onChange={(e) => setForm((prev) => ({ ...prev, meaning: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="Optional description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Lower range (male)</label>
              <input
                type="number"
                value={form.low_risk_lower_range_male}
                onChange={(e) => setForm((prev) => ({ ...prev, low_risk_lower_range_male: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                step="any"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Higher range (male)</label>
              <input
                type="number"
                value={form.low_risk_higher_range_male}
                onChange={(e) => setForm((prev) => ({ ...prev, low_risk_higher_range_male: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                step="any"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Lower range (female)</label>
              <input
                type="number"
                value={form.low_risk_lower_range_female}
                onChange={(e) => setForm((prev) => ({ ...prev, low_risk_lower_range_female: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                step="any"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Higher range (female)</label>
              <input
                type="number"
                value={form.low_risk_higher_range_female}
                onChange={(e) => setForm((prev) => ({ ...prev, low_risk_higher_range_female: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                step="any"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Causes when high</label>
              <textarea
                value={form.causes_when_high}
                onChange={(e) => setForm((prev) => ({ ...prev, causes_when_high: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="Possible reasons / conditions"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Causes when low</label>
              <textarea
                value={form.causes_when_low}
                onChange={(e) => setForm((prev) => ({ ...prev, causes_when_low: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="Possible reasons / conditions"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Effects when high</label>
              <textarea
                value={form.effects_when_high}
                onChange={(e) => setForm((prev) => ({ ...prev, effects_when_high: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="What this may lead to"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Effects when low</label>
              <textarea
                value={form.effects_when_low}
                onChange={(e) => setForm((prev) => ({ ...prev, effects_when_low: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="What this may lead to"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">What to do when low</label>
              <textarea
                value={form.what_to_do_when_low}
                onChange={(e) => setForm((prev) => ({ ...prev, what_to_do_when_low: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                placeholder="Recommended next steps"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">What to do when high</label>
              <textarea
                value={form.what_to_do_when_high}
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
              {submitting ? "Saving..." : modalMode === "add" ? "Create" : "Save Changes"}
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
