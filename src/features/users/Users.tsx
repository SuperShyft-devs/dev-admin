import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Loader2, ListTree } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  usersApi,
  employeesApi,
  uploadsApi,
  type UserListItem,
  type UserDetail,
  type UserCreate,
  getApiError,
} from "../../lib/api";
import { fetchAllPages } from "../../lib/fetchAllPages";

const STATUS_OPTIONS = ["active", "inactive"];
const GENDER_OPTIONS = ["male", "female", "other"];
const ALWAYS_ACTIVE_EMPLOYEE_ID = 1;

type ModalMode = "view" | "add" | "edit";

const EMPTY_FORM: UserCreate = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  profile_photo: "",
  date_of_birth: "",
  gender: "",
  address: "",
  pin_code: "",
  city: "",
  state: "",
  country: "",
  referred_by: "",
  is_participant: false,
  status: "active",
};

export function Users() {
  const navigate = useNavigate();
  const [data, setData] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState("user_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("view");
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [formData, setFormData] = useState<UserCreate>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState<UserListItem | null>(null);
  const [alwaysActiveUserId, setAlwaysActiveUserId] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let items = await fetchAllPages<UserListItem>((nextPage, nextLimit) =>
        usersApi.list({
          page: nextPage,
          limit: nextLimit,
          status: statusFilter || undefined,
        })
      );

      if (search) {
        const q = search.toLowerCase();
        items = items.filter((u) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(" ").toLowerCase();
          const phone = (u.phone ?? "").toLowerCase();
          const email = (u.email ?? "").toLowerCase();
          return name.includes(q) || phone.includes(q) || email.includes(q);
        });
      }

      const sorted = [...items].sort((a, b) => {
        const getValue = (item: UserListItem): string => {
          if (sortKey === "name") {
            return [item.first_name, item.last_name].filter(Boolean).join(" ");
          }
          return String(item[sortKey as keyof UserListItem] ?? "");
        };
        const cmp = getValue(a).localeCompare(getValue(b), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });

      setTotal(sorted.length);
      setData(sorted.slice((page - 1) * limit, page * limit));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, search, sortKey, sortDir]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    employeesApi
      .get(ALWAYS_ACTIVE_EMPLOYEE_ID)
      .then((res) => setAlwaysActiveUserId(res.data.data.user_id))
      .catch(() => setAlwaysActiveUserId(null));
  }, []);

  const openView = (row: UserListItem) => {
    usersApi
      .get(row.user_id)
      .then((res) => {
        setSelected(res.data.data);
        setModalMode("view");
        setModalOpen(true);
      })
      .catch((err) => setError(getApiError(err)));
  };

  const openAdd = () => {
    setSelected(null);
    setFormData(EMPTY_FORM);
    setModalMode("add");
    setModalOpen(true);
  };

  const openEdit = (row: UserListItem) => {
    usersApi
      .get(row.user_id)
      .then((res) => {
        const u = res.data.data;
        setSelected(u);
        setFormData({
          first_name: u.first_name ?? "",
          last_name: u.last_name ?? "",
          phone: u.phone ?? "",
          email: u.email ?? "",
          profile_photo: u.profile_photo ?? "",
          date_of_birth: u.date_of_birth ?? "",
          gender: u.gender ?? "",
          address: u.address ?? "",
          pin_code: u.pin_code ?? "",
          city: u.city ?? "",
          state: u.state ?? "",
          country: u.country ?? "",
          referred_by: u.referred_by ?? "",
          is_participant: u.is_participant ?? false,
          status: u.status ?? "active",
        });
        setModalMode("edit");
        setModalOpen(true);
      })
      .catch((err) => setError(getApiError(err)));
  };

  const handleSubmit = async () => {
    if (!formData.phone.trim()) {
      setError("Phone number is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        email: formData.email || null,
        profile_photo: formData.profile_photo || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        address: formData.address || null,
        pin_code: formData.pin_code || null,
        city: formData.city || null,
        state: formData.state || null,
        country: formData.country || null,
        referred_by: formData.referred_by || null,
      };
      if (modalMode === "add") {
        await usersApi.create(payload);
      } else if (selected) {
        await usersApi.update(selected.user_id, payload);
      }
      setModalOpen(false);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (row: UserListItem) => {
    setSubmitting(true);
    try {
      await usersApi.deactivate(row.user_id);
      setDeactivateConfirm(null);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (val?: string | null) => {
    if (!val) return "—";
    try {
      return new Date(val).toLocaleDateString();
    } catch {
      return val;
    }
  };

  const getFullName = (u: UserListItem | UserDetail) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    return name || "—";
  };

  const handlePhotoUpload = async (file?: File) => {
    if (!file) return;
    setPhotoUploading(true);
    setError(null);
    try {
      const res = await uploadsApi.uploadUserProfilePhoto(file);
      setFormData((prev) => ({ ...prev, profile_photo: res.data.data.url }));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setPhotoUploading(false);
    }
  };

  const columns: Column<UserListItem>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-zinc-900">{getFullName(row)}</span>
          <span className="text-xs text-zinc-500">{row.phone}</span>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      hideOnMobile: true,
      render: (row) => <span className="text-zinc-600">{row.email || "—"}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => {
        const isProtectedUser = alwaysActiveUserId === row.user_id;
        const isActive = isProtectedUser || (row.status ?? "").toLowerCase() === "active";
        return (
          <button
            type="button"
            disabled={isProtectedUser}
            onClick={(e) => {
              e.stopPropagation();
              if (isProtectedUser) {
                return;
              }
              const phone = row.phone?.trim();
              if (!phone) {
                setError("Cannot update status: phone number is missing for this user.");
                return;
              }
              const nextStatus = isActive ? "inactive" : "active";
              usersApi
                .update(row.user_id, {
                  first_name: row.first_name ?? null,
                  last_name: row.last_name ?? null,
                  phone,
                  email: row.email ?? null,
                  status: nextStatus,
                })
                .then(() => fetchList())
                .catch((err) => setError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition disabled:cursor-not-allowed disabled:opacity-80 ${
              isActive ? "bg-emerald-500" : "bg-zinc-300"
            }`}
            aria-pressed={isActive}
            aria-label={
              isProtectedUser
                ? `${getFullName(row) !== "—" ? getFullName(row) : row.phone} is always active`
                : `Set ${getFullName(row) !== "—" ? getFullName(row) : row.phone} ${isActive ? "inactive" : "active"}`
            }
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
    {
      key: "is_participant",
      label: "Participant",
      hideOnMobile: true,
      hideOnTablet: true,
      render: (row) => (
        <span className="text-zinc-600">
          {row.is_participant === true ? "Yes" : row.is_participant === false ? "No" : "—"}
        </span>
      ),
    },
    {
      key: "journey",
      label: "Journey",
      className: "w-24",
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/users/${row.user_id}/journey`);
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900"
        >
          <ListTree className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">View</span>
        </button>
      ),
    },
  ];

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  const field = (label: string, value?: string | null | boolean) => (
    <div>
      <span className="text-zinc-500 text-xs uppercase tracking-wide">{label}</span>
      <p className="text-zinc-900 mt-0.5">{value === null || value === undefined ? "—" : String(value)}</p>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Users</h1>
        <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Add User</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={data}
            keyExtractor={(r) => r.user_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={openView}
            onEdit={openEdit}
            onDelete={(r) => setDeactivateConfirm(r)}
            pagination={{ page, limit, total, onPageChange: setPage }}
          />
        )}
      </div>

      {/* View / Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setError(null); }}
        title={
          modalMode === "add"
            ? "Add User"
            : modalMode === "edit"
            ? "Edit User"
            : "User Details"
        }
        maxWidthClassName={modalMode === "view" ? "max-w-xl" : "max-w-3xl"}
      >
        {modalMode === "view" && selected ? (
          <div className="space-y-6">
            {/* Identity */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Identity
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {field("First Name", selected.first_name)}
                {field("Last Name", selected.last_name)}
                {field("Phone", selected.phone)}
                {field("Email", selected.email)}
                {field("Profile Photo URL", selected.profile_photo)}
                {field("Date of Birth", formatDate(selected.date_of_birth))}
                {field("Gender", selected.gender)}
              </div>
            </div>
            {/* Address */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Address
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="sm:col-span-2">{field("Address", selected.address)}</div>
                {field("Pin Code", selected.pin_code)}
                {field("City", selected.city)}
                {field("State", selected.state)}
                {field("Country", selected.country)}
              </div>
            </div>
            {/* Meta */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Account
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {field("Status", selected.status)}
                {field("Participant", selected.is_participant === true ? "Yes" : selected.is_participant === false ? "No" : "—")}
                {field("Referred By", selected.referred_by)}
                {field("Created", formatDate(selected.created_at))}
                {field("Updated", formatDate(selected.updated_at))}
              </div>
            </div>
            {/* Actions in view */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  navigate(`/users/${selected.user_id}/journey`);
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-800 text-sm font-medium hover:bg-zinc-50 inline-flex items-center justify-center gap-2"
              >
                <ListTree className="w-4 h-4 shrink-0" />
                Participant journey
              </button>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setTimeout(() => openEdit({ user_id: selected.user_id, first_name: selected.first_name, last_name: selected.last_name, phone: selected.phone, email: selected.email, status: selected.status }), 100);
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
              >
                Edit
              </button>
              <button
                onClick={() => setModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            className="space-y-6"
          >
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
            )}

            {/* Personal Info */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Personal Info
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.first_name ?? ""}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name ?? ""}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Phone *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="+91 9999999999"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email ?? ""}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="email@example.com"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Profile Photo URL</label>
                  <input
                    type="url"
                    value={formData.profile_photo ?? ""}
                    onChange={(e) => setFormData({ ...formData, profile_photo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="https://"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Upload Profile Photo</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void handlePhotoUpload(e.target.files?.[0])}
                    className="w-full text-sm"
                    disabled={photoUploading}
                  />
                  {photoUploading && (
                    <p className="mt-1 text-xs text-zinc-500">Uploading profile photo...</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.date_of_birth ?? ""}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Gender</label>
                  <select
                    value={formData.gender ?? ""}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Address
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address ?? ""}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Street address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Pin Code</label>
                  <input
                    type="text"
                    value={formData.pin_code ?? ""}
                    onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Pin / ZIP"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city ?? ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state ?? ""}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="State"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={formData.country ?? ""}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Country"
                  />
                </div>
              </div>
            </div>

            {/* Account */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Account
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
                  <select
                    value={formData.status ?? "active"}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Referred By</label>
                  <input
                    type="text"
                    value={formData.referred_by ?? ""}
                    onChange={(e) => setFormData({ ...formData, referred_by: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Referral code or name"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="is_participant"
                    type="checkbox"
                    checked={formData.is_participant ?? false}
                    onChange={(e) => setFormData({ ...formData, is_participant: e.target.checked })}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <label htmlFor="is_participant" className="text-sm font-medium text-zinc-700">
                    Is Participant
                  </label>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "Saving..." : modalMode === "add" ? "Create User" : "Update User"}
              </button>
              <button
                type="button"
                onClick={() => { setModalOpen(false); setError(null); }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Deactivate Confirm Modal */}
      {deactivateConfirm && (
        <Modal
          open={!!deactivateConfirm}
          onClose={() => setDeactivateConfirm(null)}
          title="Deactivate User"
        >
          <p className="text-zinc-600 text-sm mb-4">
            Deactivate user{" "}
            <span className="font-semibold text-zinc-900">
              {getFullName(deactivateConfirm) !== "—"
                ? getFullName(deactivateConfirm)
                : deactivateConfirm.phone}
            </span>
            ? Their account will be soft-disabled and they won't be able to log in.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => handleDeactivate(deactivateConfirm)}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Deactivating..." : "Deactivate"}
            </button>
            <button
              onClick={() => setDeactivateConfirm(null)}
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
