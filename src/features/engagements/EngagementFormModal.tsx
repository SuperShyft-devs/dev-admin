import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  type AssessmentPackage,
  type DiagnosticPackageListItem,
  type EngagementCreate,
  type EngagementKind,
  type EngagementTypeItem,
  type ExpertTypeItem,
  type GeocodeSuggestion,
  type NotificationEventItem,
  type NotificationServiceItem,
  type OrganizationListItem,
  engagementsApi,
  engagementNotificationsApi,
  engagementTypesApi,
  expertTypesApi,
  getApiError,
  notificationEventsApi,
} from "../../lib/api";
import { NotificationServiceChipInput } from "../../shared/ui/NotificationServiceChipInput";
import { AddressAutocomplete } from "./AddressAutocomplete";

const BLOOD_COLLECTION_TYPE_OPTIONS = [
  { value: "", label: "None" },
  { value: "home_collection", label: "Home Collection" },
  { value: "camp_collection", label: "Camp Collection" },
] as const;

const STEPS = [
  { id: 1, label: "Basics & location" },
  { id: 2, label: "Type, packages & flags" },
  { id: 3, label: "Notifications" },
] as const;

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900";

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function needsAssessment(kind: EngagementKind): boolean {
  return kind === "bio_ai" || kind === "bio_ai_with_consultation";
}

function needsDiagnostic(kind: EngagementKind): boolean {
  return kind === "blood_test" || kind === "blood_test_with_consultation" || kind === "bio_ai_with_consultation";
}

function needsConsultation(kind: EngagementKind): boolean {
  return kind === "consultation" || kind === "blood_test_with_consultation" || kind === "bio_ai_with_consultation";
}

