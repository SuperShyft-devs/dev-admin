import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2, Users, UserCog, Trash2, X } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { ParticipantsModal } from "../../shared/ui/ParticipantsModal";
import { OccupiedSlotsModal } from "../../shared/ui/OccupiedSlotsModal";
import {
  engagementsApi,
  organizationsApi,
  assessmentPackagesApi,
  employeesApi,
  onboardingAssistantsApi,
  type EngagementListItem,
  type Engagement,
  type EngagementCreate,
  type OrganizationListItem,
  type AssessmentPackage,
  type EmployeeListItem,
  type OnboardingAssistant,
  getApiError,
} from "../../lib/api";

const STATUS_OPTIONS = ["active", "inactive", "archived"];

export function Engagements() {
  const [data, setData] = useState<EngagementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string>("engagement_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [assessmentPackages, setAssessmentPackages] = useState<AssessmentPackage[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "add" | "edit">("view");
  const [selected, setSelected] = useState<Engagement | null>(null);
  const [formData, setFormData] = useState<EngagementCreate>({
    engagement_name: "",
    organization_id: 0,
    engagement_type: "b2b",
    engagement_code: "",
    assessment_package_id: 0,
    diagnostic_package_id: undefined,
    city: "",
    slot_duration: 60,
    start_date: "",
    end_date: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<EngagementListItem | null>(null);

  const [participantsSource, setParticipantsSource] = useState<
    | { kind: "engagement-code"; code: string; name?: string }
    | { kind: "public" }
    | null
  >(null);

  const [occupiedSlotsSource, setOccupiedSlotsSource] = useState<
    | { kind: "engagement-code"; code: string; name?: string }
    | { kind: "public" }
    | null
  >(null);

  // ── Onboarding Assistants state ──────────────────────────────
  const [assistantsEngagement, setAssistantsEngagement] = useState<EngagementListItem | null>(null);
  const [assistantsModalOpen, setAssistantsModalOpen] = useState(false);
  const [assistants, setAssistants] = useState<OnboardingAssistant[]>([]);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [assistantsError, setAssistantsError] = useState<string | null>(null);
  const [removingAssistantId, setRemovingAssistantId] = useState<number | null>(null);

  // Add-assistants sub-panel state
  const [addAssistantsOpen, setAddAssistantsOpen] = useState(false);
  const [allEmployees, setAllEmployees] = useState<EmployeeListItem[]>([]);
  const [allEmployeesLoading, setAllEmployeesLoading] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
  const [assigningAssistants, setAssigningAssistants] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");

  const fetchOrgs = useCallback(async () => {
    try {
      const r = await organizationsApi.list({ page: 1, limit: 100 });
      setOrganizations(r.data.data);
    } catch (err) {
      setError(getApiError(err));
    }
  }, []);
  const fetchPackages = useCallback(() => {
    assessmentPackagesApi.list().then((r) => setAssessmentPackages(r.data.data));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await engagementsApi.list({
        page,
        limit,
        status: statusFilter || undefined,
      });
      let items = res.data.data;
      const typeSet = new Set<string>();
      const citySet = new Set<string>();
      items.forEach((item) => {
        const type = (item.engagement_type ?? "").trim();
        const city = (item.city ?? "").trim();
        if (type) typeSet.add(type);
        if (city) citySet.add(city);
      });
      setTypeOptions(Array.from(typeSet).sort((a, b) => a.localeCompare(b)));
      setCityOptions(Array.from(citySet).sort((a, b) => a.localeCompare(b)));

      if (search) {
        const q = search.toLowerCase();
        items = items.filter(
          (e) =>
            (e.engagement_name ?? "").toLowerCase().includes(q) ||
            (e.engagement_code ?? "").toLowerCase().includes(q) ||
            (e.city ?? "").toLowerCase().includes(q)
        );
      }
      if (typeFilter) {
        const type = typeFilter.toLowerCase();
        items = items.filter((e) => (e.engagement_type ?? "").toLowerCase() === type);
      }
      if (cityFilter) {
        const city = cityFilter.toLowerCase();
        items = items.filter((e) => (e.city ?? "").toLowerCase() === city);
      }
      const sorted = [...items].sort((a, b) => {
        const aVal = String(a[sortKey as keyof EngagementListItem] ?? "");
        const bVal = String(b[sortKey as keyof EngagementListItem] ?? "");
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
      setData(sorted);
      setTotal(res.data.meta.total);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, search, typeFilter, cityFilter, sortKey, sortDir]);

  useEffect(() => {
    fetchOrgs();
    fetchPackages();
  }, [fetchOrgs, fetchPackages]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openView = (row: EngagementListItem) => {
    engagementsApi.get(row.engagement_id).then((res) => {
      setSelected(res.data.data);
      setModalMode("view");
      setModalOpen(true);
    }).catch((err) => setError(getApiError(err)));
  };

  const openAdd = () => {
    setSelected(null);
    const today = new Date().toISOString().slice(0, 10);
    setFormData({
      engagement_name: "",
      organization_id: organizations[0]?.organization_id ?? 0,
      engagement_type: "b2b",
      engagement_code: "",
      assessment_package_id: assessmentPackages[0]?.package_id ?? 0,
      diagnostic_package_id: undefined,
      city: "",
      slot_duration: 60,
      start_date: today,
      end_date: today,
    });
    setModalMode("add");
    setModalOpen(true);
  };

  const openEdit = (row: EngagementListItem) => {
    engagementsApi.get(row.engagement_id).then((res) => {
      const e = res.data.data;
      setSelected(e);
      setFormData({
        engagement_name: e.engagement_name ?? "",
        organization_id: e.organization_id ?? 0,
        engagement_type: e.engagement_type ?? "b2b",
        engagement_code: e.engagement_code ?? "",
        assessment_package_id: e.assessment_package_id ?? 0,
        diagnostic_package_id: e.diagnostic_package_id ?? undefined,
        city: e.city ?? "",
        slot_duration: e.slot_duration ?? 60,
        start_date: (e.start_date ?? "").toString().slice(0, 10),
        end_date: (e.end_date ?? "").toString().slice(0, 10),
      });
      setModalMode("edit");
      setModalOpen(true);
    }).catch((err) => setError(getApiError(err)));
  };

  const handleSubmit = async () => {
    if (!formData.organization_id || !formData.assessment_package_id || !formData.start_date || !formData.end_date) {
      setError("Please fill required fields");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (modalMode === "add") {
        await engagementsApi.create(formData);
      } else if (selected) {
        const payload = {
          engagement_name: formData.engagement_name,
          organization_id: formData.organization_id,
          engagement_type: formData.engagement_type,
          assessment_package_id: formData.assessment_package_id,
          diagnostic_package_id: formData.diagnostic_package_id ?? undefined,
          city: formData.city,
          slot_duration: formData.slot_duration,
          start_date: formData.start_date,
          end_date: formData.end_date,
          metsights_engagement_id: (selected as Engagement & { metsights_engagement_id?: string }).metsights_engagement_id ?? undefined,
        };
        await engagementsApi.update(selected.engagement_id, payload);
      }
      setModalOpen(false);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: EngagementListItem) => {
    if (!deleteConfirm || deleteConfirm.engagement_id !== row.engagement_id) return;
    setSubmitting(true);
    try {
      await engagementsApi.updateStatus(row.engagement_id, "inactive");
      setDeleteConfirm(null);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const getOrgName = (id: number) => organizations.find((o) => o.organization_id === id)?.name ?? String(id);

  // ── Onboarding Assistants handlers ───────────────────────────
  const fetchAssistants = useCallback(async (engagementId: number) => {
    setAssistantsLoading(true);
    setAssistantsError(null);
    try {
      const res = await onboardingAssistantsApi.list(engagementId);
      setAssistants(res.data.data);
    } catch (err) {
      setAssistantsError(getApiError(err));
    } finally {
      setAssistantsLoading(false);
    }
  }, []);

  const openAssistantsModal = (row: EngagementListItem) => {
    setAssistantsEngagement(row);
    setAssistants([]);
    setAssistantsError(null);
    setAddAssistantsOpen(false);
    setSelectedEmployeeIds(new Set());
    setEmployeeSearch("");
    setAssistantsModalOpen(true);
    fetchAssistants(row.engagement_id);
  };

  const closeAssistantsModal = () => {
    setAssistantsModalOpen(false);
    setAssistantsEngagement(null);
    setAddAssistantsOpen(false);
    setSelectedEmployeeIds(new Set());
    setEmployeeSearch("");
  };

  const handleRemoveAssistant = async (employeeId: number) => {
    if (!assistantsEngagement) return;
    setRemovingAssistantId(employeeId);
    setAssistantsError(null);
    try {
      await onboardingAssistantsApi.remove(assistantsEngagement.engagement_id, employeeId);
      await fetchAssistants(assistantsEngagement.engagement_id);
    } catch (err) {
      setAssistantsError(getApiError(err));
    } finally {
      setRemovingAssistantId(null);
    }
  };

  const openAddAssistants = async () => {
    setAddAssistantsOpen(true);
    setSelectedEmployeeIds(new Set());
    setEmployeeSearch("");
    setAllEmployeesLoading(true);
    try {
      const res = await employeesApi.list({ status: "active", limit: 100 });
      setAllEmployees(res.data.data);
    } catch (err) {
      setAssistantsError(getApiError(err));
    } finally {
      setAllEmployeesLoading(false);
    }
  };

  const toggleEmployeeSelection = (id: number) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAssignAssistants = async () => {
    if (!assistantsEngagement || selectedEmployeeIds.size === 0) return;
    setAssigningAssistants(true);
    setAssistantsError(null);
    try {
      await onboardingAssistantsApi.assign(
        assistantsEngagement.engagement_id,
        Array.from(selectedEmployeeIds)
      );
      setAddAssistantsOpen(false);
      setSelectedEmployeeIds(new Set());
      await fetchAssistants(assistantsEngagement.engagement_id);
    } catch (err) {
      setAssistantsError(getApiError(err));
    } finally {
      setAssigningAssistants(false);
    }
  };

  // Employees not yet assigned as assistants for this engagement
  const assignedIds = new Set(assistants.map((a) => a.employee_id));
  const availableEmployees = allEmployees.filter((e) => !assignedIds.has(e.employee_id));
  const filteredEmployees = employeeSearch.trim()
    ? availableEmployees.filter((e) =>
        String(e.employee_id).includes(employeeSearch.trim()) ||
        (e.role ?? "").toLowerCase().includes(employeeSearch.trim().toLowerCase())
      )
    : availableEmployees;

  const openParticipants = (row: EngagementListItem) => {
    if (row.engagement_type === "b2b" && row.engagement_code) {
      setParticipantsSource({
        kind: "engagement-code",
        code: row.engagement_code,
        name: row.engagement_name ?? row.engagement_code,
      });
    } else {
      setParticipantsSource({ kind: "public" });
    }
  };

  const openOccupiedSlots = (row: EngagementListItem) => {
    if (row.engagement_code) {
      setOccupiedSlotsSource({
        kind: "engagement-code",
        code: row.engagement_code,
        name: row.engagement_name ?? row.engagement_code,
      });
    } else {
      setOccupiedSlotsSource({ kind: "public" });
    }
  };

  const columns: Column<EngagementListItem>[] = [
    { key: "engagement_name", label: "Name", sortable: true, render: (r) => r.engagement_name || r.engagement_code || "—" },
    { key: "engagement_code", label: "Code", sortable: true, hideOnTablet: true },
    { key: "organization_id", label: "Organisation", sortable: true, render: (r) => getOrgName(r.organization_id ?? 0), hideOnMobile: true },
    { key: "engagement_type", label: "Type", sortable: true, hideOnTablet: true },
    { key: "city", label: "City", sortable: true, hideOnTablet: true },
    { key: "start_date", label: "Start", sortable: true, hideOnMobile: true },
    { key: "end_date", label: "End", sortable: true, hideOnTablet: true },
    { key: "status", label: "Status", sortable: true },
  ];

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Engagements</h1>
        <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Add Engagement</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name, code, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <div className="flex flex-row gap-3 flex-wrap sm:flex-nowrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All cities</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={data}
            keyExtractor={(r) => r.engagement_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={openView}
            onEdit={openEdit}
            onParticipants={openParticipants}
            onOccupiedSlots={openOccupiedSlots}
            onAssistants={openAssistantsModal}
            onDelete={(r) => setDeleteConfirm(r)}
            pagination={{
              page,
              limit,
              total,
              onPageChange: setPage,
            }}
          />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          modalMode === "add"
            ? "Add Engagement"
            : modalMode === "edit"
            ? "Edit Engagement"
            : "View Engagement"
        }
      >
        {modalMode === "view" && selected ? (
          <div className="space-y-3 text-sm">
            <div><span className="text-zinc-500">Name:</span> {selected.engagement_name ?? "—"}</div>
            <div><span className="text-zinc-500">Code:</span> {selected.engagement_code ?? "—"}</div>
            <div><span className="text-zinc-500">Organisation:</span> {getOrgName(selected.organization_id ?? 0)}</div>
            <div><span className="text-zinc-500">Type:</span> {selected.engagement_type ?? "—"}</div>
            <div><span className="text-zinc-500">City:</span> {selected.city ?? "—"}</div>
            <div><span className="text-zinc-500">Start:</span> {String(selected.start_date ?? "—")}</div>
            <div><span className="text-zinc-500">End:</span> {String(selected.end_date ?? "—")}</div>
            <div><span className="text-zinc-500">Status:</span> {selected.status ?? "—"}</div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">Participants:</span>
              <span>{selected.participant_count ?? 0}</span>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  if (selected.engagement_type === "b2b" && selected.engagement_code) {
                    setParticipantsSource({
                      kind: "engagement-code",
                      code: selected.engagement_code,
                      name: selected.engagement_name ?? selected.engagement_code,
                    });
                  } else {
                    setParticipantsSource({ kind: "public" });
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium"
              >
                <Users className="w-3.5 h-3.5" />
                View Participants
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.engagement_name ?? ""}
                  onChange={(e) => setFormData({ ...formData, engagement_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Organisation *</label>
                <select
                  value={formData.organization_id}
                  onChange={(e) => setFormData({ ...formData, organization_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                >
                  <option value={0}>Select organisation</option>
                  {organizations.map((o) => (
                    <option key={o.organization_id} value={o.organization_id}>
                      {o.name ?? o.organization_id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Engagement Code</label>
                <input
                  type="text"
                  value={formData.engagement_code ?? ""}
                  onChange={(e) => setFormData({ ...formData, engagement_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Type *</label>
                <input
                  type="text"
                  value={formData.engagement_type}
                  onChange={(e) => setFormData({ ...formData, engagement_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Assessment Package *</label>
                <select
                  value={formData.assessment_package_id}
                  onChange={(e) => setFormData({ ...formData, assessment_package_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                >
                  <option value={0}>Select package</option>
                  {assessmentPackages.map((p) => (
                    <option key={p.package_id} value={p.package_id}>
                      {p.display_name ?? p.package_code ?? p.package_id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city ?? ""}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Slot duration (min)</label>
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={formData.slot_duration}
                  onChange={(e) => setFormData({ ...formData, slot_duration: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Start date *</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">End date *</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "Saving..." : modalMode === "add" ? "Create" : "Update"}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      {deleteConfirm && (
        <Modal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Confirm Deactivate"
        >
          <p className="text-zinc-600 text-sm mb-4">
            Deactivate engagement &quot;{deleteConfirm.engagement_name || deleteConfirm.engagement_code}&quot;? This will set status to inactive.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Deactivating..." : "Deactivate"}
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {participantsSource && (
        <ParticipantsModal
          open={!!participantsSource}
          onClose={() => setParticipantsSource(null)}
          source={participantsSource}
        />
      )}

      {occupiedSlotsSource && (
        <OccupiedSlotsModal
          open={!!occupiedSlotsSource}
          onClose={() => setOccupiedSlotsSource(null)}
          source={occupiedSlotsSource}
        />
      )}

      {/* ── Onboarding Assistants Modal ─────────────────────── */}
      <Modal
        open={assistantsModalOpen}
        onClose={closeAssistantsModal}
        title={
          assistantsEngagement
            ? `Onboarding Assistants — ${assistantsEngagement.engagement_name || assistantsEngagement.engagement_code || "Engagement"}`
            : "Onboarding Assistants"
        }
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-4">
          {assistantsError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {assistantsError}
            </div>
          )}

          {/* Assigned assistants list */}
          {!addAssistantsOpen && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700">
                  Assigned ({assistants.length})
                </p>
                <button
                  type="button"
                  onClick={openAddAssistants}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Assistants
                </button>
              </div>

              {assistantsLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              ) : assistants.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  No onboarding assistants assigned yet.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
                  {assistants.map((a) => (
                    <li
                      key={a.employee_id}
                      className="flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-zinc-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                          <UserCog className="w-4 h-4 text-zinc-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            Employee #{a.employee_id}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {a.role ? `Role: ${a.role}` : "No role"}{" "}
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ml-1 ${
                                a.status === "active"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-zinc-100 text-zinc-500"
                              }`}
                            >
                              {a.status ?? "—"}
                            </span>
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAssistant(a.employee_id)}
                        disabled={removingAssistantId === a.employee_id}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 shrink-0"
                        title="Remove assistant"
                        aria-label="Remove assistant"
                      >
                        {removingAssistantId === a.employee_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* Add assistants sub-panel */}
          {addAssistantsOpen && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700">
                  Select employees to assign
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAddAssistantsOpen(false);
                    setSelectedEmployeeIds(new Set());
                    setEmployeeSearch("");
                  }}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="search"
                  placeholder="Search by role or ID…"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>

              {/* Employee list */}
              {allEmployeesLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-500">
                  {availableEmployees.length === 0
                    ? "All active employees are already assigned."
                    : "No employees match your search."}
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  {filteredEmployees.map((e) => {
                    const checked = selectedEmployeeIds.has(e.employee_id);
                    return (
                      <li
                        key={e.employee_id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 ${
                          checked ? "bg-zinc-50" : "bg-white"
                        }`}
                        onClick={() => toggleEmployeeSelection(e.employee_id)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmployeeSelection(e.employee_id)}
                          onClick={(ev) => ev.stopPropagation()}
                          className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            Employee #{e.employee_id}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {e.role ? `Role: ${e.role}` : "No role"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Assign button */}
              <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAssignAssistants}
                  disabled={selectedEmployeeIds.size === 0 || assigningAssistants}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
                >
                  {assigningAssistants
                    ? "Assigning…"
                    : `Assign${selectedEmployeeIds.size > 0 ? ` (${selectedEmployeeIds.size})` : ""}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddAssistantsOpen(false);
                    setSelectedEmployeeIds(new Set());
                    setEmployeeSearch("");
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
