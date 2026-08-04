import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pause, Play, RefreshCw, Save, ScrollText, Search, Users } from "lucide-react";
import { DuplicatedUsersModal } from "./DuplicatedUsersModal";
import { IntegrationSyncLogsModal } from "../assessments/IntegrationSyncLogsModal";
import {
  assessmentPackagesApi,
  diagnosticPackagesApi,
  employeesApi,
  engagementNotificationsApi,
  engagementTypesApi,
  notificationEventsApi,
  notificationsApi,
  platformSettingsApi,
  type AssessmentPackage,
  type B2cOnboardingTypeDefaults,
  type DefaultOnboardingAssistantItem,
  type DiagnosticPackageListItem,
  type EmployeeListItem,
  type EngagementTypeItem,
  type BloodCollectionType,
  type EngagementsSyncImportPageResult,
  type EngagementsSyncStats,
  type MetsightsProfilesImportPageResult,
  type MetsightsProfilesStats,
  type NotificationEventItem,
  type NotificationDefaultItem,
  type NotificationServiceItem,
  type SupportQueryNotification,
  getApiError,
} from "../../lib/api";
import { NotificationServiceChipInput } from "../../shared/ui/NotificationServiceChipInput";
import { fetchAllPages } from "../../lib/fetchAllPages";

const SYNC_STORAGE_KEY = "metsights-sync-v1";
const ENG_SYNC_STORAGE_KEY = "engagements-sync-v1";

type SyncPhase = "idle" | "running" | "paused" | "completed" | "error";

type B2cDefaultsByType = Record<string, B2cOnboardingTypeDefaults>;

interface SyncTotals {
  created: number;
  linked: number;
  skipped: number;
  failed: number;
}

interface EngSyncTotals {
  created: number;
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

interface EngPageLogEntry {
  page: number;
  created: number;
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

const BLOOD_COLLECTION_TYPE_OPTIONS: { value: BloodCollectionType | ""; label: string }[] = [
  { value: "", label: "None" },
  { value: "home_collection", label: "Home Collection" },
  { value: "camp_collection", label: "Camp Collection" },
];

function emptyTypeDefaults(assessmentId = 1, diagnosticId: number | null = 1): B2cOnboardingTypeDefaults {
  return {
    assessment_package_id: assessmentId,
    diagnostic_package_id: diagnosticId,
    blood_collection_type: null,
    create_profile_on_metsights: true,
    enroll_for_fitprint_full: false,
  };
}

function buildDefaultsByType(
  typeCodes: string[],
  raw: Record<string, B2cOnboardingTypeDefaults> | undefined,
  fallbackAssessmentId = 1,
  fallbackDiagnosticId: number | null = 1
): B2cDefaultsByType {
  const fallback = emptyTypeDefaults(fallbackAssessmentId, fallbackDiagnosticId);
  const result: B2cDefaultsByType = {};
  for (const code of typeCodes) {
    const entry = raw?.[code];
    result[code] = entry
      ? {
          assessment_package_id: entry.assessment_package_id,
          diagnostic_package_id: entry.diagnostic_package_id ?? null,
          blood_collection_type: entry.blood_collection_type ?? null,
          create_profile_on_metsights: entry.create_profile_on_metsights,
          enroll_for_fitprint_full: entry.enroll_for_fitprint_full,
        }
      : { ...fallback };
  }
  return result;
}

function needsAssessment(kind: string): boolean {
  return kind === "bio_ai" || kind === "bio_ai_with_consultation";
}

function needsDiagnostic(kind: string): boolean {
  return (
    kind === "blood_test" || kind === "blood_test_with_consultation" || kind === "bio_ai_with_consultation"
  );
}

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

  const [b2cEngagementTypes, setB2cEngagementTypes] = useState<EngagementTypeItem[]>([]);
  const [activeEngagementType, setActiveEngagementType] = useState<string>("bio_ai");
  const [defaultsByType, setDefaultsByType] = useState<B2cDefaultsByType>(() => buildDefaultsByType(["bio_ai"], undefined));
  const [savedDefaultsByType, setSavedDefaultsByType] = useState<B2cDefaultsByType>(() =>
    buildDefaultsByType(["bio_ai"], undefined)
  );

  const [notificationServices, setNotificationServices] = useState<NotificationServiceItem[]>([]);

