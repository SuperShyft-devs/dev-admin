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
import { GripVertical, Loader2, Search, Trash2, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { SortableItem } from "../../components/SortableItem";
import { Modal } from "../../shared/ui/Modal";
import { PermissionGate } from "../../contexts/PermissionContext";
import {
  diagnosticFilterChipsApi,
  diagnosticTestGroupsApi,
  diagnosticTestsApi,
  getApiError,
  type DiagnosticFilterChip,
  type DiagnosticTestGroupStandalone,
  type DiagnosticTestStandalone,
} from "../../lib/api";
import { diagnosticProviderDisplayLabel, isHealthiansProvider } from "./providerParameterKeys";
import { TestGroupProviderMapModal } from "./TestGroupProviderMapModal";
import { DiagnosticPackageProviderCompare } from "./DiagnosticPackageProviderCompare";
import { HealthiansMapModal, type MapModalTest } from "./HealthiansMapModal";

interface DiagnosticTestGroupDetailContentProps {
  groupId: number;
  onUpdated?: () => void;
}

export function DiagnosticTestGroupDetailContent({ groupId, onUpdated }: DiagnosticTestGroupDetailContentProps) {
  const [detail, setDetail] = useState<DiagnosticTestGroupStandalone | null>(null);
  const [groupTests, setGroupTests] = useState<DiagnosticTestStandalone[]>([]);
  const [loading, setLoading] = useState(true);
  const [testsLoading, setTestsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupTestsError, setGroupTestsError] = useState<string | null>(null);

  const [groupFilterChipCatalog, setGroupFilterChipCatalog] = useState<DiagnosticFilterChip[]>([]);
  const [selectedGroupFilterChipId, setSelectedGroupFilterChipId] = useState("");

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [allTests, setAllTests] = useState<DiagnosticTestStandalone[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<number[]>([]);
  const [assignNote, setAssignNote] = useState<string | null>(null);
  const [reorderingTests, setReorderingTests] = useState(false);

  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [paramMapOpen, setParamMapOpen] = useState(false);
  const [paramMapTest, setParamMapTest] = useState<MapModalTest | null>(null);
  const [compareRefresh, setCompareRefresh] = useState(0);

  const needsProviderMapping = useMemo(() => {
    if (!detail) return false;
    if (!detail.diagnostic_provider) return true;
    if (isHealthiansProvider(detail.diagnostic_provider)) {
      return !(detail.external_test_group_code ?? "").trim();
    }
    return false;
  }, [detail]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await diagnosticTestGroupsApi.get(groupId);
      setDetail(res.data.data);
    } catch (err) {
      setError(getApiError(err));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const loadTests = useCallback(async () => {
    setTestsLoading(true);
    setGroupTestsError(null);
    try {
      const res = await diagnosticTestGroupsApi.getTests(groupId);
      setGroupTests(res.data.data ?? []);
    } catch (err) {
      setGroupTestsError(getApiError(err));
      setGroupTests([]);
    } finally {
      setTestsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadDetail();
    void loadTests();
    void diagnosticFilterChipsApi
      .list("custom_package")
      .then((res) => setGroupFilterChipCatalog(res.data.data ?? []))
      .catch(() => setGroupFilterChipCatalog([]));
  }, [loadDetail, loadTests]);

  const groupAssignedFilterChips = useMemo(
    () =>
      [...(detail?.filter_chips ?? [])].sort(
        (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
      ),
    [detail?.filter_chips]
  );

  const assignableGroupFilterChips = useMemo(() => {
    const assigned = new Set(groupAssignedFilterChips.map((c) => c.filter_chip_id));
    return groupFilterChipCatalog.filter((c) => !assigned.has(c.filter_chip_id));
  }, [groupAssignedFilterChips, groupFilterChipCatalog]);

  const addGroupFilterChip = async () => {
    if (!selectedGroupFilterChipId) return;
    setGroupTestsError(null);
    try {
      await diagnosticTestGroupsApi.addFilterChip(groupId, {
        filter_chip_id: Number(selectedGroupFilterChipId),
      });
      setSelectedGroupFilterChipId("");
      await loadDetail();
      onUpdated?.();
    } catch (err) {
      setGroupTestsError(getApiError(err));
    }
  };

  const removeGroupFilterChip = async (filterChipId: number) => {
    if (!window.confirm("Remove this filter chip from the group?")) return;
    setGroupTestsError(null);
    try {
      await diagnosticTestGroupsApi.removeFilterChip(groupId, filterChipId);
      await loadDetail();
      onUpdated?.();
    } catch (err) {
      setGroupTestsError(getApiError(err));
    }
  };

  const handleRemoveTest = async (test: DiagnosticTestStandalone) => {
    if (!window.confirm("Remove this test from this group?")) return;
    try {
      await diagnosticTestGroupsApi.removeTest(groupId, test.test_id);
      await loadTests();
      await loadDetail();
      onUpdated?.();
    } catch (err) {
      setGroupTestsError(getApiError(err));
    }
  };

  const openAssignModal = async () => {
    setAssignModalOpen(true);
    setAssignLoading(true);
    setAssignError(null);
    setAssignNote(null);
    setAssignSearch("");
    try {
      const [allTestsRes, assignedRes] = await Promise.all([
        diagnosticTestsApi.list({ parameter_type: "test" }),
        diagnosticTestGroupsApi.getTests(groupId),
      ]);
      setAllTests(allTestsRes.data.data ?? []);
      setSelectedTestIds((assignedRes.data.data ?? []).map((item) => item.test_id));
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
    if (reorderingTests || testsLoading || groupTests.length < 2) return;
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
      await diagnosticTestGroupsApi.reorderTests(groupId, { test_ids: next.map((item) => item.test_id) });
      await loadTests();
    } catch (err) {
      setGroupTests(previous);
      setGroupTestsError(getApiError(err));
    } finally {
      setReorderingTests(false);
    }
  };

  const handleAssign = async () => {
    if (selectedTestIds.length === 0) {
      setAssignError("Select at least one test.");
      return;
    }
    setAssignSubmitting(true);
    setAssignError(null);
    try {
      const res = await diagnosticTestGroupsApi.assignTests(groupId, { test_ids: selectedTestIds });
      const latestAssignedRes = await diagnosticTestGroupsApi.getTests(groupId);
      const latestAssignedIds = (latestAssignedRes.data.data ?? []).map((item) => item.test_id);
      const orderedIds = [
        ...selectedTestIds,
        ...latestAssignedIds.filter((testId) => !selectedTestIds.includes(testId)),
      ];
      await diagnosticTestGroupsApi.reorderTests(groupId, { test_ids: orderedIds });
      const data = res.data.data;
      setAssignNote(`${data.added_test_ids.length} tests added. ${data.skipped_test_ids.length} already assigned (skipped).`);
      setAssignModalOpen(false);
      await loadTests();
      await loadDetail();
      onUpdated?.();
    } catch (err) {
      setAssignError(getApiError(err));
    } finally {
      setAssignSubmitting(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error && !detail) {
    return <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>;
  }

  if (!detail) return null;

  return (
    <div className="space-y-4">
      {assignNote && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{assignNote}</div>
      )}
      {groupTestsError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{groupTestsError}</div>
      )}

      {needsProviderMapping ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p>
              This test group is missing a lab provider or Healthians profile code. Map it to a lab catalog profile
              before using it on packages.
            </p>
            <PermissionGate category="diagnostics" action="edit" taskKey="tests_groups">
              <button
                type="button"
                onClick={() => setMapModalOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 text-xs font-medium hover:bg-amber-200"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                Map
              </button>
            </PermissionGate>
          </div>
        </div>
      ) : null}

      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-medium text-zinc-900">Overview</h3>
          {!needsProviderMapping ? (
            <PermissionGate category="diagnostics" action="edit" taskKey="tests_groups">
              <button
                type="button"
                onClick={() => setMapModalOpen(true)}
                className="text-xs font-medium text-zinc-600 hover:text-zinc-900 underline underline-offset-2"
              >
                Remap
              </button>
            </PermissionGate>
          ) : null}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {detail.test_group_image ? (
            <div className="sm:col-span-2">
              <dt className="text-zinc-500 mb-1">Image</dt>
              <dd>
                <img
                  src={detail.test_group_image}
                  alt=""
                  className="h-20 w-20 rounded-lg object-cover border border-zinc-200"
                />
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-zinc-500">Provider</dt>
            <dd className="text-zinc-900">{detail.diagnostic_provider ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">
              {diagnosticProviderDisplayLabel(detail.diagnostic_provider)} test group code
            </dt>
            <dd className="text-zinc-900">{detail.external_test_group_code ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Price</dt>
            <dd className="text-zinc-900">{detail.price != null ? `₹${detail.price}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Original price</dt>
            <dd className="text-zinc-900">{detail.original_price != null ? `₹${detail.original_price}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Gender</dt>
            <dd className="text-zinc-900">{detail.gender_suitability ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Package for</dt>
            <dd className="text-zinc-900">{detail.package_for ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Flags</dt>
            <dd className="text-zinc-900">
              {[
                detail.is_most_popular ? "Most popular" : null,
                detail.has_allergy_screening ? "Allergy screening" : null,
                detail.has_cancer_screening ? "Cancer screening" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
          </div>
        </dl>
      </div>

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
                <PermissionGate category="diagnostics" action="edit" taskKey="tests_groups">
                  <button
                    type="button"
                    onClick={() => void removeGroupFilterChip(chip.filter_chip_id)}
                    className="p-0.5 rounded hover:bg-zinc-200 text-zinc-600"
                    aria-label={`Remove ${chip.display_name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </PermissionGate>
              </span>
            ))
          )}
        </div>
        <PermissionGate category="diagnostics" action="edit" taskKey="tests_groups">
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
        </PermissionGate>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-900">Tests in this group</h3>
          <PermissionGate category="diagnostics" action="edit" taskKey="tests_groups">
            <button
              type="button"
              onClick={() => void openAssignModal()}
              className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
            >
              Assign Tests
            </button>
          </PermissionGate>
        </div>
        {testsLoading ? (
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
                      <p className="text-sm text-zinc-900">{test.test_name}</p>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            test.is_available ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          {test.is_available ? "Yes" : "No"}
                        </span>
                        <PermissionGate category="diagnostics" action="edit" taskKey="tests_groups">
                          <button
                            type="button"
                            onClick={() => void handleRemoveTest(test)}
                            className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                            aria-label={`Remove ${test.test_name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </PermissionGate>
                      </div>
                    </div>
                  </SortableItem>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {isHealthiansProvider(detail.diagnostic_provider) &&
      (detail.external_test_group_code ?? "").trim() ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-900 mb-3">Healthians compare</h3>
          <DiagnosticPackageProviderCompare
            testGroupId={groupId}
            externalPackageCode={detail.external_test_group_code}
            onlyInEntityLabel="only in this group"
            refreshToken={compareRefresh}
            onMapTest={(testId, testName) => {
              const row = groupTests.find((t) => t.test_id === testId);
              setParamMapTest(
                row ?? {
                  test_id: testId,
                  test_name: testName,
                }
              );
              setParamMapOpen(true);
            }}
          />
        </div>
      ) : null}

      <TestGroupProviderMapModal
        open={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        groupId={groupId}
        groupName={detail.group_name}
        currentProvider={detail.diagnostic_provider}
        currentExternalCode={detail.external_test_group_code}
        onComplete={async () => {
          await loadDetail();
          await loadTests();
          setCompareRefresh((n) => n + 1);
          onUpdated?.();
        }}
      />

      {paramMapTest && detail ? (
        <HealthiansMapModal
          open={paramMapOpen}
          onClose={() => {
            setParamMapOpen(false);
            setParamMapTest(null);
          }}
          testId={paramMapTest.test_id}
          testName={paramMapTest.test_name}
          currentHealthiansParameterId={paramMapTest.healthians_parameter_key}
          diagnosticProvider={detail.diagnostic_provider}
          externalPackageCode={detail.external_test_group_code}
          healthiansDealType="profile"
          allTests={groupTests}
          onMapped={async () => {
            await loadTests();
            setCompareRefresh((n) => n + 1);
          }}
          onSwitchTest={(test) => setParamMapTest(test)}
        />
      ) : null}

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
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        test.is_available ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
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