type Props = {
  open: boolean;
  mode: "add" | "edit";
  engagementId?: number | null;
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
  engagementId,
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
  const [expertTypes, setExpertTypes] = useState<ExpertTypeItem[]>([]);

  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneMessage, setZoneMessage] = useState<string | null>(null);
  const [zoneMessageTone, setZoneMessageTone] = useState<"info" | "success" | "error">("info");

  const [engagementTypes, setEngagementTypes] = useState<EngagementTypeItem[]>([]);
  const [notificationEvents, setNotificationEvents] = useState<NotificationEventItem[]>([]);
  const [notificationConfig, setNotificationConfig] = useState<Record<number, string>>({});
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const editConfigLoaded = useRef(false);

  useEffect(() => {
    if (!open) return;
    setFormData(initialData);
    setStep(1);
    setStepError(null);
    setZoneMessage(null);
    setZoneMessageTone("info");
    setNotificationEvents([]);
    setNotificationConfig({});
    editConfigLoaded.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    expertTypesApi.list().then((res) => setExpertTypes(res.data.data)).catch(() => {});
    engagementTypesApi.list().then((res) => setEngagementTypes(res.data.data)).catch(() => {});
  }, []);

  const checkZoneId = useCallback(
    async (
      pkgId: number | undefined,
      lat: number | null | undefined,
      lng: number | null | undefined,
      pincode: string | null | undefined
    ) => {
      if (!pkgId || pkgId <= 0) {
        setZoneMessage(null);
        setFormData((prev) => ({ ...prev, healthians_zone_id: undefined }));
        return;
      }

      const pkg = diagnosticPackages.find((p) => p.diagnostic_package_id === pkgId);
      if (!pkg || (pkg.diagnostic_provider || "").toLowerCase() !== "healthians") {
        setZoneMessage("Zone auto-fill applies only to Healthians diagnostic packages.");
        setZoneMessageTone("info");
        return;
      }

      if (lat == null || lng == null) {
        setZoneMessage("Set location coordinates in step 1 (Basics & location) to auto-fill zone ID.");
        setZoneMessageTone("info");
        return;
      }

      const normalizedPincode = (pincode ?? "").trim();
      if (!normalizedPincode) {
        setZoneMessage("Set pincode in step 1 to auto-fill zone ID.");
        setZoneMessageTone("info");
        return;
      }

      setZoneLoading(true);
      setZoneMessage(null);
      try {
        const res = await engagementsApi.resolveHealthiansZone({
          diagnostic_package_id: pkgId,
          latitude: lat,
          longitude: lng,
          pincode: normalizedPincode,
        });
        const result = res.data.data;
        if (result.serviceable && result.zone_id) {
          setFormData((prev) => ({ ...prev, healthians_zone_id: String(result.zone_id) }));
          setZoneMessage(result.message || "Zone ID auto-filled from Healthians.");
          setZoneMessageTone("success");
        } else {
          setZoneMessage(result.message || "Location is not serviceable.");
          setZoneMessageTone("error");
        }
      } catch (err) {
        setZoneMessage(getApiError(err));
        setZoneMessageTone("error");
      } finally {
        setZoneLoading(false);
      }
    },
    [diagnosticPackages]
  );

  const selectedDiagnosticPkg = useMemo(() => {
    const pkgId = formData.diagnostic_package_id;
    if (!pkgId || pkgId <= 0) return undefined;
    return diagnosticPackages.find((p) => p.diagnostic_package_id === pkgId);
  }, [diagnosticPackages, formData.diagnostic_package_id]);

  const isHealthiansDiagnosticPkg =
    (selectedDiagnosticPkg?.diagnostic_provider ?? "").toLowerCase() === "healthians";

  useEffect(() => {
    if (!open || mode !== "edit") return;
    if (!initialData.diagnostic_package_id || initialData.healthians_zone_id?.trim()) return;
    void checkZoneId(
      initialData.diagnostic_package_id,
      initialData.latitude,
      initialData.longitude,
      initialData.pincode
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applySuggestion = (suggestion: GeocodeSuggestion) => {
    setFormData((prev) => {
      const next = {
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
      };
      if (next.diagnostic_package_id) {
        void checkZoneId(
          next.diagnostic_package_id,
          next.latitude,
          next.longitude,
          next.pincode
        );
      }
      return next;
    });
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

  const applyDiagPkgConsultationDefaults = useCallback(
    (pkgId: number | undefined) => {
      if (!pkgId || pkgId <= 0) return;
      const pkg = diagnosticPackages.find((p) => p.diagnostic_package_id === pkgId);
      if (pkg?.complementary_consultation) {
        setFormData((prev) => ({
          ...prev,
          consultations: { ...(prev.consultations ?? {}), ...pkg.complementary_consultation },
        }));
      }
    },
    [diagnosticPackages]
  );

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    const nextStep = Math.min(3, step + 1);
    setStep(nextStep);
    if (nextStep === 2 && formData.diagnostic_package_id) {
      void checkZoneId(
        formData.diagnostic_package_id,
        formData.latitude,
        formData.longitude,
        formData.pincode
      );
    }
  };

  const goBack = () => {
    setStepError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const selectedTypeId = useMemo((): number | null => {
    const val = formData.engagement_type;
    if (typeof val === "number" && val > 0) return val;
    if (typeof val === "string") {
      const match = engagementTypes.find((t) => t.code === val);
      return match?.id ?? null;
    }
    return null;
  }, [formData.engagement_type, engagementTypes]);

  const selectedTypeCode = useMemo((): EngagementKind | null => {
    if (typeof formData.engagement_type === "string") {
      return formData.engagement_type as EngagementKind;
    }
    const match = engagementTypes.find(
      (t) => t.id === formData.engagement_type
    );
    return (match?.code as EngagementKind) ?? null;
  }, [formData.engagement_type, engagementTypes]);

  useEffect(() => {
    if (step !== 3 || !selectedTypeId) return;

    let cancelled = false;
    setNotificationsLoading(true);

    (async () => {
      try {
        const eventsRes = await notificationEventsApi.list({
          engagement_type_id: selectedTypeId,
        });
        if (cancelled) return;
        const events = Array.isArray(eventsRes.data.data) ? eventsRes.data.data : [];
        setNotificationEvents(events);

        const config: Record<number, string> = {};

        if (mode === "edit" && engagementId && !editConfigLoaded.current) {
          editConfigLoaded.current = true;
          try {
            const configRes =
              await engagementNotificationsApi.getForEngagement(engagementId);
            if (!cancelled) {
              const items = Array.isArray(configRes.data.data) ? configRes.data.data : [];
              for (const item of items) {
                const services = Array.isArray(item.notification_services)
                  ? item.notification_services
                  : [];
                config[item.notification_event_id] = services.join(",");
              }
            }
          } catch {
            // fall through with empty config
          }
        } else {
          try {
            const defaultsRes =
              await engagementNotificationsApi.getDefaults(selectedTypeId);
            if (!cancelled) {
              const items = Array.isArray(defaultsRes.data.data) ? defaultsRes.data.data : [];
              for (const item of items) {
                const services = Array.isArray(item.notification_services)
                  ? item.notification_services
                  : [];
                config[item.notification_event_id] = services.join(",");
              }
            }
          } catch {
            // keep empty config
          }
        }

        if (!cancelled) setNotificationConfig(config);
      } catch {
        if (!cancelled) {
          setNotificationEvents([]);
          setNotificationConfig({});
        }
      } finally {
        if (!cancelled) setNotificationsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, selectedTypeId, mode, engagementId]);

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

    const notifications = Object.entries(notificationConfig)
      .filter(([, value]) => value && value.trim())
      .map(([eventId, services]) => ({
        notification_event_id: Number(eventId),
        notification_services: services
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }));

    onSubmit({ ...formData, notifications });
  };

  const submitLabel = (() => {
    if (submitting) return "Saving...";
    if (mode === "edit") return "Update";
    const today = new Date().toISOString().slice(0, 10);
    if (formData.start_date && formData.start_date > today) return "Schedule";
    return "Start";
  })();

  const showAssessment = selectedTypeCode
    ? needsAssessment(selectedTypeCode)
    : false;
  const showDiagnostic = selectedTypeCode
    ? needsDiagnostic(selectedTypeCode)
    : false;
  const showConsultation = selectedTypeCode
    ? needsConsultation(selectedTypeCode)
    : false;

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
              <label className="block text-sm font-medium text-zinc-700 mb-1">Engagement Type *</label>
              <select
                value={selectedTypeId ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, engagement_type: Number(e.target.value) })
                }
                className={inputClass}
                required
              >
                <option value="" disabled>
                  Select type
                </option>
                {engagementTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </select>
            </div>

            {showAssessment && (
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
            )}

            {showDiagnostic && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Diagnostic package</label>
                <select
                  value={formData.diagnostic_package_id ?? 0}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    const pkg =
                      next > 0 ? diagnosticPackages.find((p) => p.diagnostic_package_id === next) : undefined;
                    const isHealthians = (pkg?.diagnostic_provider ?? "").toLowerCase() === "healthians";
                    setFormData({
                      ...formData,
                      diagnostic_package_id: next > 0 ? next : undefined,
                      external_camp_id: isHealthians ? formData.external_camp_id : undefined,
                    });
                    void checkZoneId(
                      next > 0 ? next : undefined,
                      formData.latitude,
                      formData.longitude,
                      formData.pincode
                    );
                    if (next > 0) {
                      applyDiagPkgConsultationDefaults(next);
                    }
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
            )}

            {showConsultation && expertTypes.length > 0 && (
              <div className="md:col-span-2 space-y-2">
                <label className="block text-sm font-medium text-zinc-700">Consultations</label>
                <div className="flex flex-wrap gap-3">
                  {expertTypes.map((et) => (
                    <label key={et.type_key} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 bg-zinc-50 text-sm cursor-pointer hover:bg-zinc-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={!!(formData.consultations ?? {})[et.type_key]}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            consultations: {
                              ...(prev.consultations ?? {}),
                              [et.type_key]: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4"
                      />
                      {et.type}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {isHealthiansDiagnosticPkg && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Healthians Camp ID</label>
                <input
                  type="number"
                  value={formData.external_camp_id ?? ""}
                  onChange={(e) =>
                    setFormData({ ...formData, external_camp_id: toNumberOrNull(e.target.value) })
                  }
                  className={inputClass}
                  placeholder="Optional for B2C engagements"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Blood Collection Type</label>
              <select
                value={formData.blood_collection_type ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, blood_collection_type: e.target.value || undefined })
                }
                className={inputClass}
              >
                {BLOOD_COLLECTION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Healthians Zone ID {zoneLoading && <span className="text-xs text-zinc-400">(loading...)</span>}
              </label>
              <input
                type="text"
                value={formData.healthians_zone_id ?? ""}
                onChange={(e) => setFormData({ ...formData, healthians_zone_id: e.target.value || undefined })}
                className={inputClass}
                placeholder="Auto-filled for Healthians packages"
              />
              {zoneMessage && (
                <p
                  className={`mt-1 text-xs ${
                    zoneMessageTone === "success"
                      ? "text-green-700"
                      : zoneMessageTone === "error"
                        ? "text-red-600"
                        : "text-amber-700"
                  }`}
                >
                  {zoneMessage}
                </p>
              )}
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
            {notificationsLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : notificationEvents.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {selectedTypeId
                  ? "No notification events configured for this engagement type."
                  : "Select an engagement type in step 2 first."}
              </p>
            ) : (
              notificationEvents.map((event) => (
                <NotificationServiceChipInput
                  key={event.notification_event_id}
                  label={event.display_name}
                  value={notificationConfig[event.notification_event_id] || null}
                  onChange={(next) =>
                    setNotificationConfig((prev) => ({
                      ...prev,
                      [event.notification_event_id]: next ?? "",
                    }))
                  }
                  services={notificationServices}
                />
              ))
            )}
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
              {submitLabel}
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