  const [notifTypes, setNotifTypes] = useState<EngagementTypeItem[]>([]);
  const [activeNotifType, setActiveNotifType] = useState<number | null>(null);
  const [notifEvents, setNotifEvents] = useState<NotificationEventItem[]>([]);
  const [notifDefaults, setNotifDefaults] = useState<Record<number, string>>({});
  const [, setNotifDefaultsOriginal] = useState<Record<number, string>>({});
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [notifSuccess, setNotifSuccess] = useState(false);
  const notifDraftsRef = useRef<Record<number, Record<number, string>>>({});
  const notifOriginalsRef = useRef<Record<number, Record<number, string>>>({});

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

  const [engStats, setEngStats] = useState<EngagementsSyncStats | null>(null);
  const [engStatsLoading, setEngStatsLoading] = useState(false);
  const [engStatsError, setEngStatsError] = useState<string | null>(null);
  const [engSyncPhase, setEngSyncPhase] = useState<SyncPhase>("idle");
  const [engNextPage, setEngNextPage] = useState(1);
  const [engProcessedUsers, setEngProcessedUsers] = useState(0);
  const [engUsersTotal, setEngUsersTotal] = useState(0);
  const [engPageSizeHint, setEngPageSizeHint] = useState(10);
  const [engSyncTotals, setEngSyncTotals] = useState<EngSyncTotals>({ created: 0, skipped: 0, failed: 0 });
  const [engSyncError, setEngSyncError] = useState<string | null>(null);
  const [engFailedPage, setEngFailedPage] = useState<number | null>(null);
  const [engActivityLog, setEngActivityLog] = useState<EngPageLogEntry[]>([]);
  const [engLogOpen, setEngLogOpen] = useState(false);
  const engPauseRef = useRef(false);
  const engAbortRef = useRef<AbortController | null>(null);
  const engRunningRef = useRef(false);

