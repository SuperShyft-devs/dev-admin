import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Loader2, ListTree, Info, AlertTriangle } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { Engagements } from "../engagements/Engagements";
import {
  usersApi,
  employeesApi,
  uploadsApi,
  notificationsApi,
  participantJourneyApi,
  type UserListItem,
  type UserDetail,
  type UserCreate,
  type NotificationServiceItem,
  type ParticipantJourneyInstanceSummary,
  getApiError,
} from "../../lib/api";
function hasMetsightsProfileId(user: UserListItem): boolean {
  return Boolean((user.metsights_profile_id ?? "").trim());
}

const STATUS_OPTIONS = ["active", "inactive"];
const GENDER_OPTIONS = ["male", "female", "other"];
const ALWAYS_ACTIVE_EMPLOYEE_ID = 1;
const SEARCH_DEBOUNCE_MS = 300;

type ModalMode = "view" | "add" | "edit";

const EMPTY_FORM: UserCreate = {
  age: 0,
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState("user_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userEngagements, setUserEngagements] = useState<{ id: number; name: string }[]>([]);
  const [engagementDetailId, setEngagementDetailId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("view");
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [formData, setFormData] = useState<UserCreate>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<UserListItem | null>(null);
  const [orphanEngagementConfirm, setOrphanEngagementConfirm] = useState<{
    user: UserListItem;
    engagements: { engagement_id: number; engagement_code: string; engagement_name?: string | null }[];
  } | null>(null);
  const [alwaysActiveUserId, setAlwaysActiveUserId] = useState<number | null>(null);
  const [metsightsStats, setMetsightsStats] = useState({ withProfile: 0, totalParticipants: 0 });

  const [sendMsgUser, setSendMsgUser] = useState<UserListItem | null>(null);
  const [sendMsgServices, setSendMsgServices] = useState<NotificationServiceItem[]>([]);
  const [sendMsgInstances, setSendMsgInstances] = useState<ParticipantJourneyInstanceSummary[]>([]);
  const [sendMsgInstanceId, setSendMsgInstanceId] = useState<number | "">("");
  const [sendMsgKey, setSendMsgKey] = useState("");
  const [sendMsgSearch, setSendMsgSearch] = useState("");
  const [sendMsgDropdownOpen, setSendMsgDropdownOpen] = useState(false);
  const [sendMsgSubmitting, setSendMsgSubmitting] = useState(false);
  const [sendMsgError, setSendMsgError] = useState<string | null>(null);
  const [sendMsgSuccess, setSendMsgSuccess] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await usersApi.stats();
      setMetsightsStats({
        withProfile: res.data.data.with_metsights_profile,
        totalParticipants: res.data.data.total_participants,
      });
    } catch {
      // Stats are supplementary; keep the table usable if this fails.
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await usersApi.list({
        page,
        limit,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
        sort_by: sortKey === "name" ? "name" : sortKey,
        sort_dir: sortDir,
      });
      setData(res.data.data);
      setTotal(res.data.meta.total);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, debouncedSearch, sortKey, sortDir]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
    setUserEngagements([]);
    usersApi
      .get(row.user_id)
      .then((res) => {
        setSelected(res.data.data);
        setModalMode("view");
        setModalOpen(true);
        participantJourneyApi.summary(row.user_id, { page: 1, limit: 1 })
          .then(jRes => {
            const instances = jRes.data.data.instances ?? [];
            if (instances.length > 0) {
              const i = instances[0];
              setUserEngagements([{
                id: i.engagement_id,
                name: i.engagement_name || i.engagement_code || `Engagement #${i.engagement_id}`
              }]);
            }
          })
          .catch(() => {});
      })
      .catch((err) => setError(getApiError(err)));
  };

  const handleOpenEngagement = (id: number) => {
    setEngagementDetailId(id);
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
          age: u.age ?? 0,
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
    if (!Number.isFinite(formData.age) || formData.age < 1 || formData.age > 120) {
      setError("Age must be between 1 and 120");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        age: Math.trunc(formData.age),
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
      fetchStats();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const finishDelete = async (
    row: UserListItem,
    deleteOrphanEngagements: boolean
  ) => {
    await usersApi.delete(row.user_id, {
      delete_orphan_engagements: deleteOrphanEngagements,
    });
    setDeleteConfirm(null);
    setOrphanEngagementConfirm(null);
    fetchList();
    fetchStats();
  };

  const handleDeleteFirstConfirm = async (row: UserListItem) => {
    if (alwaysActiveUserId === row.user_id) {
      setError("This user cannot be deleted.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const impactRes = await usersApi.deleteImpact(row.user_id);
      const engagements = impactRes.data.data.engagements_to_orphan ?? [];
      if (engagements.length > 0) {
        setDeleteConfirm(null);
        setOrphanEngagementConfirm({ user: row, engagements });
      } else {
        await finishDelete(row, false);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWithOrphanChoice = async (deleteOrphanEngagements: boolean) => {
    if (!orphanEngagementConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      await finishDelete(orphanEngagementConfirm.user, deleteOrphanEngagements);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openSendMessage = async (row: UserListItem) => {
    setSendMsgUser(row);
    setSendMsgKey("");
    setSendMsgSearch("");
    setSendMsgDropdownOpen(false);
    setSendMsgError(null);
    setSendMsgSuccess(null);
    setSendMsgInstances([]);
    setSendMsgInstanceId("");
    try {
      const [servicesRes, journeyRes] = await Promise.all([
        notificationsApi.listServices(),
        participantJourneyApi.summary(row.user_id, { page: 1, limit: 100 }),
      ]);
      setSendMsgServices(servicesRes.data.data.filter((s) => s.is_active));
      const withRecord = (journeyRes.data.data.instances ?? []).filter(
        (i) => (i.metsights_record_id ?? "").trim().length > 0
      );
      setSendMsgInstances(withRecord);
      if (withRecord.length === 1) {
        setSendMsgInstanceId(withRecord[0].assessment_instance_id);
      }
    } catch {
      setSendMsgServices([]);
      setSendMsgInstances([]);
    }
  };

  const selectedSendMsgService = sendMsgServices.find((s) => s.service_key === sendMsgKey);
  const selectedSendMsgInstance =
    sendMsgInstanceId === ""
      ? null
      : sendMsgInstances.find((i) => i.assessment_instance_id === sendMsgInstanceId) ?? null;

  const handleSendMessage = async () => {
    if (!sendMsgUser || !sendMsgKey) return;
    const svc = selectedSendMsgService;
    if (!svc) return;

    const recordId = (selectedSendMsgInstance?.metsights_record_id ?? "").trim();
    if (svc.require_record_id && !recordId && sendMsgInstances.length > 0) {
      setSendMsgError("Select an assessment with a Metsights record ID.");
      return;
    }
    if (svc.require_record_id && !recordId && sendMsgInstances.length === 0) {
      setSendMsgError("No assessment with a Metsights record ID found for this user.");
      return;
    }

    setSendMsgSubmitting(true);
    setSendMsgError(null);
    setSendMsgSuccess(null);
    try {
      await notificationsApi.dispatch({
        service_key: sendMsgKey,
        user_ids: [sendMsgUser.user_id],
        engagement_id: selectedSendMsgInstance?.engagement_id ?? null,
        record_id: recordId || null,
      });
      setSendMsgSuccess("Message dispatched successfully");
    } catch (err) {
      setSendMsgError(getApiError(err));
    } finally {
      setSendMsgSubmitting(false);
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
      render: (row) => {
        const showMissingMetsightsWarning =
          row.is_participant === true && !hasMetsightsProfileId(row);
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium text-zinc-900 truncate">{getFullName(row)}</span>
              {showMissingMetsightsWarning && (
                <span className="relative group/warn shrink-0">
                  <AlertTriangle
                    className="w-3.5 h-3.5 text-amber-500"
                    aria-label="Missing Metsights profile ID"
                  />
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/warn:opacity-100"
                  >
                    metsights_profile_id is null
                  </span>
                </span>
              )}
            </div>
            <span className="text-xs text-zinc-500">{row.phone}</span>
          </div>
        );
      },
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
              if (!Number.isFinite(row.age) || (row.age ?? 0) < 1 || (row.age ?? 0) > 120) {
                setError("Cannot update status: age is missing or invalid for this user.");
                return;
              }
              const nextStatus = isActive ? "inactive" : "active";
              usersApi
                .update(row.user_id, {
                  age: Number(row.age),
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
    setPage(1);
  };

  const field = (label: string, value?: string | number | null | boolean) => (
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
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative group/info">
            <button
              type="button"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              aria-label="Metsights profile coverage among participants"
            >
              <Info className="w-4 h-4" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/info:opacity-100"
            >
              {metsightsStats.withProfile} of {metsightsStats.totalParticipants} participants
              have a metsights_profile_id
            </span>
          </span>
          <button
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add User</span>
          </button>
        </div>
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
            onDelete={(r) => {
              if (alwaysActiveUserId === r.user_id) {
                setError("This user cannot be deleted.");
                return;
              }
              setDeleteConfirm(r);
            }}
            onSendMessage={openSendMessage}
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
                {field("Age", selected.age)}
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
                {userEngagements.length > 0 ? (
                  <div>
                    <span className="text-zinc-500 text-xs uppercase tracking-wide">Engagement</span>
                    <button
                      type="button"
                      onClick={() => handleOpenEngagement(userEngagements[0].id)}
                      className="text-zinc-900 mt-0.5 hover:underline font-medium text-left block"
                    >
                      {userEngagements[0].name}
                    </button>
                  </div>
                ) : (
                  field("Engagement", "—")
                )}
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
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Age *</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={formData.age > 0 ? formData.age : ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        age: e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="18"
                    required
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

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <Modal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete User"
        >
          <p className="text-zinc-600 text-sm mb-4">
            Permanently delete user{" "}
            <span className="font-semibold text-zinc-900">
              {getFullName(deleteConfirm) !== "—"
                ? getFullName(deleteConfirm)
                : deleteConfirm.phone}
            </span>
            ? This removes the user, any linked sub-profiles, and related bookings, assessments,
            and engagement participation. This cannot be undone.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => handleDeleteFirstConfirm(deleteConfirm)}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Checking..." : "Delete permanently"}
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

      {/* Orphan engagement confirm (second step) */}
      {orphanEngagementConfirm && (
        <Modal
          open={!!orphanEngagementConfirm}
          onClose={() => setOrphanEngagementConfirm(null)}
          title="Delete empty engagement(s)?"
        >
          <p className="text-zinc-600 text-sm mb-3">
            Deleting{" "}
            <span className="font-semibold text-zinc-900">
              {getFullName(orphanEngagementConfirm.user) !== "—"
                ? getFullName(orphanEngagementConfirm.user)
                : orphanEngagementConfirm.user.phone}
            </span>{" "}
            leaves {orphanEngagementConfirm.engagements.length === 1 ? "this engagement" : "these engagements"}{" "}
            with no participants:
          </p>
          <ul className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 divide-y divide-zinc-100 text-sm">
            {orphanEngagementConfirm.engagements.map((e) => (
              <li key={e.engagement_id} className="px-3 py-2 text-zinc-800">
                <span className="font-medium">{e.engagement_name || e.engagement_code}</span>
                <span className="text-zinc-500 font-mono text-xs ml-2">{e.engagement_code}</span>
              </li>
            ))}
          </ul>
          <p className="text-zinc-600 text-sm mb-4">
            Do you want to permanently delete {orphanEngagementConfirm.engagements.length === 1 ? "this engagement" : "these engagements"} as well?
            If you choose no, only the user is removed and the engagement(s) remain.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleDeleteWithOrphanChoice(true)}
              disabled={submitting}
              className="w-full px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Deleting..." : "Delete user and engagement(s)"}
            </button>
            <button
              type="button"
              onClick={() => handleDeleteWithOrphanChoice(false)}
              disabled={submitting}
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 text-zinc-800 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {submitting ? "Deleting..." : "Delete user only, keep engagement(s)"}
            </button>
            <button
              type="button"
              onClick={() => setOrphanEngagementConfirm(null)}
              disabled={submitting}
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Send Message Modal */}
      {sendMsgUser && (
        <Modal
          open={!!sendMsgUser}
          onClose={() => setSendMsgUser(null)}
          title="Send Message"
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Send a notification to{" "}
              <span className="font-semibold text-zinc-900">
                {[sendMsgUser.first_name, sendMsgUser.last_name].filter(Boolean).join(" ") || sendMsgUser.phone}
              </span>
            </p>

            {sendMsgError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{sendMsgError}</div>
            )}
            {sendMsgSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">{sendMsgSuccess}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Notification Service
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search services..."
                  value={sendMsgSearch}
                  onChange={(e) => {
                    setSendMsgSearch(e.target.value);
                    setSendMsgDropdownOpen(true);
                  }}
                  onFocus={() => setSendMsgDropdownOpen(true)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
                {sendMsgDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                    {sendMsgServices
                      .filter(
                        (s) =>
                          s.display_name.toLowerCase().includes(sendMsgSearch.toLowerCase()) ||
                          s.service_key.toLowerCase().includes(sendMsgSearch.toLowerCase())
                      )
                      .map((s) => (
                        <button
                          key={s.service_key}
                          type="button"
                          onClick={() => {
                            setSendMsgKey(s.service_key);
                            setSendMsgSearch(s.display_name);
                            setSendMsgDropdownOpen(false);
                            if (
                              s.require_record_id &&
                              sendMsgInstanceId === "" &&
                              sendMsgInstances.length === 1
                            ) {
                              setSendMsgInstanceId(sendMsgInstances[0].assessment_instance_id);
                            }
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center justify-between ${
                            sendMsgKey === s.service_key ? "bg-zinc-50 font-medium" : "text-zinc-700"
                          }`}
                        >
                          <span>{s.display_name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            s.channel === "email"
                              ? "bg-blue-50 text-blue-600"
                              : "bg-green-50 text-green-600"
                          }`}>
                            {s.channel}
                          </span>
                        </button>
                      ))}
                    {sendMsgServices.filter(
                      (s) =>
                        s.display_name.toLowerCase().includes(sendMsgSearch.toLowerCase()) ||
                        s.service_key.toLowerCase().includes(sendMsgSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-500">No services found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedSendMsgService?.require_record_id && sendMsgInstances.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Assessment (Metsights record)
                </label>
                <select
                  value={sendMsgInstanceId}
                  onChange={(e) =>
                    setSendMsgInstanceId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="">Select assessment</option>
                  {sendMsgInstances.map((inst) => (
                    <option key={inst.assessment_instance_id} value={inst.assessment_instance_id}>
                      {inst.package_display_name || inst.package_code || `Package #${inst.package_id}`}
                      {" · "}
                      {inst.engagement_name || inst.engagement_code || `Engagement #${inst.engagement_id}`}
                      {inst.metsights_record_id ? ` · ${inst.metsights_record_id}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={
                  sendMsgSubmitting ||
                  !sendMsgKey ||
                  !!sendMsgSuccess ||
                  (Boolean(selectedSendMsgService?.require_record_id) &&
                    sendMsgInstances.length > 0 &&
                    sendMsgInstanceId === "")
                }
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {sendMsgSubmitting ? "Sending..." : "Send"}
              </button>
              <button
                type="button"
                onClick={() => setSendMsgUser(null)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                {sendMsgSuccess ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Engagement Detail Modal */}
      {engagementDetailId && (
        <Engagements
          asModalForEngagementId={engagementDetailId}
          onCloseModal={() => setEngagementDetailId(null)}
        />
      )}
    </div>
  );
}
