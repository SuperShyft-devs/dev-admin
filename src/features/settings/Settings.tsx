import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pause, Play, RefreshCw, Save, ScrollText, Search, Users } from "lucide-react";
import { DuplicatedUsersModal } from "./DuplicatedUsersModal";
import { IntegrationSyncLogsModal } from "../assessments/IntegrationSyncLogsModal";
import {
  assessmentPackagesApi,
  diagnosticPackagesApi,
  employeesApi,
  notificationsApi,
  platformSettingsApi,
  type AssessmentPackage,
  type DefaultOnboardingAssistantItem,
  type DiagnosticPackageListItem,
  type EmployeeListItem,
  type EngagementKind,
  type EngagementNotificationDefaults,
  type BloodCollectionType,
  type MetsightsProfilesImportPageResult,
  type MetsightsProfilesStats,
  type NotificationServiceItem,
  type SupportQueryNotification,
  getApiError,
} from "../../lib/api";
import { NotificationServiceChipInput } from "../../shared/ui/NotificationServiceChipInput";
import { fetchAllPages } from "../../lib/fetchAllPages";

const SYNC_STORAGE_KEY = "metsights-sync-v1";

type SyncPhase = "idle" | "running" | "paused" | "completed" | "error";

interface SyncTotals {
  created: number;
  linked: number;
  skipped: number;
  failed: number;
}

interface ProfileImportDetail {
  metsights_profile_id: string;
  reason: string;
}

interface PageLogEntry {
  page: number;
  created: number;
  linked: number;
  skipped: number;
  failed: number;
  at: string;
  skippedItems: ProfileImportDetail[];
  failures: ProfileImportDetail[];
}

function shortProfileId(id: string) {
  const trimmed = id.trim();
  if (trimmed.length <= 12) return trimmed || "—";
  return `${trimmed.slice(0, 8)}…`;
}

function labelAssessment(p: AssessmentPackage) {
  const name = p.display_name?.trim() || p.package_code?.trim() || `Package ${p.package_id}`;
  return `${name} (#${p.package_id})`;
}

function labelDiagnostic(p: DiagnosticPackageListItem) {
  const name = p.package_name?.trim() || `Package ${p.diagnostic_package_id}`;
  return `${name} (#${p.diagnostic_package_id})`;
}

function labelEmployee(emp: EmployeeListItem | DefaultOnboardingAssistantItem) {
  const first = emp.first_name?.trim() ?? "";
  const last = emp.last_name?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  return full || `Employee #${emp.employee_id}`;
}

const ASSIGNABLE_ASSISTANT_ROLES = new Set(["admin", "onboarding_assistant", "organization_manager"]);

const ENGAGEMENT_TYPE_OPTIONS: { value: EngagementKind; label: string }[] = [
  { value: "bio_ai", label: "BioAi" },
  { value: "blood_test", label: "Blood Test" },
  { value: "consultation", label: "Consultation" },
  { value: "blood_test_with_consultation", label: "Blood Test with Consultation" },
  { value: "bio_ai_with_consultation", label: "BioAi with Consultation" },
];

const BLOOD_COLLECTION_TYPE_OPTIONS: { value: BloodCollectionType | ""; label: string }[] = [
  { value: "", label: "None" },
  { value: "home_collection", label: "Home Collection" },
  { value: "camp_collection", label: "Camp Collection" },
];

function formatCount(n: number | undefined) {
  if (n === undefined) return "—";
  return n.toLocaleString();
}

