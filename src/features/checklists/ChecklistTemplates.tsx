import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { SortableItem } from "../../components/SortableItem";
import {
  checklistTemplatesApi,
  getApiError,
  type ChecklistTemplate,
  type ChecklistTemplateDetail,
  type ChecklistTemplateItem,
} from "../../lib/api";

type TemplateRow = ChecklistTemplate & { itemsCount: number };

function sortItems(items: ChecklistTemplateItem[]) {
  return [...items].sort((a, b) => {
    const ao = a.display_order ?? 999999;
    const bo = b.display_order ?? 999999;
    if (ao !== bo) return ao - bo;
    return a.item_id - b.item_id;
  });
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function truncate(s: string | null | undefined, max: number) {
  if (!s?.trim()) return "—";
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function ChecklistTemplates() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDetail, setDrawerDetail] = useState<ChecklistTemplateDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAudience, setFormAudience] = useState<"internal" | "user">("internal");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<TemplateRow | null>(null);
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);

  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [addItemSubmitting, setAddItemSubmitting] = useState(false);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemDescription, setEditItemDescription] = useState("");
  const [editItemSubmitting, setEditItemSubmitting] = useState(false);

  const [deleteItemTarget, setDeleteItemTarget] = useState<ChecklistTemplateItem | null>(null);
  const [deleteItemSubmitting, setDeleteItemSubmitting] = useState(false);

  const [reorderSaving, setReorderSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await checklistTemplatesApi.list();
      const templates = res.data.data;
      const enriched: TemplateRow[] = await Promise.all(
        templates.map(async (t) => {
          try {
            const d = await checklistTemplatesApi.get(t.template_id);
            return { ...t, itemsCount: d.data.data.items?.length ?? 0 };
          } catch {
            return { ...t, itemsCount: 0 };
          }
        })
      );
      setRows(enriched);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const refreshDrawer = useCallback(async (templateId: number) => {
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const d = await checklistTemplatesApi.get(templateId);
      setDrawerDetail(d.data.data);
    } catch (err) {
      setDrawerError(getApiError(err));
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const openDrawer = useCallback(
    async (t: ChecklistTemplate) => {
      setDrawerOpen(true);
      setDrawerDetail(null);
      setEditingItemId(null);
      setDrawerError(null);
      await refreshDrawer(t.template_id);
    },
    [refreshDrawer]
  );

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerDetail(null);
    setEditingItemId(null);
    void fetchRows();
  };

  const openAddModal = () => {
    setModalMode("add");
    setEditingTemplate(null);
    setFormName("");
    setFormDescription("");
    setFormAudience("internal");
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (t: ChecklistTemplate) => {
    setModalMode("edit");
    setEditingTemplate(t);
    setFormName(t.name);
    setFormDescription(t.description ?? "");
    setFormAudience(t.audience ?? "internal");
    setFormError(null);
    setModalOpen(true);
  };

  const handleFormSubmit = async () => {
    const name = formName.trim();
    if (!name) {
      setFormError("Name is required");
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    try {
      if (modalMode === "add") {
        await checklistTemplatesApi.create({
          name,
          description: formDescription.trim() || undefined,
          audience: formAudience,
        });
      } else if (editingTemplate) {
        await checklistTemplatesApi.update(editingTemplate.template_id, {
          name,
          description: formDescription.trim() || undefined,
          audience: formAudience,
        });
      }
      setModalOpen(false);
      await fetchRows();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleStatus = async (t: TemplateRow) => {
    const next = (t.status ?? "").toLowerCase() === "active" ? "inactive" : "active";
    setError(null);
    try {
      await checklistTemplatesApi.updateStatus(t.template_id, { status: next });
      await fetchRows();
      if (drawerDetail?.template_id === t.template_id) {
        await refreshDrawer(t.template_id);
      }
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    const id = deactivateTarget.template_id;
    setDeactivateSubmitting(true);
    try {
      await checklistTemplatesApi.updateStatus(id, { status: "inactive" });
      setDeactivateTarget(null);
      await fetchRows();
      if (drawerDetail?.template_id === id) {
        await refreshDrawer(id);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setDeactivateSubmitting(false);
    }
  };

  const handleAddItem = async () => {
    if (!drawerDetail) return;
    const title = newItemTitle.trim();
    if (!title) return;
    setAddItemSubmitting(true);
    setDrawerError(null);
    try {
      await checklistTemplatesApi.addItem(drawerDetail.template_id, {
        title,
        description: newItemDescription.trim() || undefined,
      });
      setNewItemTitle("");
      setNewItemDescription("");
      await refreshDrawer(drawerDetail.template_id);
      await fetchRows();
    } catch (err) {
      setDrawerError(getApiError(err));
    } finally {
      setAddItemSubmitting(false);
    }
  };

  const startEditItem = (item: ChecklistTemplateItem) => {
    setEditingItemId(item.item_id);
    setEditItemTitle(item.title);
    setEditItemDescription(item.description ?? "");
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItemTitle("");
    setEditItemDescription("");
  };

  const saveEditItem = async () => {
    if (!drawerDetail || editingItemId == null) return;
    const title = editItemTitle.trim();
    if (!title) return;
    setEditItemSubmitting(true);
    setDrawerError(null);
    try {
      await checklistTemplatesApi.updateItem(drawerDetail.template_id, editingItemId, {
        title,
        description: editItemDescription.trim() || undefined,
      });
      cancelEditItem();
      await refreshDrawer(drawerDetail.template_id);
      await fetchRows();
    } catch (err) {
      setDrawerError(getApiError(err));
    } finally {
      setEditItemSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!drawerDetail || !deleteItemTarget) return;
    setDeleteItemSubmitting(true);
    setDrawerError(null);
    try {
      await checklistTemplatesApi.deleteItem(drawerDetail.template_id, deleteItemTarget.item_id);
      setDeleteItemTarget(null);
      await refreshDrawer(drawerDetail.template_id);
      await fetchRows();
    } catch (err) {
      setDrawerError(getApiError(err));
    } finally {
      setDeleteItemSubmitting(false);
    }
  };

  const onItemsDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!drawerDetail || !over || active.id === over.id) return;
    const sorted = sortItems(drawerDetail.items);
    const oldIndex = sorted.findIndex((i) => i.item_id === active.id);
    const newIndex = sorted.findIndex((i) => i.item_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    const optimistic: ChecklistTemplateDetail = {
      ...drawerDetail,
      items: reordered.map((item, idx) => ({
        ...item,
        display_order: idx + 1,
      })),
    };
    setDrawerDetail(optimistic);
    setReorderSaving(true);
    setDrawerError(null);
    try {
      await Promise.all(
        optimistic.items.map((item, idx) =>
          checklistTemplatesApi.updateItem(drawerDetail.template_id, item.item_id, {
            display_order: idx + 1,
          })
        )
      );
      await refreshDrawer(drawerDetail.template_id);
      await fetchRows();
    } catch (err) {
      setDrawerError(getApiError(err));
      await refreshDrawer(drawerDetail.template_id);
    } finally {
      setReorderSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ak = a[sortKey as keyof TemplateRow];
      const bk = b[sortKey as keyof TemplateRow];
      const aVal = ak == null ? "" : String(ak);
      const bVal = bk == null ? "" : String(bk);
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  const drawerSortedItems = drawerDetail ? sortItems(drawerDetail.items) : [];

  const columns: Column<TemplateRow>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (r) => <span className="font-medium text-zinc-900">{r.name}</span>,
    },
    {
      key: "description",
      label: "Description",
      sortable: false,
      hideOnTablet: true,
      render: (r) => (
        <span className="text-zinc-600">{truncate(r.description, 60)}</span>
      ),
    },
    {
      key: "itemsCount",
      label: "Items",
      sortable: true,
      className: "text-center w-20",
      render: (r) => r.itemsCount,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => {
        const active = (r.status ?? "").toLowerCase() === "active";
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                active ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {r.status ?? "—"}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleToggleStatus(r);
              }}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 underline"
            >
              Toggle
            </button>
          </div>
        );
      },
    },
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      hideOnMobile: true,
      render: (r) => formatDate(r.created_at),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Checklist Templates</h1>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          Add Template
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search templates by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">
            {search.trim() ? "No templates match your search." : "No checklist templates yet."}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={sortedRows}
            keyExtractor={(r) => r.template_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={(r) => void openDrawer(r)}
            onEdit={(r) => openEditModal(r)}
            onDelete={(r) => setDeactivateTarget(r)}
          />
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={modalMode === "add" ? "Add template" : "Edit template"}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleFormSubmit();
          }}
        >
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Name *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Audience *</label>
            <select
              value={formAudience}
              onChange={(e) => setFormAudience(e.target.value === "user" ? "user" : "internal")}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="internal">Internal (employees)</option>
              <option value="user">User-facing (instructions)</option>
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              Internal templates create assignable tasks. User-facing templates show static instructions to users.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Description</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {formSubmitting ? "Saving…" : modalMode === "add" ? "Create" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {deactivateTarget && (
        <Modal open={!!deactivateTarget} onClose={() => setDeactivateTarget(null)} title="Deactivate template">
          <p className="text-sm text-zinc-600 mb-4">
            This will mark &quot;{deactivateTarget.name}&quot; inactive. It won&apos;t be available for new engagements.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              disabled={deactivateSubmitting}
              onClick={() => void handleDeactivate()}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {deactivateSubmitting ? "Working…" : "Deactivate"}
            </button>
            <button
              type="button"
              onClick={() => setDeactivateTarget(null)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {deleteItemTarget && drawerDetail && (
        <Modal open={!!deleteItemTarget} onClose={() => setDeleteItemTarget(null)} title="Delete item">
          <p className="text-sm text-zinc-600 mb-4">Remove this item from the template?</p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              disabled={deleteItemSubmitting}
              onClick={() => void handleDeleteItem()}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {deleteItemSubmitting ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteItemTarget(null)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} aria-hidden />
          <div className="relative w-full max-w-xl h-full bg-white shadow-xl flex flex-col border-l border-zinc-200">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-zinc-200 shrink-0">
              <div className="min-w-0">
                {drawerDetail ? (
                  <>
                    <h2 className="text-lg font-semibold text-zinc-900 truncate">{drawerDetail.name}</h2>
                    <span
                      className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        (drawerDetail.status ?? "").toLowerCase() === "active"
                          ? "bg-green-50 text-green-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {drawerDetail.status}
                    </span>
                  </>
                ) : (
                  <div className="h-6 w-40 bg-zinc-100 rounded animate-pulse" />
                )}
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {drawerError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {drawerError}
                </div>
              )}
              {drawerLoading && !drawerDetail ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                </div>
              ) : drawerDetail ? (
                <>
                  {reorderSaving && (
                    <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Saving order…
                    </p>
                  )}
                  {drawerSortedItems.length === 0 ? (
                    <p className="text-sm text-zinc-500 mb-4">No items yet. Add the first item below.</p>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onItemsDragEnd(e)}>
                      <SortableContext
                        items={drawerSortedItems.map((i) => i.item_id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="space-y-3 mb-6">
                          {drawerSortedItems.map((item, idx) => (
                            <li key={item.item_id}>
                              <SortableItem
                                id={item.item_id}
                                handle={<GripVertical className="w-4 h-4" />}
                                className="rounded-lg border border-zinc-200 bg-white p-3"
                              >
                                {editingItemId === item.item_id ? (
                                  <div className="space-y-2">
                                    <input
                                      type="text"
                                      value={editItemTitle}
                                      onChange={(e) => setEditItemTitle(e.target.value)}
                                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                    />
                                    <textarea
                                      value={editItemDescription}
                                      onChange={(e) => setEditItemDescription(e.target.value)}
                                      rows={2}
                                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        disabled={editItemSubmitting}
                                        onClick={() => void saveEditItem()}
                                        className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-50"
                                      >
                                        {editItemSubmitting ? "Saving…" : "Save"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditItem}
                                        className="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 text-xs font-medium hover:bg-zinc-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs text-zinc-500 mb-0.5">
                                        #{item.display_order ?? idx + 1}
                                      </p>
                                      <p className="font-medium text-zinc-900">{item.title}</p>
                                      {item.description?.trim() ? (
                                        <p className="text-sm text-zinc-500 mt-1">{item.description}</p>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => startEditItem(item)}
                                        className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                                        aria-label="Edit item"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteItemTarget(item)}
                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50"
                                        aria-label="Delete item"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </SortableItem>
                            </li>
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  )}

                  <div className="border-t border-zinc-200 pt-4 space-y-3">
                    <p className="text-sm font-medium text-zinc-900">Add item</p>
                    <input
                      type="text"
                      placeholder="Title *"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    <textarea
                      placeholder="Description (optional)"
                      value={newItemDescription}
                      onChange={(e) => setNewItemDescription(e.target.value)}
                      rows={2}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    <button
                      type="button"
                      disabled={addItemSubmitting || !newItemTitle.trim()}
                      onClick={() => void handleAddItem()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {addItemSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Add
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
