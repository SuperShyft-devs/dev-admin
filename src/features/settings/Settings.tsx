import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardCheck, Loader2, Pause, Play, RefreshCw, Save, Users } from "lucide-react";
import { DuplicatedUsersModal } from "./DuplicatedUsersModal";
import {
  assessmentPackagesApi,
  diagnosticPackagesApi,
  platformSettingsApi,
  type AssessmentPackage,
  type DiagnosticPackageListItem,
  type MetsightsProfilesImportPageResult,
  type MetsightsProfilesStats,
  type QuestionnaireCategoryProgressRefreshPageResult,
  type QuestionnaireCategoryProgressRefreshStats,
  getApiError,
} from "../../lib/api";
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

  type CategoryProgressPhase = "idle" | "running" | "paused" | "completed" | "error";

  const [categoryProgressStats, setCategoryProgressStats] =
    useState<QuestionnaireCategoryProgressRefreshStats | null>(null);
  const [categoryProgressStatsLoading, setCategoryProgressStatsLoading] = useState(false);
  const [categoryProgressStatsError, setCategoryProgressStatsError] = useState<string | null>(null);
  const [categoryProgressPhase, setCategoryProgressPhase] = useState<CategoryProgressPhase>("idle");
  const [categoryProgressOffset, setCategoryProgressOffset] = useState(0);
  const [categoryProgressProcessed, setCategoryProgressProcessed] = useState(0);
  const [categoryProgressTotal, setCategoryProgressTotal] = useState(0);
  const [categoryProgressError, setCategoryProgressError] = useState<string | null>(null);
  const [categoryProgressFailedOffset, setCategoryProgressFailedOffset] = useState<number | null>(null);
  const [categoryProgressTotals, setCategoryProgressTotals] = useState({
    categories_synced: 0,
    marked_complete: 0,
    marked_incomplete: 0,
    unchanged: 0,
  });
  const [lastProcessedInstanceId, setLastProcessedInstanceId] = useState<number | null>(null);

  const pauseRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const categoryPauseRef = useRef(false);
  const categoryRunningRef = useRef(false);

  const loadB2c = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveOk(null);
    try {
      const [defaultsRes, aPkgs, dRes] = await Promise.all([
        platformSettingsApi.getB2cOnboarding(),
        fetchAllPages<AssessmentPackage>((page, limit) =>
          assessmentPackagesApi.list({ page, limit, status: "active" })
        ),
        diagnosticPackagesApi.list(),
      ]);

      const d = defaultsRes.data.data;
      setAssessmentId(d.b2c_default_assessment_package_id);
      setDiagnosticId(d.b2c_default_diagnostic_package_id);

      setAssessmentPackages(aPkgs);
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

  const refreshCategoryProgressStats = useCallback(async () => {
    setCategoryProgressStatsLoading(true);
    setCategoryProgressStatsError(null);
    try {
      const res = await platformSettingsApi.getQuestionnaireCategoryProgressRefreshStats();
      setCategoryProgressStats(res.data.data);
      return res.data.data;
    } catch (err) {
      setCategoryProgressStatsError(getApiError(err));
      return null;
    } finally {
      setCategoryProgressStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadB2c();
    void refreshMsStats();
    void refreshCategoryProgressStats();
  }, [loadB2c, refreshMsStats, refreshCategoryProgressStats]);

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
    setSaving(true);
    setError(null);
    setSaveOk(null);
    try {
      await platformSettingsApi.patchB2cOnboarding({
        b2c_default_assessment_package_id: assessmentId,
        b2c_default_diagnostic_package_id: diagnosticId,
      });
      setSaveOk("Saved. New public B2C onboardings will use these packages.");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
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

  const applyCategoryProgressPage = useCallback((result: QuestionnaireCategoryProgressRefreshPageResult) => {
    if (result.assessment_instances_total > 0) {
      setCategoryProgressTotal(result.assessment_instances_total);
    }
    if (result.processed > 0) {
      setCategoryProgressProcessed((prev) => {
        const next = prev + result.processed;
        return result.assessment_instances_total > 0
          ? Math.min(next, result.assessment_instances_total)
          : next;
      });
      if (result.assessment_instance_id != null) {
        setLastProcessedInstanceId(result.assessment_instance_id);
      }
    }
    setCategoryProgressTotals((prev) => ({
      categories_synced: prev.categories_synced + result.categories_synced,
      marked_complete: prev.marked_complete + result.marked_complete,
      marked_incomplete: prev.marked_incomplete + result.marked_incomplete,
      unchanged: prev.unchanged + result.unchanged,
    }));
    setCategoryProgressOffset(result.next_offset);
  }, []);

  const runCategoryProgressLoop = useCallback(
    async (startOffset: number) => {
      if (categoryRunningRef.current) return;
      categoryRunningRef.current = true;
      categoryPauseRef.current = false;
      setCategoryProgressError(null);
      setCategoryProgressFailedOffset(null);
      setCategoryProgressPhase("running");

      let offset = startOffset;
      let total = categoryProgressTotal || categoryProgressStats?.assessment_instances_total || 0;

      try {
        while (!categoryPauseRef.current) {
          const res = await platformSettingsApi.refreshQuestionnaireCategoryProgressPage({ offset });
          const result = res.data.data;
          applyCategoryProgressPage(result);
          total = result.assessment_instances_total || total;
          setCategoryProgressTotal(total);
          offset = result.next_offset;

          if (!result.has_more) {
            setCategoryProgressPhase("completed");
            await refreshCategoryProgressStats();
            break;
          }
        }

        if (categoryPauseRef.current) {
          setCategoryProgressPhase("paused");
        }
      } catch (err) {
        setCategoryProgressError(getApiError(err));
        setCategoryProgressFailedOffset(offset);
        setCategoryProgressPhase("error");
      } finally {
        categoryRunningRef.current = false;
      }
    },
    [
      applyCategoryProgressPage,
      categoryProgressStats?.assessment_instances_total,
      categoryProgressTotal,
      refreshCategoryProgressStats,
    ]
  );

  function handleStartCategoryProgressRefresh() {
    const total = categoryProgressStats?.assessment_instances_total ?? 0;
    const confirmed = window.confirm(
      `Recompute questionnaire category completion for ${total.toLocaleString()} assessment instance(s), ` +
        "one at a time? You can pause and resume."
    );
    if (!confirmed) return;

    setCategoryProgressOffset(0);
    setCategoryProgressProcessed(0);
    setCategoryProgressTotals({
      categories_synced: 0,
      marked_complete: 0,
      marked_incomplete: 0,
      unchanged: 0,
    });
    setLastProcessedInstanceId(null);
    setCategoryProgressTotal(total);
    void runCategoryProgressLoop(0);
  }

  function handlePauseCategoryProgress() {
    categoryPauseRef.current = true;
  }

  function handleResumeCategoryProgress() {
    if (categoryProgressPhase === "error" && categoryProgressFailedOffset != null) {
      void runCategoryProgressLoop(categoryProgressFailedOffset);
      return;
    }
    void runCategoryProgressLoop(categoryProgressOffset);
  }

  function handleRetryCategoryProgressPage() {
    if (categoryProgressFailedOffset == null || categoryRunningRef.current) return;
    setCategoryProgressPhase("running");
    setCategoryProgressError(null);
    void runCategoryProgressLoop(categoryProgressFailedOffset);
  }

  const categoryProgressPct =
    categoryProgressTotal > 0
      ? Math.min(100, Math.round((categoryProgressProcessed / categoryProgressTotal) * 100))
      : 0;
  const isCategoryProgressRunning = categoryProgressPhase === "running";
  const canStartCategoryProgress =
    categoryProgressPhase !== "running" &&
    !categoryProgressStatsLoading &&
    !categoryProgressStatsError &&
    (categoryProgressStats?.assessment_instances_total ?? 0) >= 0;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Platform defaults, Metsights profile sync, and questionnaire maintenance.
        </p>
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

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {saveOk ? <p className="text-sm text-emerald-700">{saveOk}</p> : null}

          <button
            type="submit"
            disabled={saving || assessmentPackages.length === 0 || diagnosticPackages.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save defaults
          </button>
        </form>
      )}

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
            <h2 className="text-sm font-semibold text-zinc-900">Questionnaire category completion (backfill)</h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
              Recomputes per-category progress for every assessment instance so{" "}
              <code className="bg-zinc-100 px-1 rounded">GET /assessments/&#123;assessment_instance_id&#125;/status</code>{" "}
              is accurate for existing participants. For each package category, a category is marked complete when all
              visible required questions have answers (saved drafts or profile prefill). Optional and hidden questions
              are ignored. New saves already update this automatically; use this once to fix historical data. Processes{" "}
              <span className="text-zinc-700">one assessment instance per request</span> so large databases do not time
              out.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshCategoryProgressStats()}
            disabled={categoryProgressStatsLoading || isCategoryProgressRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {categoryProgressStatsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh count
          </button>
        </div>

        {categoryProgressStatsError ? (
          <p className="text-sm text-red-600" role="alert">
            {categoryProgressStatsError}
          </p>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Assessment instances</p>
            <p className="text-lg font-semibold text-zinc-900 mt-0.5 tabular-nums">
              {categoryProgressStatsLoading
                ? "…"
                : formatCount(categoryProgressStats?.assessment_instances_total)}
            </p>
          </div>
          {categoryProgressPhase !== "idle" ? (
            <>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Marked complete</p>
                <p className="text-lg font-semibold text-zinc-900 mt-0.5 tabular-nums">
                  {formatCount(categoryProgressTotals.marked_complete)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Marked incomplete</p>
                <p className="text-lg font-semibold text-zinc-900 mt-0.5 tabular-nums">
                  {formatCount(categoryProgressTotals.marked_incomplete)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Unchanged</p>
                <p className="text-lg font-semibold text-zinc-900 mt-0.5 tabular-nums">
                  {formatCount(categoryProgressTotals.unchanged)}
                </p>
              </div>
            </>
          ) : null}
        </div>

        {(isCategoryProgressRunning ||
          categoryProgressPhase === "paused" ||
          categoryProgressPhase === "completed" ||
          categoryProgressPhase === "error") &&
        categoryProgressProcessed > 0 ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-600">
              <span>
                {formatCount(categoryProgressProcessed)} / {formatCount(categoryProgressTotal)} instances
              </span>
              <span>
                {categoryProgressPct}%{" "}
                {lastProcessedInstanceId != null ? `(last #${lastProcessedInstanceId})` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full bg-zinc-900 transition-all duration-300 ease-out"
                style={{ width: `${categoryProgressPct}%` }}
              />
            </div>
            <p className="text-xs text-zinc-600">
              Categories checked: {formatCount(categoryProgressTotals.categories_synced)}
            </p>
          </div>
        ) : null}

        {categoryProgressPhase === "completed" ? (
          <p className="text-sm text-emerald-700">Backfill finished.</p>
        ) : null}
        {categoryProgressPhase === "paused" ? (
          <p className="text-sm text-amber-700">
            Paused. Resume to continue from instance {formatCount(categoryProgressOffset + 1)} of{" "}
            {formatCount(categoryProgressTotal)}.
          </p>
        ) : null}
        {categoryProgressError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-red-600" role="alert">
              {categoryProgressError}
            </p>
            {categoryProgressFailedOffset != null ? (
              <button
                type="button"
                onClick={handleRetryCategoryProgressPage}
                className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900"
              >
                Retry at offset {categoryProgressFailedOffset}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleStartCategoryProgressRefresh}
            disabled={!canStartCategoryProgress || isSyncing || isCategoryProgressRunning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isCategoryProgressRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ClipboardCheck className="w-4 h-4" />
            )}
            Start backfill
          </button>
          <button
            type="button"
            onClick={handlePauseCategoryProgress}
            disabled={!isCategoryProgressRunning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
          <button
            type="button"
            onClick={handleResumeCategoryProgress}
            disabled={categoryProgressPhase !== "paused" && categoryProgressPhase !== "error"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Resume
          </button>
        </div>
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
    </div>
  );
}
