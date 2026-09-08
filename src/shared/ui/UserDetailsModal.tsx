import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "../../contexts/PermissionContext";
import { Loader2, ListTree } from "lucide-react";
import { Modal } from "./Modal";
import { Engagements } from "../../features/engagements/Engagements";
import {
  getApiError,
  participantJourneyApi,
  uploadsApi,
  usersApi,
  type UserCreate,
  type UserDetail,
} from "../../lib/api";

const STATUS_OPTIONS = ["active", "inactive"];
const GENDER_OPTIONS = ["male", "female", "other"];

const EMPTY_FORM: UserCreate = {
  age: null,
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

type ModalMode = "view" | "edit";

function formatDate(val?: string | null) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString();
  } catch {
    return val;
  }
}

function field(label: string, value: unknown) {
  const display =
    value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div>
      <span className="text-zinc-500 text-xs uppercase tracking-wide">{label}</span>
      <p className="text-zinc-900 mt-0.5 break-words">{display}</p>
    </div>
  );
}

function detailToForm(u: UserDetail): UserCreate {
  return {
    age: u.age ?? null,
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
  };
}

interface UserDetailsModalProps {
  open: boolean;
  userId: number | null;
  onClose: () => void;
  /** Called after a successful edit save. */
  onSaved?: () => void;
  /** Stack above an already-open modal (e.g. Participants). */
  zIndexClassName?: string;
}

export function UserDetailsModal({
  open,
  userId,
  onClose,
  onSaved,
  zIndexClassName = "z-[60]",
}: UserDetailsModalProps) {
  const { canEditTask, canView, canViewTask } = usePermissions();
  const mayEditUsers = canEditTask("users", "profiles");
  const mayViewJourneys = canViewTask("users", "participant_journeys");
  const mayViewEngagements = canView("engagements");
  const navigate = useNavigate();
  const [mode, setMode] = useState<ModalMode>("view");
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [formData, setFormData] = useState<UserCreate>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEngagements, setUserEngagements] = useState<{ id: number; name: string }[]>([]);
  const [engagementDetailId, setEngagementDetailId] = useState<number | null>(null);

  const reset = useCallback(() => {
    setMode("view");
    setSelected(null);
    setFormData(EMPTY_FORM);
    setLoading(false);
    setSubmitting(false);
    setPhotoUploading(false);
    setError(null);
    setUserEngagements([]);
    setEngagementDetailId(null);
  }, []);

  useEffect(() => {
    if (!open || userId == null) {
      reset();
      return;
    }

    let cancelled = false;
    setMode("view");
    setSelected(null);
    setFormData(EMPTY_FORM);
    setError(null);
    setUserEngagements([]);
    setLoading(true);

    usersApi
      .get(userId)
      .then((res) => {
        if (cancelled) return;
        setSelected(res.data.data);
        participantJourneyApi
          .summary(userId, { page: 1, limit: 1 })
          .then((jRes) => {
            if (cancelled) return;
            const instances = jRes.data.data.instances ?? [];
            if (instances.length > 0) {
              const i = instances[0];
              setUserEngagements([
                {
                  id: i.engagement_id,
                  name:
                    i.engagement_name ||
                    i.engagement_code ||
                    `Engagement #${i.engagement_id}`,
                },
              ]);
            }
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (!cancelled) setError(getApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, userId, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const openEdit = () => {
    if (!mayEditUsers) return;
    if (!selected) return;
    setFormData(detailToForm(selected));
    setError(null);
    setMode("edit");
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

  const handleSubmit = async () => {
    if (!selected) return;
    if (!formData.first_name?.trim()) {
      setError("First name is required");
      return;
    }
    if (!formData.phone.trim()) {
      setError("Phone number is required");
      return;
    }
    if (
      formData.age != null &&
      formData.age > 0 &&
      (!Number.isFinite(formData.age) || formData.age < 1 || formData.age > 120)
    ) {
      setError("Age must be between 1 and 120");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: UserCreate = {
        first_name: formData.first_name?.trim() || null,
        last_name: formData.last_name || null,
        phone: formData.phone.trim(),
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
        is_participant: formData.is_participant,
        status: formData.status,
      };
      if (formData.age != null && formData.age > 0) {
        payload.age = Math.trunc(formData.age);
      }
      await usersApi.update(selected.user_id, payload);
      const refreshed = await usersApi.get(selected.user_id);
      setSelected(refreshed.data.data);
      setMode("view");
      onSaved?.();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={mode === "edit" ? "Edit User" : "User Details"}
        maxWidthClassName={mode === "view" ? "max-w-xl" : "max-w-3xl"}
        zIndexClassName={zIndexClassName}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading user…
          </div>
        ) : error && !selected ? (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        ) : mode === "view" && selected ? (
          <div className="space-y-6">
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
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Account
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {field("Status", selected.status)}
                {field(
                  "Participant",
                  selected.is_participant === true
                    ? "Yes"
                    : selected.is_participant === false
                      ? "No"
                      : "—"
                )}
                {field("Referred By", selected.referred_by)}
                {field("Created", formatDate(selected.created_at))}
                {field("Updated", formatDate(selected.updated_at))}
                {userEngagements.length > 0 ? (
                  <div>
                    <span className="text-zinc-500 text-xs uppercase tracking-wide">
                      Engagement
                    </span>
                    {mayViewEngagements ? <button
                      type="button"
                      onClick={() => setEngagementDetailId(userEngagements[0].id)}
                      className="text-zinc-900 mt-0.5 hover:underline font-medium text-left block"
                    >
                      {userEngagements[0].name}
                    </button> : <span className="text-zinc-900 mt-0.5 font-medium block">{userEngagements[0].name}</span>}
                  </div>
                ) : (
                  field("Engagement", "—")
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
              {mayViewJourneys && <button
                type="button"
                onClick={() => {
                  handleClose();
                  navigate(`/users/${selected.user_id}/journey`);
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-800 text-sm font-medium hover:bg-zinc-50 inline-flex items-center justify-center gap-2"
              >
                <ListTree className="w-4 h-4 shrink-0" />
                Participant journey
              </button>}
              {mayEditUsers && <button
                type="button"
                onClick={openEdit}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
              >
                Edit
              </button>}
              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : mode === "edit" && selected ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="space-y-6"
          >
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
            )}

            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Personal Info
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={formData.first_name ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="First name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.last_name ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Age</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={formData.age != null && formData.age > 0 ? formData.age : ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        age: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="18"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="+91 9999999999"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="email@example.com"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Profile Photo URL
                  </label>
                  <input
                    type="url"
                    value={formData.profile_photo ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, profile_photo: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="https://"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Upload Profile Photo
                  </label>
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
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, gender: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Address
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={formData.address ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Street address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Pin Code
                  </label>
                  <input
                    type="text"
                    value={formData.pin_code ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, pin_code: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Pin / ZIP"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={formData.state ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, state: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="State"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={formData.country ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, country: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Country"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Account
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status ?? "active"}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Referred By
                  </label>
                  <input
                    type="text"
                    value={formData.referred_by ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, referred_by: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Referral code or name"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="user-details-is-participant"
                    type="checkbox"
                    checked={formData.is_participant ?? false}
                    onChange={(e) =>
                      setFormData({ ...formData, is_participant: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <label
                    htmlFor="user-details-is-participant"
                    className="text-sm font-medium text-zinc-700"
                  >
                    Is Participant
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Update User"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("view");
                  setError(null);
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      {engagementDetailId != null && (
        <Engagements
          asModalForEngagementId={engagementDetailId}
          onCloseModal={() => setEngagementDetailId(null)}
        />
      )}
    </>
  );
}
