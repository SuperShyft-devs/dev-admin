import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { SortableItem } from "../../components/SortableItem";
import {
  diagnosticFiltersApi,
  diagnosticPackagesApi,
  getApiError,
  type DiagnosticFilter,
} from "../../lib/api";

interface DiagnosticFiltersProps {
  embedded?: boolean;
}

type FilterModalMode = "add" | "edit";

const EMPTY_FILTER = {
  display_name: "",
  filter_key: "",
  filter_type: "tag",
  display_order: "",
};

export function DiagnosticFilters({ embedded = false }: DiagnosticFiltersProps) {
  const [filters, setFilters] = useState<DiagnosticFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<FilterModalMode>("add");
  const [editingFilter, setEditingFilter] = useState<DiagnosticFilter | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FILTER);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const fetchFilters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticFiltersApi.list();
      setFilters(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTagOptions = useCallback(async () => {
    try {
      const res = await diagnosticPackagesApi.list({ include_inactive: true });
      const options = Array.from(
        new Set(
          (res.data.data ?? []).flatMap((row) =>
            (row.tags ?? [])
              .map((tag) => tag.tag_name?.trim())
              .filter((tagName): tagName is string => !!tagName)
          )
        )
      ).sort((a, b) => a.localeCompare(b));
      setTagOptions(options);
    } catch {
      setTagOptions([]);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    void fetchTagOptions();
  }, [fetchTagOptions]);

  const filteredRows = useMemo(() => {
    const rows = [...filters].sort(
      (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
    );
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (row) =>
        row.display_name.toLowerCase().includes(q) ||
        row.filter_key.toLowerCase().includes(q) ||
        String(row.filter_type ?? "").toLowerCase().includes(q)
    );
  }, [filters, search]);

  const filteredTagOptions = useMemo(() => {
    const query = formData.filter_key.trim().toLowerCase();
    if (!query) return tagOptions;
    return tagOptions.filter((tagName) => tagName.toLowerCase().includes(query));
  }, [tagOptions, formData.filter_key]);

  const openAdd = () => {
    setModalMode("add");
    setEditingFilter(null);
    setFormData(EMPTY_FILTER);
    setFormError(null);
    setShowTagSuggestions(false);
    setModalOpen(true);
  };

  const openEdit = (row: DiagnosticFilter) => {
    setModalMode("edit");
    setEditingFilter(row);
    setFormData({
      display_name: row.display_name ?? "",
      filter_key: row.filter_key ?? "",
      filter_type: row.filter_type ?? "tag",
      display_order: row.display_order != null ? String(row.display_order) : "",
    });
    setFormError(null);
    setShowTagSuggestions(false);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.display_name.trim() || !formData.filter_key.trim()) {
      setFormError("Display name and filter key are required.");
      return;
    }
    if (formData.filter_type === "tag") {
      const tagMap = new Map(tagOptions.map((tag) => [tag.toLowerCase(), tag]));
      const canonicalTag = tagMap.get(formData.filter_key.trim().toLowerCase());
      if (!canonicalTag) {
        setFormError("Please choose an existing tag from suggestions.");
        return;
      }
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payloadFilterKey =
        formData.filter_type === "tag"
          ? tagOptions.find((tag) => tag.toLowerCase() === formData.filter_key.trim().toLowerCase()) ??
            formData.filter_key.trim()
          : formData.filter_key.trim();
      const payload = {
        display_name: formData.display_name.trim(),
        filter_key: payloadFilterKey,
        filter_type: formData.filter_type || "tag",
        display_order: formData.display_order ? Number(formData.display_order) : undefined,
      };
      if (modalMode === "add") {
        await diagnosticFiltersApi.create(payload);
      } else if (editingFilter) {
        await diagnosticFiltersApi.update(editingFilter.filter_id, payload);
      }
      setModalOpen(false);
      await fetchFilters();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: DiagnosticFilter) => {
    setDeletingId(row.filter_id);
    try {
      await diagnosticFiltersApi.delete(row.filter_id);
      await fetchFilters();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const persistOrder = async (rows: DiagnosticFilter[]) => {
    setReorderSaving(true);
    try {
      await Promise.all(
        rows.map((row, index) =>
          diagnosticFiltersApi.update(row.filter_id, {
            display_order: index + 1,
          })
        )
      );
      await fetchFilters();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setReorderSaving(false);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredRows.findIndex((row) => row.filter_id === Number(active.id));
    const newIndex = filteredRows.findIndex((row) => row.filter_id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const updated = arrayMove(filteredRows, oldIndex, newIndex);
    setFilters((prev) => {
      const map = new Map(updated.map((r, idx) => [r.filter_id, { ...r, display_order: idx + 1 }]));
      return prev.map((row) => map.get(row.filter_id) ?? row);
    });
    void persistOrder(updated);
  };

  const columns: Column<DiagnosticFilter>[] = [
    { key: "display_name", label: "Display name", sortable: true },
    { key: "filter_key", label: "Filter key", sortable: true },
    { key: "filter_type", label: "Filter type", sortable: true },
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
      {!embedded && <h1 className="text-lg sm:text-xl font-semibold text-zinc-900 mb-6">Diagnostics Filters</h1>}

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900"
            placeholder="Search filters..."
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          Add Filter
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
            keyExtractor={(row) => row.filter_id}
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
          <SortableContext items={filteredRows.map((row) => row.filter_id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <SortableItem
                  key={row.filter_id}
                  id={row.filter_id}
                  handle={<GripVertical className="w-4 h-4" />}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{row.display_name}</p>
                      <p className="text-xs text-zinc-500">
                        {row.filter_key} · {row.filter_type ?? "tag"}
                      </p>
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
        title={modalMode === "add" ? "Add Filter" : "Edit Filter"}
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
            <label className="block text-sm font-medium text-zinc-700 mb-1">Filter key</label>
            {formData.filter_type === "tag" ? (
              <div className="relative">
                <input
                  type="text"
                  value={formData.filter_key}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, filter_key: e.target.value }));
                    setShowTagSuggestions(true);
                  }}
                  onFocus={() => setShowTagSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => setShowTagSuggestions(false), 120);
                  }}
                  placeholder={tagOptions.length ? "Type to search tags..." : "No tags available"}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                  autoComplete="off"
                  required
                />
                {showTagSuggestions && formData.filter_type === "tag" && (
                  <div className="absolute z-20 mt-1 w-full max-h-44 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
                    {filteredTagOptions.length > 0 ? (
                      filteredTagOptions.map((tagName) => (
                        <button
                          key={tagName}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setFormData((prev) => ({ ...prev, filter_key: tagName }));
                            setShowTagSuggestions(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                        >
                          {tagName}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-zinc-500">No matching tags</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <input
                type="text"
                value={formData.filter_key}
                onChange={(e) => setFormData((prev) => ({ ...prev, filter_key: e.target.value }))}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                required
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Filter type</label>
              <select
                value={formData.filter_type}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    filter_type: e.target.value,
                    filter_key:
                      e.target.value === "tag" && !tagOptions.includes(prev.filter_key)
                        ? ""
                        : prev.filter_key,
                  }))
                }
                onBlur={() => setShowTagSuggestions(false)}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-zinc-900"
              >
                <option value="gender">gender</option>
                <option value="tag">tag</option>
              </select>
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
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : modalMode === "add" ? "Create Filter" : "Save Changes"}
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
        <Modal open={deletingId != null} onClose={() => setDeletingId(null)} title="Delete filter">
          <p className="text-sm text-zinc-600 mb-4">This action cannot be undone.</p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => {
                const target = filters.find((item) => item.filter_id === deletingId);
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