function totalPagesFromCount(total: number, pageSize: number) {
  if (total <= 0 || pageSize <= 0) return 0;
  return Math.ceil(total / pageSize);
}

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const [assessmentPackages, setAssessmentPackages] = useState<AssessmentPackage[]>([]);
  const [diagnosticPackages, setDiagnosticPackages] = useState<DiagnosticPackageListItem[]>([]);

  const [assessmentId, setAssessmentId] = useState<number>(1);
  const [diagnosticId, setDiagnosticId] = useState<number>(1);
  const [engagementType, setEngagementType] = useState<EngagementKind>("bio_ai");
  const [bloodCollectionType, setBloodCollectionType] = useState<BloodCollectionType | null>(null);
  const [createProfileOnMetsights, setCreateProfileOnMetsights] = useState(true);
  const [enrollForFitprintFull, setEnrollForFitprintFull] = useState(false);

  const [notificationServices, setNotificationServices] = useState<NotificationServiceItem[]>([]);
  const [notificationDefaults, setNotificationDefaults] = useState<EngagementNotificationDefaults>({});
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationSaveOk, setNotificationSaveOk] = useState<string | null>(null);

  const [defaultAssistantEmployees, setDefaultAssistantEmployees] = useState<EmployeeListItem[]>([]);
  const [selectedDefaultAssistantIds, setSelectedDefaultAssistantIds] = useState<Set<number>>(new Set());
  const [defaultAssistantSearch, setDefaultAssistantSearch] = useState("");
  const [savingDefaultAssistants, setSavingDefaultAssistants] = useState(false);
  const [defaultAssistantsError, setDefaultAssistantsError] = useState<string | null>(null);
  const [defaultAssistantsSaveOk, setDefaultAssistantsSaveOk] = useState<string | null>(null);

  const [supportQueryNotification, setSupportQueryNotification] = useState<string | null>(null);
  const [savingSupportQueryNotification, setSavingSupportQueryNotification] = useState(false);
  const [supportQueryNotificationError, setSupportQueryNotificationError] = useState<string | null>(null);
  const [supportQueryNotificationSaveOk, setSupportQueryNotificationSaveOk] = useState<string | null>(null);

  const [msStats, setMsStats] = useState<MetsightsProfilesStats | null>(null);
  const [msStatsLoading, setMsStatsLoading] = useState(false);
  const [msStatsError, setMsStatsError] = useState<string | null>(null);

  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [nextPage, setNextPage] = useState(1);
  const [processedProfiles, setProcessedProfiles] = useState(0);
  const [metsightsTotal, setMetsightsTotal] = useState(0);
  const [pageSizeHint, setPageSizeHint] = useState(10);
  const [syncTotals, setSyncTotals] = useState<SyncTotals>({ created: 0, linked: 0, skipped: 0, failed: 0 });
  const [syncError, setSyncError] = useState<string | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [activityLog, setActivityLog] = useState<PageLogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [duplicatesModalOpen, setDuplicatesModalOpen] = useState(false);
  const [integrationLogsOpen, setIntegrationLogsOpen] = useState(false);

  const pauseRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const loadB2c = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveOk(null);
    try {
      const [defaultsRes, notifDefaultsRes, assistantDefaultsRes, supportQueryRes, notifServicesRes, aPkgs, dRes, employeesRes] =
        await Promise.all([
        platformSettingsApi.getB2cOnboarding(),
        platformSettingsApi.getEngagementNotificationDefaults(),
        platformSettingsApi.getDefaultOnboardingAssistants(),
        platformSettingsApi.getSupportQueryNotification(),
        notificationsApi.listServices(),
        fetchAllPages<AssessmentPackage>((page, limit) =>
          assessmentPackagesApi.list({ page, limit, status: "active" })
        ),
        diagnosticPackagesApi.list(),
        employeesApi.list({ status: "active", limit: 100 }),
      ]);

      const d = defaultsRes.data.data;
      setAssessmentId(d.b2c_default_assessment_package_id);
      setDiagnosticId(d.b2c_default_diagnostic_package_id);
      setEngagementType(d.b2c_default_engagement_type);
      setBloodCollectionType(d.b2c_default_blood_collection_type);
      setCreateProfileOnMetsights(d.b2c_default_create_profile_on_metsights);
      setEnrollForFitprintFull(d.b2c_default_enroll_for_fitprint_full);
      setNotificationDefaults(notifDefaultsRes.data.data ?? {});
      setSelectedDefaultAssistantIds(new Set(assistantDefaultsRes.data.data.employee_ids ?? []));
      setSupportQueryNotification(
        supportQueryRes.data.data?.default_support_query_notification ?? null
      );
      setNotificationServices(
        (notifServicesRes.data.data ?? []).filter((s) => s.is_active !== false)
      );

      setAssessmentPackages(aPkgs);
      const assignableEmployees = (employeesRes.data.data ?? []).filter((e) =>
        ASSIGNABLE_ASSISTANT_ROLES.has((e.role ?? "").toLowerCase())
      );
      setDefaultAssistantEmployees(assignableEmployees);
      const dPkgs = (dRes.data.data ?? []).filter(
        (p) => (p.status ?? "active").toLowerCase() === "active"
      );
      setDiagnosticPackages(dPkgs);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMsStats = useCallback(async () => {
    setMsStatsLoading(true);
    setMsStatsError(null);
    try {
      const res = await platformSettingsApi.getMetsightsProfileStats();
      setMsStats(res.data.data);
      return res.data.data;
    } catch (err) {
      setMsStatsError(getApiError(err));
      return null;
    } finally {
      setMsStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadB2c();
    void refreshMsStats();
  }, [loadB2c, refreshMsStats]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (syncPhase !== "running" && syncPhase !== "paused") return;
    try {
      sessionStorage.setItem(
        SYNC_STORAGE_KEY,
        JSON.stringify({
          nextPage,
          processedProfiles,
          metsightsTotal,
          syncTotals,
          syncPhase,
        })
      );
    } catch {
      /* ignore */
    }
  }, [syncPhase, nextPage, processedProfiles, metsightsTotal, syncTotals]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (enrollForFitprintFull && !createProfileOnMetsights) {
      setError("FitPrint Full enrollment requires Metsights profile creation.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaveOk(null);
    try {
      await platformSettingsApi.patchB2cOnboarding({
        b2c_default_assessment_package_id: assessmentId,
        b2c_default_diagnostic_package_id: diagnosticId,
        b2c_default_engagement_type: engagementType,
        b2c_default_blood_collection_type: bloodCollectionType,
        b2c_default_create_profile_on_metsights: createProfileOnMetsights,
        b2c_default_enroll_for_fitprint_full: enrollForFitprintFull,
      });
      setSaveOk("Saved. New public B2C onboardings will use these defaults.");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDefaultAssistants(e: React.FormEvent) {
    e.preventDefault();
    setSavingDefaultAssistants(true);
    setDefaultAssistantsError(null);
    setDefaultAssistantsSaveOk(null);
    try {
      await platformSettingsApi.patchDefaultOnboardingAssistants({
        employee_ids: Array.from(selectedDefaultAssistantIds),
      });
      setDefaultAssistantsSaveOk(
        "Saved. New B2B and B2C engagements will auto-assign these assistants."
      );
    } catch (err) {
      setDefaultAssistantsError(getApiError(err));
    } finally {
      setSavingDefaultAssistants(false);
    }
  }

  async function handleSaveSupportQueryNotification(e: React.FormEvent) {
    e.preventDefault();
    setSavingSupportQueryNotification(true);
    setSupportQueryNotificationError(null);
    setSupportQueryNotificationSaveOk(null);
    try {
      const payload: SupportQueryNotification = {
        default_support_query_notification: supportQueryNotification,
      };
      const res = await platformSettingsApi.patchSupportQueryNotification(payload);
      setSupportQueryNotification(res.data.data?.default_support_query_notification ?? null);
      setSupportQueryNotificationSaveOk(
        "Saved. Default onboarding assistants will be notified with these services when a support query is submitted."
      );
    } catch (err) {
      setSupportQueryNotificationError(getApiError(err));
    } finally {
      setSavingSupportQueryNotification(false);
    }
  }

  function toggleDefaultAssistantSelection(id: number) {
    setSelectedDefaultAssistantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredDefaultAssistantEmployees = useMemo(() => {
    const q = defaultAssistantSearch.trim().toLowerCase();
    if (!q) return defaultAssistantEmployees;
    return defaultAssistantEmployees.filter((e) => {
      const name = labelEmployee(e).toLowerCase();
      return (
        String(e.employee_id).includes(q) ||
        (e.role ?? "").toLowerCase().includes(q) ||
        name.includes(q)
      );
    });
  }, [defaultAssistantEmployees, defaultAssistantSearch]);

  async function handleSaveNotificationDefaults(e: React.FormEvent) {
    e.preventDefault();
    setSavingNotifications(true);
    setNotificationError(null);
    setNotificationSaveOk(null);
    try {
      await platformSettingsApi.patchEngagementNotificationDefaults(notificationDefaults);
      setNotificationSaveOk(
        "Saved. New engagements and B2C auto-engagements will use these notification defaults."
      );
    } catch (err) {
      setNotificationError(getApiError(err));
    } finally {
      setSavingNotifications(false);
    }
  }

  function applyPageResult(result: MetsightsProfilesImportPageResult) {
    if (result.metsights_total > 0) {
      setMetsightsTotal(result.metsights_total);
    }
    if (result.page_size > 0) {
      setPageSizeHint(result.page_size);
    }
    setProcessedProfiles((prev) => {
      const next = prev + result.page_size;
      return result.metsights_total > 0 ? Math.min(next, result.metsights_total) : next;
    });
    setSyncTotals((prev) => ({
      created: prev.created + result.created,
      linked: prev.linked + result.linked,
      skipped: prev.skipped + result.skipped,
      failed: prev.failed + result.failed,
    }));
    setActivityLog((prev) => {
      const entry: PageLogEntry = {
        page: result.page,
        created: result.created,
        linked: result.linked,
        skipped: result.skipped,
        failed: result.failed,
        at: new Date().toLocaleTimeString(),
        skippedItems: result.skipped_items ?? [],
        failures: result.failures ?? [],
      };
      return [entry, ...prev].slice(0, 15);
    });
  }

  const runSyncLoop = useCallback(
    async (startPage: number) => {
      if (runningRef.current) return;
      runningRef.current = true;
      pauseRef.current = false;
      setSyncError(null);
      setFailedPage(null);
      setSyncPhase("running");

      let page = startPage;
      const total = metsightsTotal || msStats?.metsights_total || 0;

      try {
        while (!pauseRef.current) {
          if (abortRef.current?.signal.aborted) break;

          const res = await platformSettingsApi.importMetsightsProfilesPage({ page });
          const result = res.data.data;
          applyPageResult(result);

          const remoteTotal = result.metsights_total || total;
          const pages = totalPagesFromCount(remoteTotal, result.page_size || pageSizeHint);
          const hasNext = result.metsights_next != null && result.metsights_next !== "";

          page += 1;
          setNextPage(page);

          if (!hasNext || (pages > 0 && page > pages)) {
            setSyncPhase("completed");
            await refreshMsStats();
            break;
          }
        }

        if (pauseRef.current) {
          setSyncPhase("paused");
          await refreshMsStats();
        }
      } catch (err) {
        if (abortRef.current?.signal.aborted) return;
        setSyncError(getApiError(err));
        setFailedPage(page);
        setSyncPhase("error");
      } finally {
        runningRef.current = false;
      }
    },
    [metsightsTotal, msStats?.metsights_total, pageSizeHint, refreshMsStats]
  );

  function handleLoad() {
    abortRef.current = new AbortController();
    setNextPage(1);
    setProcessedProfiles(0);
    setSyncTotals({ created: 0, linked: 0, skipped: 0, failed: 0 });
    setActivityLog([]);
    setSyncPhase("idle");
    const total = msStats?.metsights_total ?? 0;
    setMetsightsTotal(total);
    void runSyncLoop(1);
  }

  function handlePause() {
    pauseRef.current = true;
  }

  function handleResume() {
    if (syncPhase === "error" && failedPage != null) {
      void runSyncLoop(failedPage);
      return;
    }
    void runSyncLoop(nextPage);
  }

  function handleRetryPage() {
    if (failedPage == null || runningRef.current) return;
    setSyncPhase("running");
    setSyncError(null);
    void runSyncLoop(failedPage);
  }

  const progressTotal = metsightsTotal || msStats?.metsights_total || 0;
  const progressPct =
    progressTotal > 0 ? Math.min(100, Math.round((processedProfiles / progressTotal) * 100)) : 0;
  const totalPages = totalPagesFromCount(progressTotal, pageSizeHint);
  const currentPageDisplay = Math.max(1, nextPage - 1);
  const canLoad =
    syncPhase !== "running" && !msStatsLoading && (msStats?.metsights_total ?? 0) > 0 && !msStatsError;
  const isSyncing = syncPhase === "running";

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Platform defaults and Metsights profile synchronization.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIntegrationLogsOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-zinc-300 text-zinc-700 hover:bg-zinc-50 shrink-0"
        >
          <ScrollText className="w-4 h-4" />
          Integration logs
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">B2C onboarding defaults</h2>
          <p className="text-xs text-zinc-500 -mt-2">
            Used by <code className="bg-zinc-100 px-1 rounded">POST /users/public/onboard</code>. Only new onboardings
            are affected.
          </p>

          <div>
            <label htmlFor="b2c-assessment" className="block text-sm font-medium text-zinc-700 mb-1">
              Default assessment package
            </label>
            <select
              id="b2c-assessment"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={assessmentId}
              onChange={(ev) => setAssessmentId(Number(ev.target.value))}
            >
              {assessmentPackages.map((p) => (
                <option key={p.package_id} value={p.package_id}>
                  {labelAssessment(p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="b2c-diagnostic" className="block text-sm font-medium text-zinc-700 mb-1">
              Default diagnostic package
            </label>
            <select
              id="b2c-diagnostic"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={diagnosticId}
              onChange={(ev) => setDiagnosticId(Number(ev.target.value))}
            >
              {diagnosticPackages.map((p) => (
                <option key={p.diagnostic_package_id} value={p.diagnostic_package_id}>
                  {labelDiagnostic(p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="b2c-engagement-type" className="block text-sm font-medium text-zinc-700 mb-1">
              Engagement Type
            </label>
            <select
              id="b2c-engagement-type"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={engagementType}
              onChange={(ev) => setEngagementType(ev.target.value as EngagementKind)}
            >
              {ENGAGEMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="b2c-blood-collection-type" className="block text-sm font-medium text-zinc-700 mb-1">
              Blood Collection Type
            </label>
            <select
              id="b2c-blood-collection-type"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={bloodCollectionType ?? ""}
              onChange={(ev) =>
                setBloodCollectionType((ev.target.value || null) as BloodCollectionType | null)
              }
            >
              {BLOOD_COLLECTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-sm font-medium text-zinc-700 mb-1">Create Profile On Metsights</span>
            <div className="flex gap-5 py-2">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="b2c-create-profile-on-metsights"
                  checked={createProfileOnMetsights}
                  onChange={() => setCreateProfileOnMetsights(true)}
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="b2c-create-profile-on-metsights"
                  checked={!createProfileOnMetsights}
                  onChange={() => setCreateProfileOnMetsights(false)}
                />
                No
              </label>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-zinc-700 mb-1">Enroll For FitPrint Full</span>
            <div className="flex gap-5 py-2">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="b2c-enroll-for-fitprint-full"
                  checked={enrollForFitprintFull}
                  onChange={() => setEnrollForFitprintFull(true)}
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="b2c-enroll-for-fitprint-full"
                  checked={!enrollForFitprintFull}
                  onChange={() => setEnrollForFitprintFull(false)}
                />
                No
              </label>
            </div>
            {enrollForFitprintFull && !createProfileOnMetsights ? (
              <p className="text-xs text-red-600">
                FitPrint Full requires Metsights profile creation.
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {saveOk ? <p className="text-sm text-emerald-700">{saveOk}</p> : null}

          <button
            type="submit"
            disabled={
              saving ||
              assessmentPackages.length === 0 ||
              diagnosticPackages.length === 0 ||
              (enrollForFitprintFull && !createProfileOnMetsights)
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save defaults
          </button>
        </form>
      )}

      {!loading ? (
        <form
          onSubmit={(e) => void handleSaveDefaultAssistants(e)}
          className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-zinc-900">Default onboarding assistants</h2>
          <p className="text-xs text-zinc-500 -mt-2">
            Auto-assigned when new B2B or B2C engagements are created.{" "}
            <code className="bg-zinc-100 px-1 rounded">organization_manager</code> employees only
            apply to B2B engagements for organizations they manage.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              placeholder="Search by name, role, or ID…"
              value={defaultAssistantSearch}
              onChange={(ev) => setDefaultAssistantSearch(ev.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
          </div>

          {defaultAssistantEmployees.length === 0 ? (
            <p className="text-sm text-zinc-500">No active assignable employees found.</p>
          ) : filteredDefaultAssistantEmployees.length === 0 ? (
            <p className="text-sm text-zinc-500">No employees match your search.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              {filteredDefaultAssistantEmployees.map((e) => {
                const checked = selectedDefaultAssistantIds.has(e.employee_id);
                return (
                  <li
                    key={e.employee_id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 ${
                      checked ? "bg-zinc-50" : "bg-white"
                    }`}
                    onClick={() => toggleDefaultAssistantSelection(e.employee_id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDefaultAssistantSelection(e.employee_id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{labelEmployee(e)}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {e.role ? `Role: ${e.role}` : "No role"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-zinc-500">
            Selected: {selectedDefaultAssistantIds.size}
          </p>

          {defaultAssistantsError ? (
            <p className="text-sm text-red-600" role="alert">
              {defaultAssistantsError}
            </p>
          ) : null}
          {defaultAssistantsSaveOk ? (
            <p className="text-sm text-emerald-700">{defaultAssistantsSaveOk}</p>
          ) : null}

          <button
            type="submit"
            disabled={savingDefaultAssistants}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {savingDefaultAssistants ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save assistants
          </button>
        </form>
      ) : null}

      {!loading ? (
        <form
          onSubmit={(e) => void handleSaveSupportQueryNotification(e)}
          className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-zinc-900">
            Support notification for default onboarding assistants
          </h2>
          <p className="text-xs text-zinc-500 -mt-2">
            Notification services used to alert default onboarding assistants when a support
            query is submitted.
          </p>

          <NotificationServiceChipInput
            label="Support query notification"
            value={supportQueryNotification}
            onChange={setSupportQueryNotification}
            services={notificationServices}
          />

          {supportQueryNotificationError ? (
            <p className="text-sm text-red-600" role="alert">
              {supportQueryNotificationError}
            </p>
          ) : null}
          {supportQueryNotificationSaveOk ? (
            <p className="text-sm text-emerald-700">{supportQueryNotificationSaveOk}</p>
          ) : null}

          <button
            type="submit"
            disabled={savingSupportQueryNotification}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {savingSupportQueryNotification ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save support notification
          </button>
        </form>
      ) : null}

      {!loading ? (
        <form
          onSubmit={(e) => void handleSaveNotificationDefaults(e)}
          className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-zinc-900">Engagement notification defaults</h2>
          <p className="text-xs text-zinc-500 -mt-2">
            Pre-selected when creating engagements in admin or auto B2C engagements.
          </p>

          <NotificationServiceChipInput
            label="Onboarding notification"
            value={notificationDefaults.default_onboarding_notification ?? null}
            onChange={(next) =>
              setNotificationDefaults((prev) => ({ ...prev, default_onboarding_notification: next }))
            }
            services={notificationServices}
          />
          <NotificationServiceChipInput
            label="Pretest guidelines notification"
            value={notificationDefaults.default_pretest_guidelines_notification ?? null}
            onChange={(next) =>
              setNotificationDefaults((prev) => ({
                ...prev,
                default_pretest_guidelines_notification: next,
              }))
            }
            services={notificationServices}
          />
          <NotificationServiceChipInput
            label="Questionnaire reminder 1"
            value={notificationDefaults.default_questionnaire_reminder_1 ?? null}
            onChange={(next) =>
              setNotificationDefaults((prev) => ({ ...prev, default_questionnaire_reminder_1: next }))
            }
            services={notificationServices}
            excludeKeys={
              notificationDefaults.default_questionnaire_reminder_2
                ? notificationDefaults.default_questionnaire_reminder_2
                    .split(",")
                    .map((k) => k.trim())
                    .filter(Boolean)
                : []
            }
          />
          <NotificationServiceChipInput
            label="Questionnaire reminder 2"
            value={notificationDefaults.default_questionnaire_reminder_2 ?? null}
            onChange={(next) =>
              setNotificationDefaults((prev) => ({ ...prev, default_questionnaire_reminder_2: next }))
            }
            services={notificationServices}
            excludeKeys={
              notificationDefaults.default_questionnaire_reminder_1
                ? notificationDefaults.default_questionnaire_reminder_1
                    .split(",")
                    .map((k) => k.trim())
                    .filter(Boolean)
                : []
            }
          />
          <NotificationServiceChipInput
            label="Blood report notification"
            value={notificationDefaults.default_blood_report_notification ?? null}
            onChange={(next) =>
              setNotificationDefaults((prev) => ({ ...prev, default_blood_report_notification: next }))
            }
            services={notificationServices}
          />
          <NotificationServiceChipInput
            label="BioAI report notification"
            value={notificationDefaults.default_bioai_report_notification ?? null}
            onChange={(next) =>
              setNotificationDefaults((prev) => ({ ...prev, default_bioai_report_notification: next }))
            }
            services={notificationServices}
          />
          <NotificationServiceChipInput
            label="Notify users for consultation"
            value={notificationDefaults.default_notify_users_for_consultation ?? null}
            onChange={(next) =>
              setNotificationDefaults((prev) => ({
                ...prev,
                default_notify_users_for_consultation: next,
              }))
            }
            services={notificationServices}
          />

          {notificationError ? (
            <p className="text-sm text-red-600" role="alert">
              {notificationError}
            </p>
          ) : null}
          {notificationSaveOk ? <p className="text-sm text-emerald-700">{notificationSaveOk}</p> : null}

          <button
            type="submit"
            disabled={savingNotifications}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {savingNotifications ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save notification defaults
          </button>
        </form>
      ) : null}

      <section className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Metsights profile sync</h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-lg">
              Import participant profiles from Metsights into local users. Profiles that already have a matching{" "}
              <code className="bg-zinc-100 px-1 rounded">metsights_profile_id</code> are skipped. Existing users with
              the same phone (with or without +91) are linked and receive the Metsights profile id. If that user already
              has a different Metsights profile id, a sub-profile is created instead.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshMsStats()}
            disabled={msStatsLoading || isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {msStatsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh stats
          </button>
        </div>

        {msStatsError ? (
          <p className="text-sm text-red-600" role="alert">
            {msStatsError}
          </p>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Local users", value: msStats?.local_total_users },
            { label: "Linked (synced)", value: msStats?.local_with_metsights_profile_id },
            { label: "Without Metsights ID", value: msStats?.local_without_metsights_profile_id },
            { label: "Metsights total", value: msStats?.metsights_total },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">{tile.label}</p>
              <p className="text-lg font-semibold text-zinc-900 mt-0.5 tabular-nums">
                {msStatsLoading ? "…" : formatCount(tile.value)}
              </p>
            </div>
          ))}
        </div>

        {msStats && msStats.estimated_not_imported > 0 ? (
          <p className="text-xs text-zinc-500">
            ~{formatCount(msStats.estimated_not_imported)} Metsights profiles may still need import (estimate).
          </p>
        ) : null}

        {(isSyncing || syncPhase === "paused" || syncPhase === "completed" || syncPhase === "error") &&
        processedProfiles > 0 ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-600">
              <span>
                {formatCount(processedProfiles)} / {formatCount(progressTotal)} profiles
              </span>
              <span>
                Page {currentPageDisplay}
                {totalPages > 0 ? ` of ~${totalPages}` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full bg-zinc-900 transition-all duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-zinc-600">
              Created {syncTotals.created} · Linked {syncTotals.linked} · Skipped {syncTotals.skipped} · Failed{" "}
              {syncTotals.failed}
            </p>
          </div>
        ) : null}

        {syncPhase === "completed" ? (
          <p className="text-sm text-emerald-700">Import completed.</p>
        ) : null}
        {syncPhase === "paused" ? (
          <p className="text-sm text-amber-700">Paused. Resume to continue from page {nextPage}.</p>
        ) : null}
        {syncError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-red-600" role="alert">
              {syncError}
            </p>
            {failedPage != null ? (
              <button
                type="button"
                onClick={handleRetryPage}
                className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900"
              >
                Retry page {failedPage}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLoad}
            disabled={!canLoad}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Load
          </button>
          <button
            type="button"
            onClick={handlePause}
            disabled={!isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
          <button
            type="button"
            onClick={handleResume}
            disabled={syncPhase !== "paused" && syncPhase !== "error"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Resume
          </button>
        </div>

        {activityLog.length > 0 ? (
          <div className="border-t border-zinc-100 pt-3">
            <button
              type="button"
              onClick={() => setLogOpen((o) => !o)}
              className="flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              {logOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Activity log ({activityLog.length})
            </button>
            {logOpen ? (
              <ul className="mt-2 space-y-3 max-h-64 overflow-y-auto text-xs text-zinc-600">
                {activityLog.map((entry) => (
                  <li key={`${entry.page}-${entry.at}`} className="space-y-1">
                    <p>
                      <span className="text-zinc-400">{entry.at}</span> Page {entry.page}: {entry.created} created,{" "}
                      {entry.linked} linked, {entry.skipped} skipped, {entry.failed} failed
                    </p>
                    {entry.skippedItems.length > 0 ? (
                      <ul className="ml-3 pl-2 border-l border-amber-200 space-y-0.5">
                        {entry.skippedItems.map((item) => (
                          <li key={`skip-${entry.page}-${item.metsights_profile_id}`} className="text-amber-800/90">
                            <span className="font-mono text-[10px] text-amber-700/80">
                              {shortProfileId(item.metsights_profile_id)}
                            </span>
                            {" — "}
                            {item.reason}
                          </li>
                        ))}
                        {entry.skipped > entry.skippedItems.length ? (
                          <li className="text-zinc-400 italic">
                            +{entry.skipped - entry.skippedItems.length} more skipped (not listed)
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                    {entry.failures.length > 0 ? (
                      <ul className="ml-3 pl-2 border-l border-red-200 space-y-0.5">
                        {entry.failures.map((item) => (
                          <li key={`fail-${entry.page}-${item.metsights_profile_id}`} className="text-red-700/90">
                            <span className="font-mono text-[10px] text-red-600/80">
                              {shortProfileId(item.metsights_profile_id)}
                            </span>
                            {" — "}
                            {item.reason}
                          </li>
                        ))}
                        {entry.failed > entry.failures.length ? (
                          <li className="text-zinc-400 italic">
                            +{entry.failed - entry.failures.length} more failed (not listed)
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">User maintenance</h2>
        <p className="text-xs text-zinc-500 mt-1 max-w-lg">
          Find accounts that share the same phone number (e.g. with or without a +91 prefix) and remove
          duplicates.
        </p>
        <button
          type="button"
          onClick={() => setDuplicatesModalOpen(true)}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-800 hover:bg-zinc-50"
        >
          <Users className="w-4 h-4" />
          Duplicated users
        </button>
      </section>

      <DuplicatedUsersModal open={duplicatesModalOpen} onClose={() => setDuplicatesModalOpen(false)} />
      <IntegrationSyncLogsModal
        open={integrationLogsOpen}
        onClose={() => setIntegrationLogsOpen(false)}
        variant="all"
      />
    </div>
  );
}
