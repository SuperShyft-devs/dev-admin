import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  expertsApi,
  getApiError,
  uploadsApi,
  usersApi,
  type ConsultationMode,
  type ExpertDetail,
  type ExpertListItem,
  type ExpertPayload,
  type ExpertTag,
  type ExpertType,
  type UserListItem,
} from "../../lib/api";
import { fetchAllPages } from "../../lib/fetchAllPages";

const MODES: ConsultationMode[] = ["video", "voice", "chat"];

function formatUserDropdownLabel(u: UserListItem): string {
  const first = (u.first_name ?? "").trim();
  const last = (u.last_name ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || `User #${u.user_id}`;
}

function formatViewUserId(userId: number | null | undefined, users: UserListItem[]): string {
  if (userId == null || userId <= 0) return "—";
  const u = users.find((x) => x.user_id === userId);
  return u ? `${userId} — ${formatUserDropdownLabel(u)}` : String(userId);
}

const emptyPayload = (): ExpertPayload => ({
  user_id: 0,
  expert_type: "doctor",
  display_name: "",
  profile_photo: "",
  experience_years: undefined,
  qualifications: "",
  about_text: "",
  consultation_modes: [],
  languages: [],
  session_duration_mins: undefined,
  appointment_fee_paise: undefined,
  original_fee_paise: undefined,
  patient_count: 0,
});

export function Experts() {
  const [data, setData] = useState<ExpertListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [expertTypeFilter, setExpertTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<string>("expert_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "add" | "edit">("view");
  const [selected, setSelected] = useState<ExpertDetail | null>(null);
  const [formData, setFormData] = useState<ExpertPayload>(emptyPayload());
  const [languagesText, setLanguagesText] = useState("");
  const [modeVideo, setModeVideo] = useState(false);
  const [modeVoice, setModeVoice] = useState(false);
  const [modeChat, setModeChat] = useState(false);
  const [tags, setTags] = useState<ExpertTag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [usersList, setUsersList] = useState<UserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const syncModesFromPayload = (modes: ConsultationMode[] | string[] | null | undefined) => {
    const set = new Set((modes ?? []).map((m) => String(m).toLowerCase()));
    setModeVideo(set.has("video"));
    setModeVoice(set.has("voice"));
    setModeChat(set.has("chat"));
  };

  const modesFromCheckboxes = (): ConsultationMode[] | null => {
    const out: ConsultationMode[] = [];
    if (modeVideo) out.push("video");
    if (modeVoice) out.push("voice");
    if (modeChat) out.push("chat");
    return out.length ? out : null;
  };

  const parseLanguages = (): string[] | null => {
    const parts = languagesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : null;
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let items = await fetchAllPages<ExpertListItem>((nextPage, nextLimit) =>
        expertsApi.list({
          page: nextPage,
          limit: nextLimit,
          expert_type: expertTypeFilter || undefined,
          status: statusFilter || undefined,
        })
      );
      if (search) {
        const q = search.toLowerCase();
        items = items.filter(
          (e) =>
            (e.display_name ?? "").toLowerCase().includes(q) ||
            (e.qualifications ?? "").toLowerCase().includes(q)
        );
      }
      const sorted = [...items].sort((a, b) => {
        const aVal = String(a[sortKey as keyof ExpertListItem] ?? "");
        const bVal = String(b[sortKey as keyof ExpertListItem] ?? "");
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
      setTotal(sorted.length);
      setData(sorted.slice((page - 1) * limit, page * limit));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, expertTypeFilter, statusFilter, search, sortKey, sortDir]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    setPage(1);
  }, [search, expertTypeFilter, statusFilter]);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    (async () => {
      setUsersLoading(true);
      try {
        const items = await fetchAllPages<UserListItem>((nextPage, nextLimit) =>
          usersApi.list({ page: nextPage, limit: nextLimit })
        );
        if (!cancelled) {
          const sorted = [...items].sort((a, b) =>
            formatUserDropdownLabel(a).localeCompare(formatUserDropdownLabel(b), undefined, {
              sensitivity: "base",
            })
          );
          setUsersList(sorted);
        }
      } catch (err) {
        if (!cancelled) setError(getApiError(err));
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  const openView = (row: ExpertListItem) => {
    expertsApi
      .get(row.expert_id)
      .then((res) => {
        const detail = res.data.data;
        setSelected(detail);
        setModalMode("view");
        setModalOpen(true);
      })
      .catch((err) => setError(getApiError(err)));
  };

  const openAdd = () => {
    setError(null);
    setSelected(null);
    setFormData(emptyPayload());
    setLanguagesText("");
    syncModesFromPayload([]);
    setTags([]);
    setNewTagName("");
    setModalMode("add");
    setModalOpen(true);
  };

  const openEdit = (row: ExpertListItem) => {
    setError(null);
    expertsApi
      .get(row.expert_id)
      .then((res) => {
        const e = res.data.data;
        setSelected(e);
        setFormData({
          user_id: e.user_id && e.user_id > 0 ? e.user_id : 0,
          expert_type: (e.expert_type as ExpertType) || "doctor",
          display_name: e.display_name ?? "",
          profile_photo: e.profile_photo ?? "",
          experience_years: e.experience_years ?? undefined,
          qualifications: e.qualifications ?? "",
          about_text: e.about_text ?? "",
          consultation_modes: (e.consultation_modes as ConsultationMode[] | null) ?? null,
          languages: (e.languages as string[] | null) ?? null,
          session_duration_mins: e.session_duration_mins ?? undefined,
          appointment_fee_paise: e.appointment_fee_paise ?? undefined,
          original_fee_paise: e.original_fee_paise ?? undefined,
          patient_count: e.patient_count ?? 0,
        });
        setLanguagesText((e.languages as string[] | undefined)?.join(", ") ?? "");
        syncModesFromPayload(e.consultation_modes as ConsultationMode[] | null);
        setTags(e.expertise_tags ?? []);
        setNewTagName("");
        setModalMode("edit");
        setModalOpen(true);
      })
      .catch((err) => setError(getApiError(err)));
  };

  const handleSubmit = async () => {
    if (!formData.display_name.trim()) return;
    if (!formData.user_id || formData.user_id <= 0) {
      setError("User Id is required");
      return;
    }
    setSubmitting(true);
    try {
      const payload: ExpertPayload = {
        ...formData,
        consultation_modes: modesFromCheckboxes(),
        languages: parseLanguages(),
      };
      if (modalMode === "add") {
        await expertsApi.create(payload);
      } else if (selected) {
        await expertsApi.update(selected.expert_id, payload);
      }
      setModalOpen(false);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoUpload = async (file?: File) => {
    if (!file) return;
    setPhotoUploading(true);
    setError(null);
    try {
      const res = await uploadsApi.uploadExpertProfilePhoto(file);
      setFormData((prev) => ({ ...prev, profile_photo: res.data.data.url }));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleAddTag = async () => {
    if (!selected || !newTagName.trim()) return;
    setSubmitting(true);
    try {
      await expertsApi.addTag(selected.expert_id, { tag_name: newTagName.trim() });
      const res = await expertsApi.get(selected.expert_id);
      setTags(res.data.data.expertise_tags ?? []);
      setNewTagName("");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTag = async (tag: ExpertTag) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await expertsApi.deleteTag(selected.expert_id, tag.tag_id);
      setTags((prev) => prev.filter((t) => t.tag_id !== tag.tag_id));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<ExpertListItem>[] = [
    { key: "display_name", label: "Name", sortable: true },
    { key: "expert_type", label: "Type", sortable: true, hideOnMobile: true },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      hideOnMobile: true,
      render: (row) => (row.rating != null ? Number(row.rating).toFixed(2) : "—"),
    },
    { key: "review_count", label: "Reviews", sortable: true, hideOnTablet: true },
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
              expertsApi
                .updateStatus(row.expert_id, nextStatus)
                .then(() => fetchList())
                .catch((err) => setError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition ${
              isActive ? "bg-emerald-500" : "bg-zinc-300"
            }`}
            aria-pressed={isActive}
            aria-label={`Set ${row.display_name} ${isActive ? "inactive" : "active"}`}
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
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Experts</h1>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Add expert</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name or qualifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <div className="flex flex-row gap-3 flex-wrap sm:flex-nowrap">
          <select
            value={expertTypeFilter}
            onChange={(e) => setExpertTypeFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All types</option>
            <option value="doctor">Doctor</option>
            <option value="nutritionist">Nutritionist</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
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
            keyExtractor={(r) => r.expert_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={openView}
            onEdit={openEdit}
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
          modalMode === "add" ? "Add expert" : modalMode === "edit" ? "Edit expert" : "Expert details"
        }
        maxWidthClassName={modalMode === "view" ? "max-w-xl" : "max-w-2xl"}
      >
        {modalMode === "view" && selected ? (
          <div className="space-y-3 text-sm">
            <div className="font-medium text-zinc-900">{selected.display_name}</div>
            <div className="text-zinc-600">
              <span className="text-zinc-500">User Id:</span>{" "}
              {formatViewUserId(selected.user_id, usersList)}
            </div>
            <div className="text-zinc-600">
              <span className="text-zinc-500">Type:</span> {selected.expert_type}
            </div>
            <div className="text-zinc-600">
              <span className="text-zinc-500">Status:</span> {selected.status}
            </div>
            <div className="text-zinc-600">
              <span className="text-zinc-500">Rating:</span>{" "}
              {selected.rating != null ? Number(selected.rating).toFixed(2) : "—"} (
              {selected.review_count ?? 0} reviews)
            </div>
            {selected.about_text ? (
              <div className="text-zinc-700 whitespace-pre-wrap">{selected.about_text}</div>
            ) : null}
            {selected.expertise_tags?.length ? (
              <div>
                <div className="text-zinc-500 mb-1">Expertise</div>
                <div className="flex flex-wrap gap-1">
                  {selected.expertise_tags.map((t) => (
                    <span
                      key={t.tag_id}
                      className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-800 text-xs"
                    >
                      {t.tag_name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block sm:col-span-2">
                <span className="text-zinc-600 text-xs">User Id *</span>
                <select
                  required
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                  value={formData.user_id > 0 ? String(formData.user_id) : ""}
                  disabled={usersLoading}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      user_id: e.target.value ? Number(e.target.value) : 0,
                    }))
                  }
                >
                  <option value="">
                    {usersLoading ? "Loading users…" : "Select a user"}
                  </option>
                  {usersList.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {formatUserDropdownLabel(u)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-600 text-xs">Display name *</span>
                <input
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                  value={formData.display_name}
                  onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-zinc-600 text-xs">Expert type *</span>
                <select
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                  value={formData.expert_type}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, expert_type: e.target.value as ExpertType }))
                  }
                >
                  <option value="doctor">Doctor</option>
                  <option value="nutritionist">Nutritionist</option>
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-600 text-xs">Profile photo</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="text-xs"
                    disabled={photoUploading}
                    onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                  />
                  {photoUploading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
                </div>
                {formData.profile_photo ? (
                  <p className="text-xs text-zinc-500 mt-1 truncate">{formData.profile_photo}</p>
                ) : null}
              </label>
            </div>

            <div>
              <span className="text-zinc-600 text-xs">Consultation modes</span>
              <div className="mt-1 flex flex-wrap gap-4">
                {MODES.map((m) => (
                  <label key={m} className="inline-flex items-center gap-2 capitalize">
                    <input
                      type="checkbox"
                      checked={m === "video" ? modeVideo : m === "voice" ? modeVoice : modeChat}
                      onChange={(e) => {
                        if (m === "video") setModeVideo(e.target.checked);
                        else if (m === "voice") setModeVoice(e.target.checked);
                        else setModeChat(e.target.checked);
                      }}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-zinc-600 text-xs">Languages (comma-separated)</span>
              <input
                className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                value={languagesText}
                onChange={(e) => setLanguagesText(e.target.value)}
                placeholder="English, Hindi"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-zinc-600 text-xs">Experience (years)</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                  value={formData.experience_years ?? ""}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      experience_years: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-zinc-600 text-xs">Session duration (minutes)</span>
                <input
                  type="number"
                  min={5}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                  value={formData.session_duration_mins ?? ""}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      session_duration_mins: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-zinc-600 text-xs">Appointment fee (paise)</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                  value={formData.appointment_fee_paise ?? ""}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      appointment_fee_paise: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-zinc-600 text-xs">Original fee (paise)</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                  value={formData.original_fee_paise ?? ""}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      original_fee_paise: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-zinc-600 text-xs">Patient count</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                  value={formData.patient_count ?? 0}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      patient_count: e.target.value === "" ? 0 : Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <label className="block">
              <span className="text-zinc-600 text-xs">Qualifications</span>
              <input
                className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                value={formData.qualifications ?? ""}
                onChange={(e) => setFormData((p) => ({ ...p, qualifications: e.target.value }))}
              />
            </label>

            <label className="block">
              <span className="text-zinc-600 text-xs">About</span>
              <textarea
                rows={4}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300"
                value={formData.about_text ?? ""}
                onChange={(e) => setFormData((p) => ({ ...p, about_text: e.target.value }))}
              />
            </label>

            {modalMode === "edit" && selected ? (
              <div className="border-t border-zinc-200 pt-4">
                <div className="text-xs font-medium text-zinc-700 mb-2">Expertise tags</div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((t) => (
                    <span
                      key={t.tag_id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 text-xs"
                    >
                      {t.tag_name}
                      <button
                        type="button"
                        className="text-zinc-500 hover:text-red-600"
                        onClick={() => handleDeleteTag(t)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-300"
                    placeholder="New tag"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={submitting}
                    className="px-3 py-2 rounded-lg bg-zinc-200 text-zinc-900 text-sm hover:bg-zinc-300 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
