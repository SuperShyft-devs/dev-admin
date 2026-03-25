import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  diagnosticTestsApi,
  getApiError,
  type DiagnosticTestStandalone,
} from "../../lib/api";

interface DiagnosticTestsProps {
  onRequestCreate?: (trigger: () => void) => void;
}

type ModalMode = "add" | "edit";
type SortKey = "test_id" | "test_name" | "is_available" | "display_order";
type SortDir = "asc" | "desc";

const EMPTY_FORM = {
  test_name: "",
  is_available: true,
  display_order: "",
};

export function DiagnosticTests({ onRequestCreate }: DiagnosticTestsProps) {
  const [rows, setRows] = useState<DiagnosticTestStandalone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [editing, setEditing] = useState<DiagnosticTestStandalone | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("test_id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchTests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticTestsApi.list();
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
    setModalOpen(true);
  }, []);

  useEffect(() => {
    onRequestCreate?.(openCreate);
  }, [onRequestCreate, openCreate]);

  const openEdit = (row: DiagnosticTestStandalone) => {
    setModalMode("edit");
    setEditing(row);
    setForm({
      test_name: row.test_name,
      is_available: row.is_available,
      display_order: row.display_order != null ? String(row.display_order) : "",
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
    if (!form.test_name.trim()) {
      setFormError("Test name is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        test_name: form.test_name.trim(),
        is_available: form.is_available,
        display_order: form.display_order.trim() ? Number(form.display_order) : undefined,
      };
      if (modalMode === "add") {
        await diagnosticTestsApi.create(payload);
      } else if (editing) {
        await diagnosticTestsApi.update(editing.test_id, payload);
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
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Test name</label>
            <input
              type="text"
              value={form.test_name}
              onChange={(e) => setForm((prev) => ({ ...prev, test_name: e.target.value }))}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Order</label>
            <input
              type="number"
              value={form.display_order}
              onChange={(e) => setForm((prev) => ({ ...prev, display_order: e.target.value }))}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.is_available}
              onChange={(e) => setForm((prev) => ({ ...prev, is_available: e.target.checked }))}
            />
            Available
          </label>
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
