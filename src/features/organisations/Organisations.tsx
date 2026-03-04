import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2, Users } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { ParticipantsModal } from "../../shared/ui/ParticipantsModal";
import {
  organizationsApi,
  employeesApi,
  usersApi,
  type EmployeeListItem,
  type UserListItem,
  type OrganizationListItem,
  type Organization,
  type OrganizationCreate,
  getApiError,
} from "../../lib/api";

const STATUS_OPTIONS = ["active", "inactive", "archived"];

export function Organisations() {
  const [data, setData] = useState<OrganizationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
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
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [usersById, setUsersById] = useState<Record<number, UserListItem>>({});
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OrganizationListItem | null>(null);

  const [participantsOrg, setParticipantsOrg] = useState<{
    orgId: number;
    orgName?: string;
  } | null>(null);

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
      const citySet = new Set<string>();
      const countrySet = new Set<string>();
      items.forEach((item) => {
        const city = (item.city ?? "").trim();
        const country = (item.country ?? "").trim();
        if (city) citySet.add(city);
        if (country) countrySet.add(country);
      });
      setCityOptions(Array.from(citySet).sort((a, b) => a.localeCompare(b)));
      setCountryOptions(Array.from(countrySet).sort((a, b) => a.localeCompare(b)));

      if (search) {
        const q = search.toLowerCase();
        items = items.filter(
          (o) =>
            (o.name ?? "").toLowerCase().includes(q) ||
            (o.city ?? "").toLowerCase().includes(q) ||
            (o.country ?? "").toLowerCase().includes(q)
        );
      }
      if (cityFilter) {
        const city = cityFilter.toLowerCase();
        items = items.filter((o) => (o.city ?? "").toLowerCase() === city);
      }
      if (countryFilter) {
        const country = countryFilter.toLowerCase();
        items = items.filter((o) => (o.country ?? "").toLowerCase() === country);
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
  }, [page, limit, statusFilter, search, cityFilter, countryFilter, sortKey, sortDir]);

  const fetchEmployees = useCallback(async () => {
    setEmployeeLoading(true);
    setError(null);
    try {
      const [employeeRes, usersRes] = await Promise.all([
        employeesApi.list({ status: "active" }),
        usersApi.list({ status: "active" }),
      ]);
      const list = employeeRes.data.data;
      setEmployees(list);
      const usersIndex = usersRes.data.data.reduce<Record<number, UserListItem>>((acc, user) => {
        acc[user.user_id] = user;
        return acc;
      }, {});
      setUsersById(usersIndex);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setEmployeeLoading(false);
    }
  }, []);

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
    fetchEmployees();
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
      fetchEmployees();
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
      await organizationsApi.updateStatus(row.organization_id, "archived");
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
    { key: "organization_type", label: "Type", sortable: true, hideOnMobile: true },
    { key: "city", label: "City", sortable: true, hideOnMobile: true },
    { key: "country", label: "Country", sortable: true, hideOnTablet: true },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => {
        const isActive = (row.status ?? "").toLowerCase() === "active";
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const nextStatus = isActive ? "inactive" : "active";
              organizationsApi
                .updateStatus(row.organization_id, nextStatus)
                .then(() => fetchList())
                .catch((err) => setError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition ${
              isActive ? "bg-emerald-500" : "bg-zinc-300"
            }`}
            aria-pressed={isActive}
            aria-label={`Set ${row.name ?? "organization"} ${isActive ? "inactive" : "active"}`}
          >
            <span
              className={`h-5 w-5 bg-white rounded-full shadow transform transition translate-x-0.5 ${
                isActive ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        );
      },
    },
  ];

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Organisations</h1>
        <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Add Organisation</span>
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
            placeholder="Search by name, city, country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <div className="flex flex-row gap-3 flex-wrap sm:flex-nowrap">
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
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All countries</option>
            {countryOptions.map((country) => (
              <option key={country} value={country}>
                {country}
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
            keyExtractor={(r) => r.organization_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={openView}
            onEdit={openEdit}
            onParticipants={(r) =>
              setParticipantsOrg({ orgId: r.organization_id, orgName: r.name ?? undefined })
            }
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
        maxWidthClassName={modalMode === "view" ? "max-w-xl" : "max-w-3xl"}
      >
        {modalMode === "view" && selected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><span className="text-zinc-500">Name:</span> {selected.name}</div>
              <div><span className="text-zinc-500">Type:</span> {selected.organization_type ?? "—"}</div>
              <div><span className="text-zinc-500">Logo URL:</span> {selected.logo ?? "—"}</div>
              <div><span className="text-zinc-500">Website:</span> {selected.website_url ?? "—"}</div>
              <div className="md:col-span-2"><span className="text-zinc-500">Address:</span> {selected.address ?? "—"}</div>
              <div><span className="text-zinc-500">Pin Code:</span> {selected.pin_code ?? "—"}</div>
              <div><span className="text-zinc-500">City:</span> {selected.city ?? "—"}</div>
              <div><span className="text-zinc-500">State:</span> {selected.state ?? "—"}</div>
              <div><span className="text-zinc-500">Country:</span> {selected.country ?? "—"}</div>
              <div><span className="text-zinc-500">Contact:</span> {selected.contact_name ?? "—"}</div>
              <div><span className="text-zinc-500">Designation:</span> {selected.contact_designation ?? "—"}</div>
              <div><span className="text-zinc-500">Email:</span> {selected.contact_email ?? "—"}</div>
              <div><span className="text-zinc-500">Phone:</span> {selected.contact_phone ?? "—"}</div>
              <div><span className="text-zinc-500">BD Employee ID:</span> {selected.bd_employee_id ?? "—"}</div>
              <div><span className="text-zinc-500">Status:</span> {selected.status ?? "—"}</div>
            </div>
            <div className="pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setParticipantsOrg({
                    orgId: selected.organization_id,
                    orgName: selected.name ?? undefined,
                  });
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium"
              >
                <Users className="w-4 h-4" />
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
                <label className="block text-sm font-medium text-zinc-700 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={formData.logo ?? ""}
                  onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Website</label>
                <input
                  type="url"
                  value={formData.website_url ?? ""}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="https://"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address ?? ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Pin Code</label>
                <input
                  type="text"
                  value={formData.pin_code ?? ""}
                  onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
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
                <label className="block text-sm font-medium text-zinc-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state ?? ""}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
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
                <label className="block text-sm font-medium text-zinc-700 mb-1">Contact Designation</label>
                <input
                  type="text"
                  value={formData.contact_designation ?? ""}
                  onChange={(e) => setFormData({ ...formData, contact_designation: e.target.value })}
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
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">BD Employee</label>
                <select
                  value={formData.bd_employee_id ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setFormData({
                      ...formData,
                      bd_employee_id: raw ? Number(raw) : undefined,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  disabled={employeeLoading}
                >
                  <option value="">Unassigned</option>
                  {employees.map((employee) => {
                    const user = usersById[employee.user_id];
                    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
                    return (
                      <option key={employee.employee_id} value={employee.employee_id}>
                        {name || `User ${employee.user_id}`} (#{employee.employee_id}){employee.role ? ` • ${employee.role}` : ""}
                      </option>
                    );
                  })}
                </select>
                {employeeLoading && (
                  <p className="mt-1 text-xs text-zinc-500">Loading employees...</p>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
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

      {participantsOrg && (
        <ParticipantsModal
          open={!!participantsOrg}
          onClose={() => setParticipantsOrg(null)}
          source={{
            kind: "organization",
            orgId: participantsOrg.orgId,
            orgName: participantsOrg.orgName,
          }}
        />
      )}

      {deleteConfirm && (
        <Modal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Confirm Archive"
        >
          <p className="text-zinc-600 text-sm mb-4">
            Archive organisation &quot;{deleteConfirm.name}&quot;? This will set status to archived.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Archiving..." : "Archive"}
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
