import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { EngagementMultiSearchPicker } from "../../shared/ui/EngagementMultiSearchPicker";
import {
  partnersApi,
  onboardingAssistantsApi,
  type PartnerListItem,
  type PartnerCreate,
  type PartnerUpdate,
  getApiError,
} from "../../lib/api";
import { PermissionGate, usePermissions } from "../../contexts/PermissionContext";

const STATUS_OPTIONS = ["active", "inactive", "archived"];
const ROLE_OPTIONS = [
  { value: "phlebo", label: "Phlebo" },
  { value: "expert", label: "Expert" },
  { value: "organization_manager", label: "Organization Manager" },
] as const;
const ASSIGNABLE_PARTNER_ROLES = new Set(["phlebo", "expert"]);
const SEARCH_DEBOUNCE_MS = 300;

type ModalMode = "add" | "edit";

const emptyForm = (): PartnerCreate => ({
  name: "",
  phone: "",
  email: "",
  role: "phlebo",
  status: "active",
});

function roleLabel(role: string | null | undefined): string {
  if (role === "phlebo") return "Phlebo";
  if (role === "expert") return "Expert";
  if (role === "organization_manager") return "Organization Manager";
  return role || "—";
}

export function Partners() {
  const { canEditTask } = usePermissions();
  const mayEditDirectory = canEditTask("partners", "directory");
  const mayEditStatus = canEditTask("partners", "status");

  const [data, setData] = useState<PartnerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sortKey, setSortKey] = useState("partner_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [selected, setSelected] = useState<PartnerListItem | null>(null);
  const [formData, setFormData] = useState<PartnerCreate>(emptyForm());
  const [engagementIds, setEngagementIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canAssignToEngagements = ASSIGNABLE_PARTNER_ROLES.has(
    String(formData.role || "").toLowerCase()
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await partnersApi.list({
        page,
        limit,
        status: statusFilter || undefined,
        role: roleFilter || undefined,
        search: debouncedSearch || undefined,
        sort_by: sortKey,
        sort_dir: sortDir,
      });
      setData(res.data.data);
      setTotal(res.data.meta.total);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, roleFilter, debouncedSearch, sortKey, sortDir]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, roleFilter]);

  const openAdd = () => {
    setSelected(null);
    setFormData(emptyForm());
    setEngagementIds([]);
    setModalMode("add");
    setModalOpen(true);
    setError(null);
  };

  const openEdit = (row: PartnerListItem) => {
    setSelected(row);
    setFormData({
      name: row.name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      role: row.role ?? "phlebo",
      status: row.status ?? "active",
    });
    setEngagementIds([]);
    setModalMode("edit");
    setModalOpen(true);
    setError(null);
  };

  const assignToEngagements = async (partnerId: number, ids: number[]) => {
    if (ids.length === 0) return;
    const failures: string[] = [];
    for (const engagementId of ids) {
      try {
        await onboardingAssistantsApi.assign(engagementId, { partner_ids: [partnerId] });
      } catch (err) {
        failures.push(`#${engagementId}: ${getApiError(err)}`);
      }
    }
    if (failures.length) {
      throw new Error(
        `Partner saved, but some engagement assignments failed: ${failures.join("; ")}`
      );
    }
  };

  const handleSubmit = async () => {
    const name = formData.name.trim();
    const phone = (formData.phone ?? "").trim();
    const email = (formData.email ?? "").trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    if (!phone && !email) {
      setError("Provide at least one of phone or email");
      return;
    }
    if (!formData.role) {
      setError("Role is required");
      return;
    }
    const role = String(formData.role).toLowerCase();
    const assignIds =
      ASSIGNABLE_PARTNER_ROLES.has(role) && engagementIds.length > 0 ? [...engagementIds] : [];

    setSubmitting(true);
    setError(null);
    try {
      let partnerId: number | null = null;
      if (modalMode === "add") {
        const created = await partnersApi.create({
          name,
          phone: phone || null,
          email: email || null,
          role: formData.role,
          status: formData.status ?? "active",
        });
        partnerId = created.data.data.partner_id;
      } else if (selected) {
        const payload: PartnerUpdate = {
          name,
          phone: phone || null,
          email: email || null,
          role: formData.role,
        };
        await partnersApi.update(selected.partner_id, payload);
        partnerId = selected.partner_id;
      }
      if (partnerId != null && assignIds.length > 0) {
        await assignToEngagements(partnerId, assignIds);
      }
      setModalOpen(false);
      setEngagementIds([]);
      fetchList();
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Partner saved")) {
        setError(err.message);
        fetchList();
      } else {
        setError(getApiError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<PartnerListItem>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => <span className="font-medium text-zinc-900">{row.name || "—"}</span>,
    },
    {
      key: "phone",
      label: "Phone",
      hideOnMobile: true,
      render: (row) => row.phone || "—",
    },
    {
      key: "email",
      label: "Email",
      hideOnTablet: true,
      render: (row) => row.email || "—",
    },
    {
      key: "role",
      label: "Role",
      sortable: true,
      hideOnMobile: true,
      render: (row) => roleLabel(row.role),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => {
        const isActive = (row.status ?? "").toLowerCase() === "active";
        return (
          <button
            type="button"
            disabled={!mayEditStatus}
            onClick={(event) => {
              event.stopPropagation();
              if (!mayEditStatus) return;
              const nextStatus = isActive ? "inactive" : "active";
              partnersApi
                .updateStatus(row.partner_id, nextStatus)
                .then(() => fetchList())
                .catch((err) => setError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition disabled:cursor-not-allowed disabled:opacity-80 ${
              isActive ? "bg-emerald-500" : "bg-zinc-300"
            }`}
            aria-pressed={isActive}
            aria-label={`Set ${row.name} ${isActive ? "inactive" : "active"}`}
          >
            <span
              className={`h-5 w-5 bg-white rounded-full shadow transform transition ${
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
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Partners</h1>
        <PermissionGate category="partners" taskKey="directory" action="edit">
          <button
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Partner</span>
          </button>
        </PermissionGate>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
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
            keyExtractor={(r) => r.partner_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onEdit={mayEditDirectory ? openEdit : undefined}
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
        title={modalMode === "add" ? "Add Partner" : "Edit Partner"}
        maxWidthClassName="max-w-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
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
            <label className="block text-sm font-medium text-zinc-700 mb-1">Phone</label>
            <input
              type="tel"
              value={formData.phone ?? ""}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              placeholder="e.g. 9876543210"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email ?? ""}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Role *</label>
            <select
              value={formData.role}
              onChange={(e) => {
                const nextRole = e.target.value;
                setFormData({ ...formData, role: nextRole });
                if (!ASSIGNABLE_PARTNER_ROLES.has(nextRole.toLowerCase())) {
                  setEngagementIds([]);
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              required
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {canAssignToEngagements ? (
            <div>
              <EngagementMultiSearchPicker
                label={
                  modalMode === "add"
                    ? "Assign to engagements (optional)"
                    : "Also assign to engagements (optional)"
                }
                value={engagementIds}
                onChange={setEngagementIds}
                disabled={submitting}
                placeholder="Search and add one or more engagements…"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Selected engagements will get this {roleLabel(String(formData.role)).toLowerCase()} as
                an onboarding assistant.
              </p>
            </div>
          ) : null}
          <p className="text-xs text-zinc-500">Provide at least one of phone or email.</p>
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
      </Modal>
    </div>
  );
}
