import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { SortableItem } from "../../components/SortableItem";
import {
  diagnosticFilterChipsApi,
  getApiError,
  type DiagnosticFilterChip,
} from "../../lib/api";

interface DiagnosticFilterChipsProps {
  embedded?: boolean;
}

type ChipModalMode = "add" | "edit";

const EMPTY_FORM = {
  display_name: "",
  chip_key: "",
  display_order: "",
};

export function DiagnosticFilterChips({ embedded = false }: DiagnosticFilterChipsProps) {
  const [chips, setChips] = useState<DiagnosticFilterChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ChipModalMode>("add");
  const [editingChip, setEditingChip] = useState<DiagnosticFilterChip | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const fetchChips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticFilterChipsApi.list();
      setChips(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChips();
  }, [fetchChips]);

  const filteredRows = useMemo(() => {
    const rows = [...chips].sort(
      (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
    );
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (row) =>
        row.display_name.toLowerCase().includes(q) ||
        row.chip_key.toLowerCase().includes(q)
    );
  }, [chips, search]);

  const openAdd = () => {
    setModalMode("add");
    setEditingChip(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: DiagnosticFilterChip) => {
    setModalMode("edit");
    setEditingChip(row);
    setFormData({
      display_name: row.display_name ?? "",
      chip_key: row.chip_key ?? "",
      display_order: row.display_order != null ? String(row.display_order) : "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.display_name.trim() || !formData.chip_key.trim()) {
      setFormError("Display name and chip key are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        display_name: formData.display_name.trim(),
        chip_key: formData.chip_key.trim(),
        display_order: formData.display_order ? Number(formData.display_order) : undefined,
      };
      if (modalMode === "add") {
        await diagnosticFilterChipsApi.create(payload);
      } else if (editingChip) {
        await diagnosticFilterChipsApi.update(editingChip.filter_chip_id, payload);
      }
      setModalOpen(false);
      await fetchChips();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: DiagnosticFilterChip) => {
    setDeletingId(row.filter_chip_id);
    try {
      await diagnosticFilterChipsApi.delete(row.filter_chip_id);
      await fetchChips();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const persistOrder = async (rows: DiagnosticFilterChip[]) => {
    setReorderSaving(true);
    try {
      await Promise.all(
        rows.map((row, index) =>
          diagnosticFilterChipsApi.update(row.filter_chip_id, {
            display_order: index + 1,
          })
        )
      );
      await fetchChips();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setReorderSaving(false);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredRows.findIndex((row) => row.filter_chip_id === Number(active.id));
    const newIndex = filteredRows.findIndex((row) => row.filter_chip_id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const updated = arrayMove(filteredRows, oldIndex, newIndex);
    setChips((prev) => {
      const map = new Map(updated.map((r, idx) => [r.filter_chip_id, { ...r, display_order: idx + 1 }]));
      return prev.map((row) => map.get(row.filter_chip_id) ?? row);
    });
    void persistOrder(updated);
  };

  const columns: Column<DiagnosticFilterChip>[] = [
    { key: "display_name", label: "Display name", sortable: true },
    { key: "chip_key", label: "Chip key", sortable: true },
    { key: "display_order", label: "Order", sortable: true },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            (row.status ?? "").toLowerCase() === "active"
              ? "bg-green-50 text-green-700"
              : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {(row.status ?? "inactive").toLowerCase() === "active" ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  return (
    <div>
      {!embedded && (
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900 mb-6">Diagnostics filter chips</h1>
      )}

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900"
            placeholder="Search filter chips..."
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          Add filter chip
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
            keyExtractor={(row) => row.filter_chip_id}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
      </div>

      <div className="mt-4 bg-white rounded-xl border border-zinc-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-900">Drag to reorder</h2>
          {reorderSaving && <span className="text-xs text-zinc-500">Saving order...</span>}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={filteredRows.map((row) => row.filter_chip_id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <SortableItem
                  key={row.filter_chip_id}
                  id={row.filter_chip_id}
                  handle={<GripVertical className="w-4 h-4" />}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{row.display_name}</p>
                      <p className="text-xs text-zinc-500">{row.chip_key}</p>
                    </div>
                    <span className="text-xs text-zinc-500">#{row.display_order ?? "-"}</span>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "add" ? "Add filter chip" : "Edit filter chip"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Display name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, display_name: e.target.value }))}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Chip key</label>
            <input
              type="text"
              value={formData.chip_key}
              onChange={(e) => setFormData((prev) => ({ ...prev, chip_key: e.target.value }))}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Order</label>
            <input
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData((prev) => ({ ...prev, display_order: e.target.value }))}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : modalMode === "add" ? "Create filter chip" : "Save changes"}
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

      {deletingId != null && (
        <Modal open={deletingId != null} onClose={() => setDeletingId(null)} title="Delete filter chip">
          <p className="text-sm text-zinc-600 mb-4">This action cannot be undone.</p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => {
                const target = chips.find((item) => item.filter_chip_id === deletingId);
                if (target) {
                  void handleDelete(target);
                }
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <button
              type="button"
              onClick={() => setDeletingId(null)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
