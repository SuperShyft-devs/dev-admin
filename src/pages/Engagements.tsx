import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { DataTable, type Column } from "../components/DataTable";
import { Modal } from "../components/Modal";
import {
  engagementsApi,
  organizationsApi,
  assessmentPackagesApi,
  type EngagementListItem,
  type Engagement,
  type EngagementCreate,
  type OrganizationListItem,
  type AssessmentPackage,
  getApiError,
} from "../lib/api";

const STATUS_OPTIONS = ["active", "inactive", "archived"];

export function Engagements() {
  const [data, setData] = useState<EngagementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
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

  const fetchOrgs = useCallback(() => {
    organizationsApi.list({ limit: 500 }).then((r) => setOrganizations(r.data.data));
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
      if (search) {
        const q = search.toLowerCase();
        items = items.filter(
          (e) =>
            (e.engagement_name ?? "").toLowerCase().includes(q) ||
            (e.engagement_code ?? "").toLowerCase().includes(q) ||
            (e.city ?? "").toLowerCase().includes(q)
        );
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
  }, [page, limit, statusFilter, search, sortKey, sortDir]);

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

  const columns: Column<EngagementListItem>[] = [
    { key: "engagement_name", label: "Name", sortable: true, render: (r) => r.engagement_name || r.engagement_code || "—" },
    { key: "engagement_code", label: "Code", sortable: true },
    { key: "organization_id", label: "Organisation", sortable: true, render: (r) => getOrgName(r.organization_id ?? 0) },
    { key: "engagement_type", label: "Type", sortable: true },
    { key: "city", label: "City", sortable: true },
    { key: "start_date", label: "Start", sortable: true },
    { key: "end_date", label: "End", sortable: true },
    { key: "status", label: "Status", sortable: true },
  ];

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Engagements</h1>
        <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 shrink-0" />
          Add Engagement
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-auto min-w-0 px-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
            <div><span className="text-zinc-500">Organisation ID:</span> {selected.organization_id ?? "—"}</div>
            <div><span className="text-zinc-500">Type:</span> {selected.engagement_type ?? "—"}</div>
            <div><span className="text-zinc-500">City:</span> {selected.city ?? "—"}</div>
            <div><span className="text-zinc-500">Start:</span> {String(selected.start_date ?? "—")}</div>
            <div><span className="text-zinc-500">End:</span> {String(selected.end_date ?? "—")}</div>
            <div><span className="text-zinc-500">Status:</span> {selected.status ?? "—"}</div>
            <div><span className="text-zinc-500">Participants:</span> {selected.participant_count ?? 0}</div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-4"
          >
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
            <div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
    </div>
  );
}
