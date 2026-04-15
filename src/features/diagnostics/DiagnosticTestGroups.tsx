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
import { GripVertical, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { SortableItem } from "../../components/SortableItem";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  diagnosticFilterChipsApi,
  diagnosticTestGroupsApi,
  diagnosticTestsApi,
  getApiError,
  type DiagnosticFilterChip,
  type DiagnosticTestGroupStandalone,
  type DiagnosticTestStandalone,
} from "../../lib/api";

interface DiagnosticTestGroupsProps {
  onRequestCreate?: (trigger: () => void) => void;
}

type ModalMode = "add" | "edit";
type SortKey = "group_id" | "group_name" | "test_count" | "display_order";
type SortDir = "asc" | "desc";

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const EMPTY_FORM = {
  group_name: "",
  display_order: "",
  price: "",
  original_price: "",
  is_most_popular: false,
  gender_suitability: "",
};

export function DiagnosticTestGroups({ onRequestCreate }: DiagnosticTestGroupsProps) {
  const [rows, setRows] = useState<DiagnosticTestGroupStandalone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("group_id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [editing, setEditing] = useState<DiagnosticTestGroupStandalone | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [panelGroup, setPanelGroup] = useState<DiagnosticTestGroupStandalone | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [groupTests, setGroupTests] = useState<DiagnosticTestStandalone[]>([]);
  const [groupTestsError, setGroupTestsError] = useState<string | null>(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [allTests, setAllTests] = useState<DiagnosticTestStandalone[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<number[]>([]);
  const [assignNote, setAssignNote] = useState<string | null>(null);
  const [reorderingTests, setReorderingTests] = useState(false);
  const [panelGroupDetail, setPanelGroupDetail] = useState<DiagnosticTestGroupStandalone | null>(null);
  const [groupFilterChipCatalog, setGroupFilterChipCatalog] = useState<DiagnosticFilterChip[]>([]);
  const [selectedGroupFilterChipId, setSelectedGroupFilterChipId] = useState<string>("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticTestGroupsApi.list();
      setRows(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPanelTests = useCallback(async (groupId: number) => {
    setPanelLoading(true);
    setGroupTestsError(null);
    try {
      const res = await diagnosticTestGroupsApi.getTests(groupId);
      setGroupTests(res.data.data ?? []);
    } catch (err) {
      setGroupTestsError(getApiError(err));
      setGroupTests([]);
    } finally {
      setPanelLoading(false);
    }
  }, []);

  const fetchPanelGroupDetail = useCallback(async (groupId: number) => {
    try {
      const res = await diagnosticTestGroupsApi.get(groupId);
      setPanelGroupDetail(res.data.data ?? null);
    } catch {
      setPanelGroupDetail(null);
    }
  }, []);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (!modalOpen || modalMode !== "edit" || !editing) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await diagnosticTestGroupsApi.getTests(editing.group_id);
        const tests = res.data.data ?? [];
        let sum = 0;
        for (const t of tests) {
          if (t.original_price != null && Number.isFinite(t.original_price)) sum += t.original_price;
        }
        if (!cancelled && sum > 0) {
          setForm((f) => ({ ...f, original_price: String(sum) }));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, modalMode, editing?.group_id]);

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

  const openEdit = (row: DiagnosticTestGroupStandalone) => {
    setModalMode("edit");
    setEditing(row);
    setForm({
      group_name: row.group_name,
      display_order: row.display_order != null ? String(row.display_order) : "",
      price: row.price != null ? String(row.price) : "",
      original_price: row.original_price != null ? String(row.original_price) : "",
      is_most_popular: !!row.is_most_popular,
      gender_suitability: row.gender_suitability ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openPanel = (row: DiagnosticTestGroupStandalone) => {
    setPanelGroup(row);
    setPanelGroupDetail(null);
    setSelectedGroupFilterChipId("");
    setAssignNote(null);
    void fetchPanelTests(row.group_id);
    void fetchPanelGroupDetail(row.group_id);
    void diagnosticFilterChipsApi
      .list("custom_package")
      .then((res) => setGroupFilterChipCatalog(res.data.data ?? []))
      .catch(() => setGroupFilterChipCatalog([]));
  };

  const closePanel = () => {
    setPanelGroup(null);
    setPanelGroupDetail(null);
    setGroupTests([]);
    setGroupTestsError(null);
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
    const next = rows.filter((row) => !q || row.group_name.toLowerCase().includes(q));
    next.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";
      if (sortKey === "group_id") {
        left = a.group_id;
        right = b.group_id;
      } else if (sortKey === "group_name") {
        left = a.group_name.toLowerCase();
        right = b.group_name.toLowerCase();
      } else if (sortKey === "test_count") {
        left = a.test_count;
        right = b.test_count;
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
    if (!form.group_name.trim()) {
      setFormError("Group name is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        group_name: form.group_name.trim(),
        display_order: form.display_order.trim() ? Number(form.display_order) : undefined,
        price: toNumberOrNull(form.price),
        original_price: toNumberOrNull(form.original_price),
        is_most_popular: form.is_most_popular,
        gender_suitability: form.gender_suitability.trim() || undefined,
      };
      if (modalMode === "add") {
        await diagnosticTestGroupsApi.create(payload);
      } else if (editing) {
        await diagnosticTestGroupsApi.update(editing.group_id, payload);
      }
      setModalOpen(false);
      await fetchGroups();
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: DiagnosticTestGroupStandalone) => {
    if (!window.confirm("Deleting this group will unassign all its tests. Continue?")) return;
    try {
      await diagnosticTestGroupsApi.delete(row.group_id);
      if (panelGroup?.group_id === row.group_id) {
        closePanel();
      }
      await fetchGroups();
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const handleRemoveTest = async (test: DiagnosticTestStandalone) => {
    if (!panelGroup) return;
    if (!window.confirm("Remove this test from this group?")) return;
    try {
      await diagnosticTestGroupsApi.removeTest(panelGroup.group_id, test.test_id);
      await fetchPanelTests(panelGroup.group_id);
      await fetchGroups();
    } catch (err) {
      setGroupTestsError(getApiError(err));
    }
  };

  const openAssignModal = async () => {
    if (!panelGroup) return;
    setAssignModalOpen(true);
    setAssignLoading(true);
    setAssignError(null);
    setAssignNote(null);
    setAssignSearch("");
    try {
      const [allTestsRes, assignedRes] = await Promise.all([
        diagnosticTestsApi.list({ parameter_type: "test" }),
        diagnosticTestGroupsApi.getTests(panelGroup.group_id),
      ]);
      const all = allTestsRes.data.data ?? [];
      const assigned = assignedRes.data.data ?? [];
      setAllTests(all);
      setSelectedTestIds(assigned.map((item) => item.test_id));
    } catch (err) {
      setAssignError(getApiError(err));
    } finally {
      setAssignLoading(false);
    }
  };

  const assignFilteredTests = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return allTests.filter((row) => !q || row.test_name.toLowerCase().includes(q));
  }, [allTests, assignSearch]);

  const toggleTestSelection = (testId: number) => {
    setSelectedTestIds((prev) => (prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]));
  };

  const selectedTests = useMemo(() => {
    const map = new Map(allTests.map((test) => [test.test_id, test]));
    return selectedTestIds.map((testId) => map.get(testId)).filter((test): test is DiagnosticTestStandalone => Boolean(test));
  }, [allTests, selectedTestIds]);

  const onSelectedAssignTestsDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = selectedTestIds.findIndex((id) => id === Number(active.id));
    const newIndex = selectedTestIds.findIndex((id) => id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setSelectedTestIds((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const onGroupTestsDragEnd = async (event: DragEndEvent) => {
    if (!panelGroup || reorderingTests || panelLoading || groupTests.length < 2) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groupTests.findIndex((item) => item.test_id === Number(active.id));
    const newIndex = groupTests.findIndex((item) => item.test_id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = [...groupTests];
    const next = arrayMove(groupTests, oldIndex, newIndex);
    setGroupTests(next);
    setReorderingTests(true);
    setGroupTestsError(null);
    try {
      await diagnosticTestGroupsApi.reorderTests(panelGroup.group_id, { test_ids: next.map((item) => item.test_id) });
      await fetchPanelTests(panelGroup.group_id);
    } catch (err) {
      setGroupTests(previous);
      setGroupTestsError(getApiError(err));
    } finally {
      setReorderingTests(false);
    }
  };

  const handleAssign = async () => {
    if (!panelGroup) return;
    if (selectedTestIds.length === 0) {
      setAssignError("Select at least one test.");
      return;
    }
    setAssignSubmitting(true);
    setAssignError(null);
    try {
      const res = await diagnosticTestGroupsApi.assignTests(panelGroup.group_id, { test_ids: selectedTestIds });
      const latestAssignedRes = await diagnosticTestGroupsApi.getTests(panelGroup.group_id);
      const latestAssignedIds = (latestAssignedRes.data.data ?? []).map((item) => item.test_id);
      const orderedIds = [
        ...selectedTestIds,
        ...latestAssignedIds.filter((testId) => !selectedTestIds.includes(testId)),
      ];
      await diagnosticTestGroupsApi.reorderTests(panelGroup.group_id, { test_ids: orderedIds });
      const data = res.data.data;
      setAssignNote(`${data.added_test_ids.length} tests added. ${data.skipped_test_ids.length} already assigned (skipped).`);
      setAssignModalOpen(false);
      await fetchPanelTests(panelGroup.group_id);
      await fetchGroups();
    } catch (err) {
      setAssignError(getApiError(err));
    } finally {
      setAssignSubmitting(false);
    }
  };

  const groupAssignedFilterChips = useMemo(
    () =>
      [...(panelGroupDetail?.filter_chips ?? [])].sort(
        (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
      ),
    [panelGroupDetail?.filter_chips]
  );

  const assignableGroupFilterChips = useMemo(() => {
    const assigned = new Set(groupAssignedFilterChips.map((c) => c.filter_chip_id));
    return groupFilterChipCatalog.filter((c) => !assigned.has(c.filter_chip_id));
  }, [groupAssignedFilterChips, groupFilterChipCatalog]);

  const addGroupFilterChip = async () => {
    if (!panelGroup || !selectedGroupFilterChipId) return;
    setGroupTestsError(null);
    try {
      await diagnosticTestGroupsApi.addFilterChip(panelGroup.group_id, {
        filter_chip_id: Number(selectedGroupFilterChipId),
      });
      setSelectedGroupFilterChipId("");
      await fetchPanelGroupDetail(panelGroup.group_id);
      await fetchGroups();
    } catch (err) {
      setGroupTestsError(getApiError(err));
    }
  };

  const removeGroupFilterChip = async (filterChipId: number) => {
    if (!panelGroup) return;
    if (!window.confirm("Remove this filter chip from the group?")) return;
    setGroupTestsError(null);
    try {
      await diagnosticTestGroupsApi.removeFilterChip(panelGroup.group_id, filterChipId);
      await fetchPanelGroupDetail(panelGroup.group_id);
      await fetchGroups();
    } catch (err) {
      setGroupTestsError(getApiError(err));
    }
  };

  const columns: Column<DiagnosticTestGroupStandalone>[] = [
    {
      key: "group_name",
      label: "Group name",
      sortable: true,
      render: (row) => <span className="font-medium text-zinc-900">{row.group_name}</span>,
    },
    {
      key: "test_count",
      label: "Test count",
      sortable: true,
      render: (row) => row.test_count,
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
            placeholder="Search test groups..."
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          Add Test Group
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
            keyExtractor={(row) => row.group_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={openPanel}
            onEdit={openEdit}
            onDelete={handleDelete}
            firstColumnClickableView
          />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "add" ? "Add Test Group" : "Edit Test Group"}
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
            <label className="block text-sm font-medium text-zinc-700 mb-1">Group name</label>
            <input
              type="text"
              value={form.group_name}
              onChange={(e) => setForm((prev) => ({ ...prev, group_name: e.target.value }))}
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
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Price</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Original price</label>
            <input
              type="number"
              value={form.original_price}
              onChange={(e) => setForm((prev) => ({ ...prev, original_price: e.target.value }))}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Gender suitability</label>
            <select
              value={form.gender_suitability}
              onChange={(e) => setForm((prev) => ({ ...prev, gender_suitability: e.target.value }))}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-zinc-900"
            >
              <option value="">Select</option>
              <option value="male">male</option>
              <option value="female">female</option>
              <option value="both">both</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.is_most_popular}
              onChange={(e) => setForm((prev) => ({ ...prev, is_most_popular: e.target.checked }))}
            />
            Most popular
          </label>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : modalMode === "add" ? "Create Test Group" : "Save Changes"}
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

      {panelGroup && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closePanel} aria-hidden />
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white border-l border-zinc-200 shadow-xl flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">{panelGroup.group_name}</h2>
                <p className="text-sm text-zinc-500">{groupTests.length} tests assigned</p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-50 space-y-4">
              {assignNote && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                  {assignNote}
                </div>
              )}
              {groupTestsError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{groupTestsError}</div>
              )}
              <div className="bg-white border border-zinc-200 rounded-xl p-4">
                <h3 className="text-sm font-medium text-zinc-900 mb-3">Filter chips</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {groupAssignedFilterChips.length === 0 ? (
                    <p className="text-sm text-zinc-500">No chips assigned.</p>
                  ) : (
                    groupAssignedFilterChips.map((chip) => (
                      <span
                        key={chip.filter_chip_id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-100 text-zinc-800"
                      >
                        {chip.display_name}
                        <button
                          type="button"
                          onClick={() => void removeGroupFilterChip(chip.filter_chip_id)}
                          className="p-0.5 rounded hover:bg-zinc-200 text-zinc-600"
                          aria-label={`Remove ${chip.display_name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={selectedGroupFilterChipId}
                    onChange={(e) => setSelectedGroupFilterChipId(e.target.value)}
                    className="flex-1 min-w-0 border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select chip to add…</option>
                    {assignableGroupFilterChips.map((c) => (
                      <option key={c.filter_chip_id} value={c.filter_chip_id}>
                        {c.display_name} ({c.chip_key})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void addGroupFilterChip()}
                    disabled={!selectedGroupFilterChipId}
                    className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Add chip
                  </button>
                </div>
              </div>
              <div className="bg-white border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-zinc-900">Tests in this group</h3>
                  <button
                    type="button"
                    onClick={() => void openAssignModal()}
                    className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
                  >
                    Assign Tests
                  </button>
                </div>
                {panelLoading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                  </div>
                ) : groupTests.length === 0 ? (
                  <p className="text-sm text-zinc-500">No tests assigned.</p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onGroupTestsDragEnd(event)}>
                    <SortableContext items={groupTests.map((test) => test.test_id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {groupTests.map((test) => (
                          <SortableItem
                            key={test.test_id}
                            id={test.test_id}
                            handle={<GripVertical className="w-4 h-4" />}
                            className="border border-zinc-200 rounded-lg px-3 py-2 bg-zinc-50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm text-zinc-900">{test.test_name}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                    test.is_available ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                                  }`}
                                >
                                  {test.is_available ? "Yes" : "No"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveTest(test)}
                                  className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                                  aria-label={`Remove ${test.test_name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </SortableItem>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={assignModalOpen} onClose={() => setAssignModalOpen(false)} title="Assign Tests to Group" maxWidthClassName="max-w-2xl">
        <div className="space-y-4">
          {assignError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{assignError}</div>}
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900"
              placeholder="Search tests..."
            />
          </div>
          {assignLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="max-h-56 overflow-y-auto border border-zinc-200 rounded-lg bg-white">
                {assignFilteredTests.map((test) => (
                  <label key={test.test_id} className="flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0 border-zinc-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedTestIds.includes(test.test_id)}
                        onChange={() => toggleTestSelection(test.test_id)}
                      />
                      <span className="text-sm text-zinc-900 truncate">{test.test_name}</span>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${test.is_available ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
                      {test.is_available ? "Yes" : "No"}
                    </span>
                  </label>
                ))}
                {assignFilteredTests.length === 0 && (
                  <div className="px-3 py-4 text-sm text-zinc-500">No tests found.</div>
                )}
              </div>
              <div className="border border-zinc-200 rounded-lg bg-zinc-50 p-3">
                <p className="text-sm font-medium text-zinc-900 mb-2">Selected order</p>
                {selectedTests.length === 0 ? (
                  <p className="text-sm text-zinc-500">Select tests to set their order.</p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSelectedAssignTestsDragEnd}>
                    <SortableContext items={selectedTestIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {selectedTests.map((test, index) => (
                          <SortableItem
                            key={test.test_id}
                            id={test.test_id}
                            handle={<GripVertical className="w-4 h-4" />}
                            className="border border-zinc-200 rounded-lg px-3 py-2 bg-white"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs text-zinc-500">#{index + 1}</p>
                                <p className="text-sm text-zinc-900 truncate">{test.test_name}</p>
                              </div>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${test.is_available ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
                                {test.is_available ? "Yes" : "No"}
                              </span>
                            </div>
                          </SortableItem>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              disabled={assignSubmitting || assignLoading}
              onClick={() => void handleAssign()}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {assignSubmitting ? "Assigning..." : "Assign Selected"}
            </button>
            <button
              type="button"
              onClick={() => setAssignModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
