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
  Loader2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  diagnosticPackagesApi,
  diagnosticTestGroupsApi,
  getApiError,
  type DiagnosticPackageDetail,
  type DiagnosticPreparation,
  type DiagnosticReason,
  type DiagnosticSample,
  type DiagnosticTag,
  type DiagnosticTestGroupStandalone,
} from "../../lib/api";
import { SortableItem } from "../../components/SortableItem";
import { Modal } from "../../shared/ui/Modal";

interface DiagnosticPackageDrawerProps {
  open: boolean;
  packageId: number | null;
  onClose: () => void;
  onUpdated?: () => void;
}

type DrawerTab = "overview" | "reasons" | "tests" | "samples-prep";

export function DiagnosticPackageDrawer({ open, packageId, onClose, onUpdated }: DiagnosticPackageDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DiagnosticPackageDetail | null>(null);
  const [testGroups, setTestGroups] = useState<DiagnosticTestGroupStandalone[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

  const [tagInput, setTagInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [editingReasonId, setEditingReasonId] = useState<number | null>(null);
  const [editingReasonText, setEditingReasonText] = useState("");
  const [assignGroupsModalOpen, setAssignGroupsModalOpen] = useState(false);
  const [assignGroupsLoading, setAssignGroupsLoading] = useState(false);
  const [assignGroupsSubmitting, setAssignGroupsSubmitting] = useState(false);
  const [assignGroupsError, setAssignGroupsError] = useState<string | null>(null);
  const [assignGroupsSearch, setAssignGroupsSearch] = useState("");
  const [allGroups, setAllGroups] = useState<DiagnosticTestGroupStandalone[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [assignGroupsNote, setAssignGroupsNote] = useState<string | null>(null);
  const [reorderingGroups, setReorderingGroups] = useState(false);

  const [sampleFormOpen, setSampleFormOpen] = useState(false);
  const [sampleForm, setSampleForm] = useState({ sample_type: "", description: "" });
  const [editingSampleId, setEditingSampleId] = useState<number | null>(null);

  const [prepFormOpen, setPrepFormOpen] = useState(false);
  const [prepTitle, setPrepTitle] = useState("");
  const [prepSteps, setPrepSteps] = useState<string[]>([""]);
  const [editingPrepId, setEditingPrepId] = useState<number | null>(null);

  const [busyKey, setBusyKey] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const reasons = useMemo(
    () =>
      [...(detail?.reasons ?? [])].sort(
        (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
      ),
    [detail?.reasons]
  );

  const samples = useMemo(
    () =>
      [...(detail?.samples ?? [])].sort(
        (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
      ),
    [detail?.samples]
  );

  const preparations = useMemo(
    () =>
      [...(detail?.preparations ?? [])].sort(
        (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
      ),
    [detail?.preparations]
  );

  const fetchData = useCallback(async () => {
    if (!packageId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailRes, testsRes] = await Promise.all([
        diagnosticPackagesApi.get(packageId),
        diagnosticPackagesApi.getTests(packageId),
      ]);
      const nextDetail = detailRes.data.data;
      const nextGroups = testsRes.data.data?.groups ?? [];
      setDetail(nextDetail);
      setTestGroups(nextGroups);
      setExpandedGroups(Object.fromEntries(nextGroups.map((group) => [group.group_id, true])));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    if (open && packageId) {
      void fetchData();
    }
  }, [fetchData, open, packageId]);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusyKey(key);
    setError(null);
    try {
      await fn();
      await fetchData();
      onUpdated?.();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setBusyKey(null);
    }
  };

  const addTag = async () => {
    if (!packageId || !tagInput.trim()) return;
    await withBusy("add-tag", async () => {
      await diagnosticPackagesApi.addTag(packageId, { tag_name: tagInput.trim() });
      setTagInput("");
    });
  };

  const removeTag = async (tag: DiagnosticTag) => {
    if (!packageId) return;
    await withBusy(`delete-tag-${tag.tag_id}`, async () => {
      await diagnosticPackagesApi.deleteTag(packageId, tag.tag_id);
    });
  };

  const addReason = async () => {
    if (!packageId || !reasonInput.trim()) return;
    await withBusy("add-reason", async () => {
      await diagnosticPackagesApi.addReason(packageId, {
        reason_text: reasonInput.trim(),
        display_order: reasons.length + 1,
      });
      setReasonInput("");
    });
  };

  const saveReasonEdit = async (reasonId: number) => {
    if (!packageId || !editingReasonText.trim()) return;
    await withBusy(`update-reason-${reasonId}`, async () => {
      await diagnosticPackagesApi.updateReason(packageId, reasonId, {
        reason_text: editingReasonText.trim(),
      });
      setEditingReasonId(null);
      setEditingReasonText("");
    });
  };

  const deleteReason = async (reason: DiagnosticReason) => {
    if (!packageId) return;
    await withBusy(`delete-reason-${reason.reason_id}`, async () => {
      await diagnosticPackagesApi.deleteReason(packageId, reason.reason_id);
    });
  };

  const reorderReasons = async (nextRows: DiagnosticReason[]) => {
    if (!packageId) return;
    await withBusy("reorder-reasons", async () => {
      await Promise.all(
        nextRows.map((row, index) =>
          diagnosticPackagesApi.updateReason(packageId, row.reason_id, { display_order: index + 1 })
        )
      );
    });
  };

  const onReasonDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = reasons.findIndex((reason) => reason.reason_id === Number(active.id));
    const newIndex = reasons.findIndex((reason) => reason.reason_id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const updated = arrayMove(reasons, oldIndex, newIndex);
    setDetail((prev) => (prev ? { ...prev, reasons: updated } : prev));
    void reorderReasons(updated);
  };

  const removeAssignedGroup = async (groupId: number) => {
    if (!packageId) return;
    if (!window.confirm("Remove this test group from the package?")) return;
    await withBusy(`remove-group-${groupId}`, async () => {
      await diagnosticPackagesApi.removeTestGroup(packageId, groupId);
    });
  };

  const openAssignGroupsModal = async () => {
    if (!packageId) return;
    setAssignGroupsModalOpen(true);
    setAssignGroupsLoading(true);
    setAssignGroupsSubmitting(false);
    setAssignGroupsError(null);
    setAssignGroupsSearch("");
    setAssignGroupsNote(null);
    try {
      const [allGroupsRes, assignedRes] = await Promise.all([
        diagnosticTestGroupsApi.list(),
        diagnosticPackagesApi.getTests(packageId),
      ]);
      const all = allGroupsRes.data.data ?? [];
      const assigned = assignedRes.data.data?.groups ?? [];
      setAllGroups(all);
      setSelectedGroupIds(assigned.map((group) => group.group_id));
    } catch (err) {
      setAssignGroupsError(getApiError(err));
    } finally {
      setAssignGroupsLoading(false);
    }
  };

  const toggleGroupSelection = (groupId: number) => {
    setSelectedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  const filteredAllGroups = useMemo(() => {
    const q = assignGroupsSearch.trim().toLowerCase();
    return allGroups.filter((group) => !q || group.group_name.toLowerCase().includes(q));
  }, [allGroups, assignGroupsSearch]);

  const selectedAssignGroups = useMemo(() => {
    const map = new Map(allGroups.map((group) => [group.group_id, group]));
    return selectedGroupIds.map((groupId) => map.get(groupId)).filter((group): group is DiagnosticTestGroupStandalone => Boolean(group));
  }, [allGroups, selectedGroupIds]);

  const onSelectedAssignGroupsDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = selectedGroupIds.findIndex((id) => id === Number(active.id));
    const newIndex = selectedGroupIds.findIndex((id) => id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setSelectedGroupIds((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const onAssignedGroupsDragEnd = async (event: DragEndEvent) => {
    if (!packageId || reorderingGroups || testGroups.length < 2) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = testGroups.findIndex((group) => group.group_id === Number(active.id));
    const newIndex = testGroups.findIndex((group) => group.group_id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = [...testGroups];
    const next = arrayMove(testGroups, oldIndex, newIndex);
    setTestGroups(next);
    setReorderingGroups(true);
    setError(null);
    try {
      await diagnosticPackagesApi.reorderTestGroups(packageId, { group_ids: next.map((group) => group.group_id) });
      await fetchData();
      onUpdated?.();
    } catch (err) {
      setTestGroups(previous);
      setError(getApiError(err));
    } finally {
      setReorderingGroups(false);
    }
  };

  const assignSelectedGroups = async () => {
    if (!packageId) return;
    if (selectedGroupIds.length === 0) {
      setAssignGroupsError("Select at least one test group.");
      return;
    }
    setAssignGroupsSubmitting(true);
    setAssignGroupsError(null);
    try {
      const res = await diagnosticPackagesApi.assignTestGroups(packageId, { group_ids: selectedGroupIds });
      const latestAssignedRes = await diagnosticPackagesApi.getTests(packageId);
      const latestAssignedIds = (latestAssignedRes.data.data?.groups ?? []).map((group) => group.group_id);
      const orderedIds = [
        ...selectedGroupIds,
        ...latestAssignedIds.filter((groupId) => !selectedGroupIds.includes(groupId)),
      ];
      await diagnosticPackagesApi.reorderTestGroups(packageId, { group_ids: orderedIds });
      const data = res.data.data;
      setAssignGroupsNote(`${data.added_group_ids.length} groups added. ${data.skipped_group_ids.length} already assigned (skipped).`);
      setAssignGroupsModalOpen(false);
      await fetchData();
      onUpdated?.();
    } catch (err) {
      setAssignGroupsError(getApiError(err));
    } finally {
      setAssignGroupsSubmitting(false);
    }
  };

  const addSample = async () => {
    if (!packageId || !sampleForm.sample_type.trim()) return;
    await withBusy("add-sample", async () => {
      await diagnosticPackagesApi.addSample(packageId, {
        sample_type: sampleForm.sample_type.trim(),
        description: sampleForm.description.trim() || undefined,
        display_order: (samples.length ?? 0) + 1,
      });
      setSampleForm({ sample_type: "", description: "" });
      setSampleFormOpen(false);
      setEditingSampleId(null);
    });
  };

  const saveSampleEdit = async (sample: DiagnosticSample) => {
    if (!packageId || !sampleForm.sample_type.trim()) return;
    await withBusy(`update-sample-${sample.sample_id}`, async () => {
      await diagnosticPackagesApi.updateSample(packageId, sample.sample_id, {
        sample_type: sampleForm.sample_type.trim(),
        description: sampleForm.description.trim() || undefined,
      });
      setSampleForm({ sample_type: "", description: "" });
      setSampleFormOpen(false);
      setEditingSampleId(null);
    });
  };

  const deleteSample = async (sample: DiagnosticSample) => {
    if (!packageId) return;
    await withBusy(`delete-sample-${sample.sample_id}`, async () => {
      await diagnosticPackagesApi.deleteSample(packageId, sample.sample_id);
    });
  };

  const addPreparation = async () => {
    if (!packageId || !prepTitle.trim()) return;
    const cleaned = prepSteps.map((step) => step.trim()).filter(Boolean);
    await withBusy("add-prep", async () => {
      await diagnosticPackagesApi.addPreparation(packageId, {
        preparation_title: prepTitle.trim(),
        steps: cleaned,
        display_order: preparations.length + 1,
      });
      setPrepFormOpen(false);
      setEditingPrepId(null);
      setPrepTitle("");
      setPrepSteps([""]);
    });
  };

  const savePreparationEdit = async (prep: DiagnosticPreparation) => {
    if (!packageId || !prepTitle.trim()) return;
    const cleaned = prepSteps.map((step) => step.trim()).filter(Boolean);
    await withBusy(`update-prep-${prep.preparation_id}`, async () => {
      await diagnosticPackagesApi.updatePreparation(packageId, prep.preparation_id, {
        preparation_title: prepTitle.trim(),
        steps: cleaned,
      });
      setPrepFormOpen(false);
      setEditingPrepId(null);
      setPrepTitle("");
      setPrepSteps([""]);
    });
  };

  const deletePreparation = async (prep: DiagnosticPreparation) => {
    if (!packageId) return;
    await withBusy(`delete-prep-${prep.preparation_id}`, async () => {
      await diagnosticPackagesApi.deletePreparation(packageId, prep.preparation_id);
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white shadow-xl border-l border-zinc-200 flex flex-col">
        <div className="px-4 sm:px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{detail?.package_name ?? "Package details"}</h2>
            {detail?.diagnostic_provider && <p className="text-sm text-zinc-500">{detail.diagnostic_provider}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 border-b border-zinc-200">
          <div
            className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {[
              { key: "overview", label: "Overview" },
              { key: "reasons", label: "Reasons" },
              { key: "tests", label: "Tests" },
              { key: "samples-prep", label: "Samples & Prep" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as DrawerTab)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-50 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
          {loading ? (
            <div className="text-sm text-zinc-500">Loading...</div>
          ) : activeTab === "overview" ? (
            <div className="space-y-4">
              <div className="bg-white border border-zinc-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><p className="text-zinc-500">Package name</p><p className="text-zinc-900 font-medium">{detail?.package_name ?? "—"}</p></div>
                <div><p className="text-zinc-500">Provider</p><p className="text-zinc-900">{detail?.diagnostic_provider ?? "—"}</p></div>
                <div><p className="text-zinc-500">Tests</p><p className="text-zinc-900">{detail?.no_of_tests ?? "—"}</p></div>
                <div><p className="text-zinc-500">Report duration (hrs)</p><p className="text-zinc-900">{detail?.report_duration_hours ?? "—"}</p></div>
                <div><p className="text-zinc-500">Collection type</p><p className="text-zinc-900">{detail?.collection_type ?? "—"}</p></div>
                <div><p className="text-zinc-500">Gender</p><p className="text-zinc-900">{detail?.gender_suitability ?? "—"}</p></div>
                <div><p className="text-zinc-500">Price</p><p className="text-zinc-900">{detail?.price != null ? `₹${detail.price}` : "—"}</p></div>
                <div><p className="text-zinc-500">Original price</p><p className="text-zinc-900">{detail?.original_price != null ? `₹${detail.original_price}` : "—"}</p></div>
                <div><p className="text-zinc-500">Bookings</p><p className="text-zinc-900">{detail?.bookings_count ?? "—"}</p></div>
                <div>
                  <p className="text-zinc-500">Status</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${(detail?.status ?? "").toLowerCase() === "active" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
                    {(detail?.status ?? "").toLowerCase() === "active" ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="sm:col-span-2"><p className="text-zinc-500">About</p><p className="text-zinc-900 whitespace-pre-wrap">{detail?.about_text ?? "—"}</p></div>
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl p-4">
                <h3 className="text-sm font-medium text-zinc-900 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(detail?.tags ?? []).map((tag) => (
                    <span key={tag.tag_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs">
                      {tag.tag_name}
                      <button
                        type="button"
                        onClick={() => void removeTag(tag)}
                        className="text-zinc-500 hover:text-zinc-800"
                        disabled={busyKey === `delete-tag-${tag.tag_id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add tag"
                    className="flex-1 border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                  />
                  <button type="button" onClick={() => void addTag()} className="px-3 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-sm">
                    Add
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === "reasons" ? (
            <div className="space-y-3">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReasonDragEnd}>
                <SortableContext items={reasons.map((reason) => reason.reason_id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {reasons.map((reason, index) => (
                      <SortableItem
                        key={reason.reason_id}
                        id={reason.reason_id}
                        handle={<GripVertical className="w-4 h-4" />}
                        className="bg-white border border-zinc-200 rounded-lg px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-zinc-500 mb-1">#{index + 1}</p>
                            {editingReasonId === reason.reason_id ? (
                              <textarea
                                value={editingReasonText}
                                onChange={(e) => setEditingReasonText(e.target.value)}
                                className="w-full min-h-20 border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                              />
                            ) : (
                              <p className="text-sm text-zinc-900 whitespace-pre-wrap">{reason.reason_text}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {editingReasonId === reason.reason_id ? (
                              <button
                                type="button"
                                onClick={() => void saveReasonEdit(reason.reason_id)}
                                className="px-2 py-1 text-xs rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                              >
                                Save
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingReasonId(reason.reason_id);
                                  setEditingReasonText(reason.reason_text);
                                }}
                                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void deleteReason(reason)}
                              className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
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
              <div className="bg-white border border-zinc-200 rounded-xl p-3">
                <textarea
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="w-full min-h-24 border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                  placeholder="Add reason..."
                />
                <div className="flex justify-end mt-2">
                  <button type="button" onClick={() => void addReason()} className="px-3 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-sm inline-flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add Reason
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === "tests" ? (
            <div className="space-y-3">
              {assignGroupsNote && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                  {assignGroupsNote}
                </div>
              )}
              <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-medium text-zinc-900">Assigned Test Groups</h3>
                {testGroups.length === 0 ? (
                  <p className="text-sm text-zinc-500">No test groups assigned. Use the button below to assign.</p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onAssignedGroupsDragEnd(event)}>
                    <SortableContext items={testGroups.map((group) => group.group_id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {testGroups.map((group) => (
                          <SortableItem
                            key={group.group_id}
                            id={group.group_id}
                            handle={<GripVertical className="w-4 h-4" />}
                            className="border border-zinc-200 rounded-lg bg-zinc-50"
                          >
                            <div>
                              <div className="px-3 py-2 flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedGroups((prev) => ({ ...prev, [group.group_id]: !prev[group.group_id] }))
                                  }
                                  className="inline-flex items-center gap-2 text-left"
                                >
                                  {expandedGroups[group.group_id] ? (
                                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                                  )}
                                  <span className="text-sm font-medium text-zinc-900">{group.group_name}</span>
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
                                    {group.test_count}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeAssignedGroup(group.group_id)}
                                  className="px-2 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs"
                                >
                                  Remove
                                </button>
                              </div>
                              {expandedGroups[group.group_id] && (
                                <div className="px-3 pb-3 space-y-2">
                                  {(group.tests ?? []).length === 0 ? (
                                    <p className="text-sm text-zinc-500">No tests in this group.</p>
                                  ) : (
                                    (group.tests ?? []).map((test) => (
                                      <div key={test.test_id} className="border border-zinc-200 rounded-lg px-3 py-2 bg-white">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-sm text-zinc-900">{test.test_name}</p>
                                          <span
                                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                              test.is_available ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                                            }`}
                                          >
                                            {test.is_available ? "Yes" : "No"}
                                          </span>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          </SortableItem>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
                <button
                  type="button"
                  onClick={() => void openAssignGroupsModal()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Assign Test Groups
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-zinc-900">Samples required</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setSampleFormOpen(true);
                      setEditingSampleId(null);
                      setSampleForm({ sample_type: "", description: "" });
                    }}
                    className="px-2 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs"
                  >
                    Add Sample
                  </button>
                </div>
                <div className="space-y-2">
                  {samples.map((sample) => (
                    <div key={sample.sample_id} className="border border-zinc-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-zinc-900">{sample.sample_type}</p>
                          <p className="text-xs text-zinc-500 whitespace-pre-wrap">{sample.description || "—"}</p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSampleFormOpen(true);
                              setEditingSampleId(sample.sample_id);
                              setSampleForm({ sample_type: sample.sample_type, description: sample.description ?? "" });
                            }}
                            className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteSample(sample)}
                            className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {sampleFormOpen && (
                  <div className="border-t border-zinc-200 pt-3 space-y-2">
                    <input
                      type="text"
                      value={sampleForm.sample_type}
                      onChange={(e) => setSampleForm((prev) => ({ ...prev, sample_type: e.target.value }))}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                      placeholder="Sample type"
                    />
                    <textarea
                      value={sampleForm.description}
                      onChange={(e) => setSampleForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 min-h-20 focus:ring-2 focus:ring-zinc-900"
                      placeholder="Description"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const target = samples.find((s) => s.sample_id === editingSampleId);
                          if (target) void saveSampleEdit(target);
                          else void addSample();
                        }}
                        className="px-3 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-sm"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSampleFormOpen(false);
                          setEditingSampleId(null);
                          setSampleForm({ sample_type: "", description: "" });
                        }}
                        className="px-3 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-zinc-900">Preparations</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setPrepFormOpen(true);
                      setEditingPrepId(null);
                      setPrepTitle("");
                      setPrepSteps([""]);
                    }}
                    className="px-2 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs"
                  >
                    Add Preparation
                  </button>
                </div>
                <div className="space-y-2">
                  {preparations.map((prep) => (
                    <div key={prep.preparation_id} className="border border-zinc-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-zinc-900">{prep.preparation_title}</p>
                          <ul className="list-disc ml-4 mt-1 text-xs text-zinc-600">
                            {(prep.steps ?? []).map((step, index) => (
                              <li key={`${prep.preparation_id}-${index}`}>{step}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPrepFormOpen(true);
                              setEditingPrepId(prep.preparation_id);
                              setPrepTitle(prep.preparation_title);
                              setPrepSteps(prep.steps?.length ? prep.steps : [""]);
                            }}
                            className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deletePreparation(prep)}
                            className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {prepFormOpen && (
                  <div className="border-t border-zinc-200 pt-3 space-y-2">
                    <input
                      type="text"
                      value={prepTitle}
                      onChange={(e) => setPrepTitle(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                      placeholder="Preparation title"
                    />
                    <div className="space-y-2">
                      {prepSteps.map((step, index) => (
                        <div key={`step-${index}`} className="flex gap-2">
                          <input
                            type="text"
                            value={step}
                            onChange={(e) =>
                              setPrepSteps((prev) => prev.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)))
                            }
                            className="flex-1 border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-900"
                            placeholder={`Step ${index + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => setPrepSteps((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                            className="px-2 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPrepSteps((prev) => [...prev, ""])}
                        className="px-2 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs"
                      >
                        Add step
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const target = preparations.find((item) => item.preparation_id === editingPrepId);
                          if (target) void savePreparationEdit(target);
                          else void addPreparation();
                        }}
                        className="px-3 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-sm"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPrepFormOpen(false);
                          setEditingPrepId(null);
                          setPrepTitle("");
                          setPrepSteps([""]);
                        }}
                        className="px-3 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        <Modal
          open={assignGroupsModalOpen}
          onClose={() => setAssignGroupsModalOpen(false)}
          title="Assign Test Groups to Package"
          maxWidthClassName="max-w-2xl"
        >
          <div className="space-y-4">
            {assignGroupsError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {assignGroupsError}
              </div>
            )}
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="search"
                value={assignGroupsSearch}
                onChange={(e) => setAssignGroupsSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900"
                placeholder="Search groups..."
              />
            </div>

            {assignGroupsLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-h-56 overflow-y-auto border border-zinc-200 rounded-lg bg-white">
                  {filteredAllGroups.map((group) => (
                    <label
                      key={group.group_id}
                      className="flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0 border-zinc-200"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.includes(group.group_id)}
                          onChange={() => toggleGroupSelection(group.group_id)}
                        />
                        <span className="text-sm text-zinc-900 truncate">{group.group_name}</span>
                      </div>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
                        {group.test_count}
                      </span>
                    </label>
                  ))}
                  {filteredAllGroups.length === 0 && (
                    <div className="px-3 py-4 text-sm text-zinc-500">No groups found.</div>
                  )}
                </div>
                <div className="border border-zinc-200 rounded-lg bg-zinc-50 p-3">
                  <p className="text-sm font-medium text-zinc-900 mb-2">Selected order</p>
                  {selectedAssignGroups.length === 0 ? (
                    <p className="text-sm text-zinc-500">Select test groups to set their order.</p>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSelectedAssignGroupsDragEnd}>
                      <SortableContext items={selectedGroupIds} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {selectedAssignGroups.map((group, index) => (
                            <SortableItem
                              key={group.group_id}
                              id={group.group_id}
                              handle={<GripVertical className="w-4 h-4" />}
                              className="border border-zinc-200 rounded-lg px-3 py-2 bg-white"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs text-zinc-500">#{index + 1}</p>
                                  <p className="text-sm text-zinc-900 truncate">{group.group_name}</p>
                                </div>
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
                                  {group.test_count}
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
                disabled={assignGroupsSubmitting || assignGroupsLoading}
                onClick={() => void assignSelectedGroups()}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {assignGroupsSubmitting ? "Assigning..." : "Assign Selected"}
              </button>
              <button
                type="button"
                onClick={() => setAssignGroupsModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