  const loadB2c = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveOk(null);
    try {
      const [defaultsRes, typesRes, assistantDefaultsRes, supportQueryRes, notifServicesRes, aPkgs, dRes, employeesRes] =
        await Promise.all([
        platformSettingsApi.getB2cOnboarding(),
        engagementTypesApi.list({ is_active: true }),
        platformSettingsApi.getDefaultOnboardingAssistants(),
        platformSettingsApi.getSupportQueryNotification(),
        notificationsApi.listServices(),
        fetchAllPages<AssessmentPackage>((page, limit) =>
          assessmentPackagesApi.list({ page, limit, status: "active" })
        ),
        diagnosticPackagesApi.list(),
        employeesApi.list({ status: "active", limit: 100 }),
      ]);

      const types = typesRes.data.data ?? [];
      const typeCodes = types.map((t) => t.code);
      setB2cEngagementTypes(types);
      setActiveEngagementType((prev) => {
        if (typeCodes.length === 0 || typeCodes.includes(prev)) return prev;
        return typeCodes.includes("bio_ai") ? "bio_ai" : typeCodes[0];
      });

      const d = defaultsRes.data.data;
      const mapped = buildDefaultsByType(typeCodes, d.defaults_by_engagement_type);
      setDefaultsByType(mapped);
      setSavedDefaultsByType(mapped);
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

  const refreshEngStats = useCallback(async () => {
    setEngStatsLoading(true);
    setEngStatsError(null);
    try {
      const res = await platformSettingsApi.getEngagementsSyncStats();
      setEngStats(res.data.data);
      return res.data.data;
    } catch (err) {
      setEngStatsError(getApiError(err));
      return null;
    } finally {
      setEngStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadB2c();
    void refreshMsStats();
    void refreshEngStats();
  }, [loadB2c, refreshMsStats, refreshEngStats]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      engAbortRef.current?.abort();
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

  useEffect(() => {
    if (engSyncPhase !== "running" && engSyncPhase !== "paused") return;
    try {
      sessionStorage.setItem(
        ENG_SYNC_STORAGE_KEY,
        JSON.stringify({
          nextPage: engNextPage,
          processedUsers: engProcessedUsers,
          usersTotal: engUsersTotal,
          syncTotals: engSyncTotals,
          syncPhase: engSyncPhase,
        })
      );
    } catch {
      /* ignore */
    }
  }, [engSyncPhase, engNextPage, engProcessedUsers, engUsersTotal, engSyncTotals]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const invalidType = b2cEngagementTypes.find((option) => {
      const entry = defaultsByType[option.code];
      return entry?.enroll_for_fitprint_full && !entry.create_profile_on_metsights;
    });
    if (invalidType) {
      setError(
        `FitPrint Full enrollment requires Metsights profile creation (${invalidType.display_name}).`
      );
      setActiveEngagementType(invalidType.code);
      return;
    }
    setSaving(true);
    setError(null);
    setSaveOk(null);
    try {
      const res = await platformSettingsApi.patchB2cOnboarding({
        defaults_by_engagement_type: defaultsByType,
      });
      const typeCodes = b2cEngagementTypes.map((t) => t.code);
      const mapped = buildDefaultsByType(typeCodes, res.data.data.defaults_by_engagement_type);
      setDefaultsByType(mapped);
      setSavedDefaultsByType(mapped);
      setSaveOk("Saved. New public B2C onboardings will use these per-type defaults.");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  function updateActiveDefaults(patch: Partial<B2cOnboardingTypeDefaults>) {
    setDefaultsByType((prev) => ({
      ...prev,
      [activeEngagementType]: { ...(prev[activeEngagementType] ?? emptyTypeDefaults()), ...patch },
    }));
  }

  const activeDefaults = defaultsByType[activeEngagementType] ?? emptyTypeDefaults();
  const anyTypeHasFitprintWithoutMetsights = b2cEngagementTypes.some((option) => {
    const entry = defaultsByType[option.code];
    return entry?.enroll_for_fitprint_full && !entry.create_profile_on_metsights;
  });
  const isTypeDirty = (kind: string) =>
    JSON.stringify(defaultsByType[kind]) !== JSON.stringify(savedDefaultsByType[kind]);

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

  useEffect(() => {
    engagementTypesApi.list({ is_active: true }).then((res) => {
      const types = res.data.data ?? [];
      setNotifTypes(types);
      if (types.length > 0) setActiveNotifType(types[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeNotifType === null) return;
    const cached = notifDraftsRef.current[activeNotifType];
    if (cached) {
      setNotifDefaults(cached);
      setNotifDefaultsOriginal(notifOriginalsRef.current[activeNotifType] ?? cached);
      notificationEventsApi.list({ engagement_type_id: activeNotifType }).then((res) => {
        setNotifEvents(res.data.data ?? []);
      }).catch(() => {});
      return;
    }
    setNotifError(null);
    setNotifSuccess(false);
    Promise.all([
      notificationEventsApi.list({ engagement_type_id: activeNotifType }),
      engagementNotificationsApi.getDefaults(activeNotifType),
    ]).then(([eventsRes, defaultsRes]) => {
      const events = Array.isArray(eventsRes.data.data) ? eventsRes.data.data : [];
      setNotifEvents(events);
      const defaults: Record<number, string> = {};
      for (const ev of events) defaults[ev.notification_event_id] = "";
      const defaultsList = Array.isArray(defaultsRes.data.data)
        ? (defaultsRes.data.data as NotificationDefaultItem[])
        : [];
      for (const d of defaultsList) {
        const services = Array.isArray(d.notification_services)
          ? d.notification_services
          : [];
        defaults[d.notification_event_id] = services.join(",");
      }
      setNotifDefaults(defaults);
      setNotifDefaultsOriginal({ ...defaults });
      notifDraftsRef.current[activeNotifType] = { ...defaults };
      notifOriginalsRef.current[activeNotifType] = { ...defaults };
    }).catch((err) => {
      setNotifError(getApiError(err));
    });
  }, [activeNotifType]);

  function isNotifTypeDirty(typeId: number): boolean {
    const draft = notifDraftsRef.current[typeId];
    const original = notifOriginalsRef.current[typeId];
    if (!draft || !original) return false;
    return JSON.stringify(draft) !== JSON.stringify(original);
  }

  function updateNotifDefault(eventId: number, value: string | null) {
    const v = value ?? "";
    setNotifDefaults((prev) => {
      const next = { ...prev, [eventId]: v };
      if (activeNotifType !== null) notifDraftsRef.current[activeNotifType] = next;
      return next;
    });
  }

  async function handleSaveNotifDefaults(e: React.FormEvent) {
    e.preventDefault();
    if (activeNotifType === null) return;
    setNotifSaving(true);
    setNotifError(null);
    setNotifSuccess(false);
    try {
      const payload = Object.entries(notifDefaults).map(([eventId, services]) => ({
        notification_event_id: Number(eventId),
        notification_services: services ? services.split(",").map((s) => s.trim()).filter(Boolean) : [],
      }));
      await engagementNotificationsApi.upsertDefaults(activeNotifType, payload);
      setNotifDefaultsOriginal({ ...notifDefaults });
      notifOriginalsRef.current[activeNotifType] = { ...notifDefaults };
      setNotifSuccess(true);
    } catch (err) {
      setNotifError(getApiError(err));
    } finally {
      setNotifSaving(false);
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

  function applyEngPageResult(result: EngagementsSyncImportPageResult) {
    if (result.users_total > 0) {
      setEngUsersTotal(result.users_total);
    }
    if (result.page_size > 0) {
      setEngPageSizeHint(result.page_size);
    }
    setEngProcessedUsers((prev) => {
      const next = prev + (result.users_on_page || result.page_size);
      return result.users_total > 0 ? Math.min(next, result.users_total) : next;
    });
    setEngSyncTotals((prev) => ({
      created: prev.created + result.created,
      skipped: prev.skipped + result.skipped,
      failed: prev.failed + result.failed,
    }));
    setEngActivityLog((prev) => {
      const entry: EngPageLogEntry = {
        page: result.page,
        created: result.created,
        skipped: result.skipped,
        failed: result.failed,
        at: new Date().toLocaleTimeString(),
        skippedItems: result.skipped_items ?? [],
        failures: result.failures ?? [],
      };
      return [entry, ...prev].slice(0, 15);
    });
  }

  const runEngSyncLoop = useCallback(
    async (startPage: number) => {
      if (engRunningRef.current) return;
      engRunningRef.current = true;
      engPauseRef.current = false;
      setEngSyncError(null);
      setEngFailedPage(null);
      setEngSyncPhase("running");

      let page = startPage;
      const total = engUsersTotal || engStats?.users_with_metsights_profile_id || 0;

      try {
        while (!engPauseRef.current) {
          if (engAbortRef.current?.signal.aborted) break;

          const res = await platformSettingsApi.importEngagementsSyncPage({ page });
          const result = res.data.data;
          applyEngPageResult(result);

          const remoteTotal = result.users_total || total;
          const pages = totalPagesFromCount(remoteTotal, result.page_size || engPageSizeHint);
          const hasNext = result.next_page != null;

          page = result.next_page ?? page + 1;
          setEngNextPage(page);

          if (!hasNext || (pages > 0 && page > pages)) {
            setEngSyncPhase("completed");
            await refreshEngStats();
            break;
          }
        }

        if (engPauseRef.current) {
          setEngSyncPhase("paused");
          await refreshEngStats();
        }
      } catch (err) {
        if (engAbortRef.current?.signal.aborted) return;
        setEngSyncError(getApiError(err));
        setEngFailedPage(page);
        setEngSyncPhase("error");
      } finally {
        engRunningRef.current = false;
      }
    },
    [engUsersTotal, engStats?.users_with_metsights_profile_id, engPageSizeHint, refreshEngStats]
  );

  function handleEngLoad() {
    engAbortRef.current = new AbortController();
    setEngNextPage(1);
    setEngProcessedUsers(0);
    setEngSyncTotals({ created: 0, skipped: 0, failed: 0 });
    setEngActivityLog([]);
    setEngSyncPhase("idle");
    const total = engStats?.users_with_metsights_profile_id ?? 0;
    setEngUsersTotal(total);
    void runEngSyncLoop(1);
  }

  function handleEngPause() {
    engPauseRef.current = true;
  }

  function handleEngResume() {
    if (engSyncPhase === "error" && engFailedPage != null) {
      void runEngSyncLoop(engFailedPage);
      return;
    }
    void runEngSyncLoop(engNextPage);
  }

  function handleEngRetryPage() {
    if (engFailedPage == null || engRunningRef.current) return;
    setEngSyncPhase("running");
    setEngSyncError(null);
    void runEngSyncLoop(engFailedPage);
  }

  const progressTotal = metsightsTotal || msStats?.metsights_total || 0;
  const progressPct =
    progressTotal > 0 ? Math.min(100, Math.round((processedProfiles / progressTotal) * 100)) : 0;
  const totalPages = totalPagesFromCount(progressTotal, pageSizeHint);
  const currentPageDisplay = Math.max(1, nextPage - 1);
  const canLoad =
    syncPhase !== "running" && !msStatsLoading && (msStats?.metsights_total ?? 0) > 0 && !msStatsError;
  const isSyncing = syncPhase === "running";

  const engProgressTotal = engUsersTotal || engStats?.users_with_metsights_profile_id || 0;
  const engProgressPct =
    engProgressTotal > 0 ? Math.min(100, Math.round((engProcessedUsers / engProgressTotal) * 100)) : 0;
  const engTotalPages = totalPagesFromCount(engProgressTotal, engPageSizeHint);
  const engCurrentPageDisplay = Math.max(1, engNextPage - 1);
  const canEngLoad =
    engSyncPhase !== "running" &&
    !engStatsLoading &&
    (engStats?.users_with_metsights_profile_id ?? 0) > 0 &&
    !engStatsError;
  const isEngSyncing = engSyncPhase === "running";

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
            Used by <code className="bg-zinc-100 px-1 rounded">POST /users/public/onboard</code>. Request{" "}
            <code className="bg-zinc-100 px-1 rounded">engagement_type</code> selects which defaults apply.
            Default if omitted: BioAi. Only new onboardings are affected.
          </p>

          <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2">
            {b2cEngagementTypes.map((option) => {
              const active = activeEngagementType === option.code;
              const dirty = isTypeDirty(option.code);
              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setActiveEngagementType(option.code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  {option.display_name}
                  {dirty ? <span className="ml-1 opacity-70">•</span> : null}
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor="b2c-assessment" className="block text-sm font-medium text-zinc-700 mb-1">
              Default assessment package
              {!needsAssessment(activeEngagementType) ? (
                <span className="ml-1 font-normal text-zinc-400">(stored for onboarding)</span>
              ) : null}
            </label>
            <select
              id="b2c-assessment"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={activeDefaults.assessment_package_id}
              onChange={(ev) => updateActiveDefaults({ assessment_package_id: Number(ev.target.value) })}
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
              {!needsDiagnostic(activeEngagementType) ? (
                <span className="ml-1 font-normal text-zinc-400">(stored for onboarding)</span>
              ) : null}
            </label>
            <select
              id="b2c-diagnostic"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={activeDefaults.diagnostic_package_id ?? ""}
              onChange={(ev) =>
                updateActiveDefaults({
                  diagnostic_package_id: ev.target.value ? Number(ev.target.value) : null,
                })
              }
            >
              <option value="">None</option>
              {diagnosticPackages.map((p) => (
                <option key={p.diagnostic_package_id} value={p.diagnostic_package_id}>
                  {labelDiagnostic(p)}
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
              value={activeDefaults.blood_collection_type ?? ""}
              onChange={(ev) =>
                updateActiveDefaults({
                  blood_collection_type: (ev.target.value || null) as BloodCollectionType | null,
                })
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
                  checked={activeDefaults.create_profile_on_metsights}
                  onChange={() => updateActiveDefaults({ create_profile_on_metsights: true })}
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="b2c-create-profile-on-metsights"
                  checked={!activeDefaults.create_profile_on_metsights}
                  onChange={() => updateActiveDefaults({ create_profile_on_metsights: false })}
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
                  checked={activeDefaults.enroll_for_fitprint_full}
                  onChange={() => updateActiveDefaults({ enroll_for_fitprint_full: true })}
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="b2c-enroll-for-fitprint-full"
                  checked={!activeDefaults.enroll_for_fitprint_full}
                  onChange={() => updateActiveDefaults({ enroll_for_fitprint_full: false })}
                />
                No
              </label>
            </div>
            {activeDefaults.enroll_for_fitprint_full && !activeDefaults.create_profile_on_metsights ? (
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
              anyTypeHasFitprintWithoutMetsights
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
          onSubmit={(e) => void handleSaveNotifDefaults(e)}
          className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-zinc-900">Engagement notification defaults</h2>
          <p className="text-xs text-zinc-500 -mt-2">
            Configure default notification services for each engagement type. These are auto-applied
            when creating new engagements.
          </p>

          {notifTypes.length > 0 ? (
            <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2">
              {notifTypes.map((t) => {
                const active = activeNotifType === t.id;
                const dirty = isNotifTypeDirty(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveNotifType(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    {t.display_name}
                    {dirty ? <span className="ml-1 opacity-70">•</span> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-400">Loading engagement types…</p>
          )}

          {activeNotifType !== null && notifEvents.length > 0 ? (
            <div className="space-y-4">
              {notifEvents.map((ev) => (
                <NotificationServiceChipInput
                  key={ev.notification_event_id}
                  label={ev.display_name}
                  value={notifDefaults[ev.notification_event_id] || null}
                  onChange={(next) => updateNotifDefault(ev.notification_event_id, next)}
                  services={notificationServices}
                />
              ))}
            </div>
          ) : activeNotifType !== null ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading events…
            </div>
          ) : null}

          {notifError ? (
            <p className="text-sm text-red-600" role="alert">
              {notifError}
            </p>
          ) : null}
          {notifSuccess ? (
            <p className="text-sm text-emerald-700">
              Saved. New engagements will use these notification defaults.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={notifSaving || activeNotifType === null || notifEvents.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {notifSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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

      <section className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Engagements sync</h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-lg">
              For each local user with a{" "}
              <code className="bg-zinc-100 px-1 rounded">metsights_profile_id</code>, fetch MetSights records and
              create B2C engagements, participants, and assessment instances. FitPrint records and already-imported{" "}
              <code className="bg-zinc-100 px-1 rounded">metsights_record_id</code> values are skipped.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshEngStats()}
            disabled={engStatsLoading || isEngSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {engStatsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh stats
          </button>
        </div>

        {engStatsError ? (
          <p className="text-sm text-red-600" role="alert">
            {engStatsError}
          </p>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          {[
            { label: "Current Total users Engagements", value: engStats?.b2c_engagements_total },
            { label: "Users with Metsights ID", value: engStats?.users_with_metsights_profile_id },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">{tile.label}</p>
              <p className="text-lg font-semibold text-zinc-900 mt-0.5 tabular-nums">
                {engStatsLoading ? "…" : formatCount(tile.value)}
              </p>
            </div>
          ))}
        </div>

        {(isEngSyncing || engSyncPhase === "paused" || engSyncPhase === "completed" || engSyncPhase === "error") &&
        engProcessedUsers > 0 ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-600">
              <span>
                {formatCount(engProcessedUsers)} / {formatCount(engProgressTotal)} users
              </span>
              <span>
                Page {engCurrentPageDisplay}
                {engTotalPages > 0 ? ` of ~${engTotalPages}` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full bg-zinc-900 transition-all duration-300 ease-out"
                style={{ width: `${engProgressPct}%` }}
              />
            </div>
            <p className="text-xs text-zinc-600">
              Created {engSyncTotals.created} · Skipped {engSyncTotals.skipped} · Failed {engSyncTotals.failed}
            </p>
          </div>
        ) : null}

        {engSyncPhase === "completed" ? (
          <p className="text-sm text-emerald-700">Engagements sync completed.</p>
        ) : null}
        {engSyncPhase === "paused" ? (
          <p className="text-sm text-amber-700">Paused. Resume to continue from page {engNextPage}.</p>
        ) : null}
        {engSyncError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-red-600" role="alert">
              {engSyncError}
            </p>
            {engFailedPage != null ? (
              <button
                type="button"
                onClick={handleEngRetryPage}
                className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900"
              >
                Retry page {engFailedPage}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleEngLoad}
            disabled={!canEngLoad}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isEngSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Load
          </button>
          <button
            type="button"
            onClick={handleEngPause}
            disabled={!isEngSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
          <button
            type="button"
            onClick={handleEngResume}
            disabled={engSyncPhase !== "paused" && engSyncPhase !== "error"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Resume
          </button>
        </div>

        {engActivityLog.length > 0 ? (
          <div className="border-t border-zinc-100 pt-3">
            <button
              type="button"
              onClick={() => setEngLogOpen((o) => !o)}
              className="flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              {engLogOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Activity log ({engActivityLog.length})
            </button>
            {engLogOpen ? (
              <ul className="mt-2 space-y-3 max-h-64 overflow-y-auto text-xs text-zinc-600">
                {engActivityLog.map((entry) => (
                  <li key={`${entry.page}-${entry.at}`} className="space-y-1">
                    <p>
                      <span className="text-zinc-400">{entry.at}</span> Page {entry.page}: {entry.created} created,{" "}
                      {entry.skipped} skipped, {entry.failed} failed
                    </p>
                    {entry.skippedItems.length > 0 ? (
                      <ul className="ml-3 pl-2 border-l border-amber-200 space-y-0.5">
                        {entry.skippedItems.map((item) => (
                          <li key={`eng-skip-${entry.page}-${item.metsights_profile_id}-${item.reason}`} className="text-amber-800/90">
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
                          <li key={`eng-fail-${entry.page}-${item.metsights_profile_id}-${item.reason}`} className="text-red-700/90">
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
