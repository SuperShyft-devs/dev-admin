import { useEffect, useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import {
  type AssessmentPackage,
  type DiagnosticPackageListItem,
  type EngagementCreate,
  type EngagementKind,
  type GeocodeSuggestion,
  type NotificationServiceItem,
  type OrganizationListItem,
} from "../../lib/api";
import { AddressAutocomplete } from "./AddressAutocomplete";

const ENGAGEMENT_KIND_OPTIONS: EngagementKind[] = ["bio_ai", "diagnostic", "doctor", "nutritionist"];
const DEFAULT_ENGAGEMENT_NOTIFICATION_SERVICE_KEY = "booking-alert-whatsapp";

const STEPS = [
  { id: 1, label: "Basics & location" },
  { id: 2, label: "Packages & flags" },
  { id: 3, label: "Notifications" },
] as const;

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900";

type Props = {
  open: boolean;
  mode: "add" | "edit";
  initialData: EngagementCreate;
  organizations: OrganizationListItem[];
  assessmentPackages: AssessmentPackage[];
  diagnosticPackages: DiagnosticPackageListItem[];
  notificationServices: NotificationServiceItem[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: EngagementCreate) => void;
};

export function EngagementFormModal({
  open,
  mode,
  initialData,
  organizations,
  assessmentPackages,
  diagnosticPackages,
  notificationServices,
  submitting,
  onClose,
  onSubmit,
}: Props) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<EngagementCreate>(initialData);
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormData(initialData);
    setStep(1);
    setStepError(null);
    // Only hydrate when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);


  const applySuggestion = (suggestion: GeocodeSuggestion) => {
    setFormData((prev) => ({
      ...prev,
      address: suggestion.display_name || suggestion.address || prev.address || "",
      sub_locality: suggestion.sub_locality ?? prev.sub_locality ?? "",
      landmark: suggestion.landmark ?? prev.landmark ?? "",
      city: suggestion.city ?? prev.city ?? "",
      pincode: suggestion.pincode ?? prev.pincode ?? "",
      state: suggestion.state ?? prev.state ?? "",
      country: suggestion.country ?? prev.country ?? "",
      latitude: suggestion.latitude ?? prev.latitude ?? null,
      longitude: suggestion.longitude ?? prev.longitude ?? null,
    }));
  };

  const validateStep1 = () => {
    const missingOrg = mode === "add" && !(formData.organization_id && formData.organization_id > 0);
    const missingDates = !formData.start_date || !formData.end_date;
    if (missingOrg || missingDates) {
      const parts: string[] = [];
      if (missingOrg) parts.push("organisation");
      if (missingDates) parts.push("start and end dates");
      setStepError(`Please fill required fields: ${parts.join(", ")}`);
      return false;
    }
    setStepError(null);
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => {
    setStepError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      goNext();
      return;
    }
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    onSubmit(formData);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "add" ? "Add Engagement" : "Edit Engagement"}
      maxWidthClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center gap-2">
          {STEPS.map((item, index) => {
            const active = step === item.id;
            const done = step > item.id;
            return (
              <div key={item.id} className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 ${
                    active
                      ? "bg-zinc-900 text-white"
                      : done
                        ? "bg-zinc-200 text-zinc-800"
                        : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {item.id}
                </div>
                <span
                  className={`text-xs font-medium truncate ${
                    active ? "text-zinc-900" : "text-zinc-500"
                  }`}
                >
                  {item.label}
                </span>
                {index < STEPS.length - 1 && <div className="hidden sm:block flex-1 h-px bg-zinc-200" />}
              </div>
            );
          })}
        </div>

        {stepError && <p className="text-sm text-red-600">{stepError}</p>}

        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.engagement_name ?? ""}
                onChange={(e) => setFormData({ ...formData, engagement_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Engagement Code</label>
              <input
                type="text"
                value={formData.engagement_code ?? ""}
                onChange={(e) => setFormData({ ...formData, engagement_code: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Type *</label>
              <select
                value={formData.engagement_type}
                onChange={(e) =>
                  setFormData({ ...formData, engagement_type: e.target.value as EngagementKind })
                }
                className={inputClass}
                required
              >
                {ENGAGEMENT_KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Organisation{mode === "add" ? " *" : ""}
              </label>
              <select
                value={formData.organization_id ?? 0}
                onChange={(e) => setFormData({ ...formData, organization_id: Number(e.target.value) })}
                className={inputClass}
                required={mode === "add"}
              >
                <option value={0}>
                  {mode === "edit" ? "None (B2C / public)" : "Select organisation"}
                </option>
                {organizations.map((o) => (
                  <option key={o.organization_id} value={o.organization_id}>
                    {o.name ?? o.organization_id}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
              <AddressAutocomplete
                value={formData.address ?? ""}
                onChange={(address) => setFormData({ ...formData, address })}
                onSelect={applySuggestion}
                inputClassName={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Sub locality</label>
              <input
                type="text"
                value={formData.sub_locality ?? ""}
                onChange={(e) => setFormData({ ...formData, sub_locality: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Landmark</label>
              <input
                type="text"
                value={formData.landmark ?? ""}
                onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city ?? ""}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Pincode</label>
              <input
                type="text"
                value={formData.pincode ?? ""}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">State</label>
              <input
                type="text"
                value={formData.state ?? ""}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Country</label>
              <input
                type="text"
                value={formData.country ?? ""}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Latitude</label>
              <input
                type="number"
                step="any"
                value={formData.latitude ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    latitude: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Longitude</label>
              <input
                type="number"
                step="any"
                value={formData.longitude ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    longitude: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Start date *</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className={inputClass}
                required
              />
              <p className="text-xs text-zinc-500 mt-1">
                Same start date as other engagements from this organisation groups them into one camp.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">End date *</label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className={inputClass}
                required
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Assessment package</label>
              <select
                value={formData.assessment_package_id ?? 0}
                onChange={(e) =>
                  setFormData({ ...formData, assessment_package_id: Number(e.target.value) })
                }
                className={inputClass}
              >
                <option value={0}>None</option>
                {assessmentPackages.map((p) => (
                  <option key={p.package_id} value={p.package_id}>
                    {p.display_name ?? p.package_code ?? p.package_id}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Diagnostic package</label>
              <select
                value={formData.diagnostic_package_id ?? 0}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setFormData({ ...formData, diagnostic_package_id: next > 0 ? next : undefined });
                }}
                className={inputClass}
              >
                <option value={0}>None</option>
                {diagnosticPackages.map((p) => (
                  <option key={p.diagnostic_package_id} value={p.diagnostic_package_id}>
                    {p.package_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Slot duration (min)</label>
              <input
                type="number"
                min={1}
                max={480}
                value={formData.slot_duration}
                onChange={(e) => setFormData({ ...formData, slot_duration: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Metsights Engagement ID
              </label>
              <input
                type="text"
                value={formData.metsights_engagement_id ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, metsights_engagement_id: e.target.value })
                }
                className={inputClass}
                placeholder="Optional external Metsights ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Create Profile On Metsights
              </label>
              <div className="flex gap-5 py-2">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="create_profile_on_metsights"
                    checked={Boolean(formData.create_profile_on_metsights)}
                    onChange={() => setFormData({ ...formData, create_profile_on_metsights: true })}
                  />
                  Yes
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="create_profile_on_metsights"
                    checked={!formData.create_profile_on_metsights}
                    onChange={() => setFormData({ ...formData, create_profile_on_metsights: false })}
                  />
                  No
                </label>
              </div>
              {Boolean(formData.create_profile_on_metsights) && (
                <p className="text-xs text-zinc-500 mt-1">
                  {(formData.metsights_engagement_id ?? "").trim()
                    ? "Users will be registered to the Metsights engagement on onboarding."
                    : "A standalone Metsights profile will be created for each user on onboarding (no engagement registration)."}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Enroll For FitPrint Full
              </label>
              <div className="flex gap-5 py-2">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="enroll_for_fitprint_full"
                    checked={Boolean(formData.enroll_for_fitprint_full)}
                    onChange={() => setFormData({ ...formData, enroll_for_fitprint_full: true })}
                  />
                  Yes
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="enroll_for_fitprint_full"
                    checked={!formData.enroll_for_fitprint_full}
                    onChange={() => setFormData({ ...formData, enroll_for_fitprint_full: false })}
                  />
                  No
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Onboarding notification service
              </label>
              <select
                value={
                  formData.notification_service_key ?? DEFAULT_ENGAGEMENT_NOTIFICATION_SERVICE_KEY
                }
                onChange={(e) =>
                  setFormData({ ...formData, notification_service_key: e.target.value })
                }
                className={inputClass}
              >
                {notificationServices.length === 0 ? (
                  <option value={DEFAULT_ENGAGEMENT_NOTIFICATION_SERVICE_KEY}>
                    booking-alert-whatsapp
                  </option>
                ) : (
                  notificationServices.map((s) => (
                    <option key={s.service_key} value={s.service_key}>
                      {s.display_name} ({s.service_key})
                    </option>
                  ))
                )}
              </select>
            </div>
            {(
              [
                {
                  field: "pretest_guidelines_notification" as const,
                  label: "Pretest Guidelines Notification",
                },
                {
                  field: "questionnaire_reminder_1" as const,
                  label: "Questionnaire Reminder 1 (day before)",
                },
                {
                  field: "questionnaire_reminder_2" as const,
                  label: "Questionnaire Reminder 2 (day after)",
                },
                { field: "blood_report_notification" as const, label: "Blood Report Notification" },
                { field: "bioai_report_notification" as const, label: "BioAI Report Notification" },
              ] as const
            ).map(({ field, label }) => {
              const currentValue = formData[field] as string | null;
              const selectedKeys = currentValue ? currentValue.split(",").filter(Boolean) : [];
              const isEnabled = currentValue !== null;
              return (
                <div key={field}>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
                  <div className="flex items-center gap-4 mb-2">
                    <label className="flex items-center gap-1.5 text-sm text-zinc-600 cursor-pointer">
                      <input
                        type="radio"
                        name={`${field}_toggle`}
                        checked={!isEnabled}
                        onChange={() => setFormData({ ...formData, [field]: null })}
                      />
                      No
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-zinc-600 cursor-pointer">
                      <input
                        type="radio"
                        name={`${field}_toggle`}
                        checked={isEnabled}
                        onChange={() => setFormData({ ...formData, [field]: "" })}
                      />
                      Yes
                    </label>
                  </div>
                  {isEnabled && (
                    <div className="border border-zinc-300 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                      {notificationServices.length === 0 ? (
                        <p className="text-xs text-zinc-400">No notification services available</p>
                      ) : (
                        notificationServices.map((s) => (
                          <label
                            key={s.service_key}
                            className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer hover:bg-zinc-50 px-1 py-0.5 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={selectedKeys.includes(s.service_key)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...selectedKeys, s.service_key]
                                  : selectedKeys.filter((k) => k !== s.service_key);
                                setFormData({
                                  ...formData,
                                  [field]: next.length > 0 ? next.join(",") : "",
                                });
                              }}
                              className="rounded border-zinc-300"
                            />
                            {s.display_name} ({s.service_key})
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          {step < 3 ? (
            <button
              type="submit"
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : mode === "add" ? "Create" : "Update"}
            </button>
          )}
          {step > 1 && (
            <button
              type="button"
              onClick={goBack}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
