import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { DataTable, type Column } from "../components/DataTable";
import { Modal } from "../components/Modal";
import {
  organizationsApi,
  type OrganizationListItem,
  type Organization,
  type OrganizationCreate,
  getApiError,
} from "../lib/api";

const STATUS_OPTIONS = ["active", "inactive", "archived"];

export function Organisations() {
  const [data, setData] = useState<OrganizationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "add" | "edit">("view");
  const [selected, setSelected] = useState<Organization | null>(null);
  const [formData, setFormData] = useState<OrganizationCreate>({
    name: "",
    organization_type: "",
    logo: "",
    website_url: "",
    address: "",
    pin_code: "",
    city: "",
    state: "",
    country: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    contact_designation: "",
    bd_employee_id: undefined,
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OrganizationListItem | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await organizationsApi.list({
        page,
        limit,
        status: statusFilter || undefined,
      });
      let items = res.data.data;
      if (search) {
        const q = search.toLowerCase();
        items = items.filter(
          (o) =>
            (o.name ?? "").toLowerCase().includes(q) ||
            (o.city ?? "").toLowerCase().includes(q) ||
            (o.country ?? "").toLowerCase().includes(q)
        );
      }
      const sorted = [...items].sort((a, b) => {
        const aVal = String(a[sortKey as keyof OrganizationListItem] ?? "");
        const bVal = String(b[sortKey as keyof OrganizationListItem] ?? "");
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
    fetchList();
  }, [fetchList]);

  const openView = (row: OrganizationListItem) => {
    organizationsApi.get(row.organization_id).then((res) => {
      setSelected(res.data.data);
      setModalMode("view");
      setModalOpen(true);
    }).catch((err) => setError(getApiError(err)));
  };

  const openAdd = () => {
    setSelected(null);
    setFormData({
      name: "",
      organization_type: "",
      logo: "",
      website_url: "",
      address: "",
      pin_code: "",
      city: "",
      state: "",
      country: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      contact_designation: "",
      bd_employee_id: undefined,
    });
    setModalMode("add");
    setModalOpen(true);
  };

  const openEdit = (row: OrganizationListItem) => {
    organizationsApi.get(row.organization_id).then((res) => {
      const o = res.data.data;
      setSelected(o);
      setFormData({
        name: o.name ?? "",
        organization_type: o.organization_type ?? "",
        logo: o.logo ?? "",
        website_url: o.website_url ?? "",
        address: o.address ?? "",
        pin_code: o.pin_code ?? "",
        city: o.city ?? "",
        state: o.state ?? "",
        country: o.country ?? "",
        contact_name: o.contact_name ?? "",
        contact_email: o.contact_email ?? "",
        contact_phone: o.contact_phone ?? "",
        contact_designation: o.contact_designation ?? "",
        bd_employee_id: o.bd_employee_id ?? undefined,
      });
      setModalMode("edit");
      setModalOpen(true);
    }).catch((err) => setError(getApiError(err)));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    setSubmitting(true);
    try {
      if (modalMode === "add") {
        await organizationsApi.create(formData);
      } else if (selected) {
        await organizationsApi.update(selected.organization_id, formData);
      }
      setModalOpen(false);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: OrganizationListItem) => {
    if (!deleteConfirm || deleteConfirm.organization_id !== row.organization_id) return;
    setSubmitting(true);
    try {
      await organizationsApi.updateStatus(row.organization_id, "inactive");
      setDeleteConfirm(null);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<OrganizationListItem>[] = [
    { key: "name", label: "Name", sortable: true },
    { key: "organization_type", label: "Type", sortable: true },
    { key: "city", label: "City", sortable: true },
    { key: "country", label: "Country", sortable: true },
    { key: "status", label: "Status", sortable: true },
  ];

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Organisations</h1>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          Add Organisation
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name, city, country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
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
            keyExtractor={(r) => r.organization_id}
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
            ? "Add Organisation"
            : modalMode === "edit"
            ? "Edit Organisation"
            : "View Organisation"
        }
      >
        {modalMode === "view" && selected ? (
          <div className="space-y-3 text-sm">
            <div><span className="text-zinc-500">Name:</span> {selected.name}</div>
            <div><span className="text-zinc-500">Type:</span> {selected.organization_type ?? "—"}</div>
            <div><span className="text-zinc-500">Address:</span> {selected.address ?? "—"}</div>
            <div><span className="text-zinc-500">City:</span> {selected.city ?? "—"}</div>
            <div><span className="text-zinc-500">State:</span> {selected.state ?? "—"}</div>
            <div><span className="text-zinc-500">Country:</span> {selected.country ?? "—"}</div>
            <div><span className="text-zinc-500">Contact:</span> {selected.contact_name ?? "—"}</div>
            <div><span className="text-zinc-500">Email:</span> {selected.contact_email ?? "—"}</div>
            <div><span className="text-zinc-500">Phone:</span> {selected.contact_phone ?? "—"}</div>
            <div><span className="text-zinc-500">Status:</span> {selected.status ?? "—"}</div>
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
              <label className="block text-sm font-medium text-zinc-700 mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Type</label>
              <input
                type="text"
                value={formData.organization_type ?? ""}
                onChange={(e) => setFormData({ ...formData, organization_type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
              <input
                type="text"
                value={formData.address ?? ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium text-zinc-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state ?? ""}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Country</label>
              <input
                type="text"
                value={formData.country ?? ""}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Contact Name</label>
              <input
                type="text"
                value={formData.contact_name ?? ""}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Contact Email</label>
              <input
                type="email"
                value={formData.contact_email ?? ""}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Contact Phone</label>
              <input
                type="text"
                value={formData.contact_phone ?? ""}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "Saving..." : modalMode === "add" ? "Create" : "Update"}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
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
            Deactivate organisation &quot;{deleteConfirm.name}&quot;? This will set status to inactive.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Deactivating..." : "Deactivate"}
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
