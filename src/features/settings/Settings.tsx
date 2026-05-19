import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { ChevronDown, ChevronUp, Loader2, Pause, Play, RefreshCw, Save, Users } from "lucide-react";
import { DuplicatedUsersModal } from "./DuplicatedUsersModal";
import {
  assessmentPackagesApi,
  diagnosticPackagesApi,
  platformSettingsApi,
  type AssessmentPackage,
  type DiagnosticPackageListItem,
  type MetsightsProfilesImportPageResult,
  type MetsightsProfilesStats,
  getApiError,
} from "../../lib/api";
import { fetchAllPages } from "../../lib/fetchAllPages";

const SYNC_STORAGE_KEY = "metsights-sync-v1";
const METSIGHTS_RATE_LIMIT_RETRY_SEC = 60;
const METSIGHTS_PAGE_GAP_MS = 2_500;
const METSIGHTS_MAX_RETRY_WAIT_SEC = 300;

type SyncPhase = "idle" | "running" | "waiting" | "paused" | "completed" | "error";

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

/** Retry after a cooldown when Metsights or the network may be rate-limiting. */
function shouldAutoRetryMetsightsSyncError(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 401 || status === 403 || status === 404 || status === 422) {
      return false;
    }
    return true;
  }
  return true;
}

function retryWaitSecondsForAttempt(attempt: number, err: unknown): number {
  const cappedAttempt = Math.max(1, attempt);
  let seconds = Math.min(
    Math.round(METSIGHTS_RATE_LIMIT_RETRY_SEC * 1.5 ** (cappedAttempt - 1)),
    METSIGHTS_MAX_RETRY_WAIT_SEC
  );
  if (axios.isAxiosError(err)) {
    const retryAfter = err.response?.headers?.["retry-after"];
    const parsed =
      typeof retryAfter === "string" && /^\d+$/.test(retryAfter.trim())
        ? parseInt(retryAfter.trim(), 10)
        : null;
    if (parsed != null) {
      seconds = Math.max(seconds, Math.min(parsed, METSIGHTS_MAX_RETRY_WAIT_SEC));
    }
  }
  return seconds;
}

async function waitInterruptible(
  totalSeconds: number,
  opts: {
    onTick: (secondsRemaining: number) => void;
    isPaused: () => boolean;
    isAborted: () => boolean;
  }
): Promise<"done" | "paused" | "aborted"> {
  for (let remaining = totalSeconds; remaining > 0; remaining -= 1) {
    opts.onTick(remaining);
    if (opts.isAborted()) {
      return "aborted";
    }
    if (opts.isPaused()) {
      return "paused";
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return "done";
}

async function sleepInterruptible(
  totalMs: number,
  opts: { isPaused: () => boolean; isAborted: () => boolean }
): Promise<boolean> {
  const stepMs = 250;
  let remaining = totalMs;
  while (remaining > 0) {
    if (opts.isAborted() || opts.isPaused()) {
      return false;
    }
    const chunk = Math.min(stepMs, remaining);
    await new Promise((resolve) => setTimeout(resolve, chunk));
    remaining -= chunk;
  }
  return true;
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
  const [retryWaitSeconds, setRetryWaitSeconds] = useState<number | null>(null);
  const [pageRetryAttempt, setPageRetryAttempt] = useState(0);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [activityLog, setActivityLog] = useState<PageLogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [duplicatesModalOpen, setDuplicatesModalOpen] = useState(false);

  const pauseRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const pageFailStreakRef = useRef(0);

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
    if (syncPhase !== "running" && syncPhase !== "paused" && syncPhase !== "waiting") return;
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
    async (startPage: number, opts?: { preserveRetryStreak?: boolean }) => {
      if (runningRef.current) return;
      runningRef.current = true;
      pauseRef.current = false;
      if (!opts?.preserveRetryStreak) {
        pageFailStreakRef.current = 0;
        setPageRetryAttempt(0);
      }
      setSyncError(null);
      if (!opts?.preserveRetryStreak) {
        setFailedPage(null);
      }
      setSyncPhase("running");

      let page = startPage;
      const total = metsightsTotal || msStats?.metsights_total || 0;

      try {
        while (!pauseRef.current) {
          if (abortRef.current?.signal.aborted) break;

          try {
            const res = await platformSettingsApi.importMetsightsProfilesPage({ page });
            const result = res.data.data;
            applyPageResult(result);

            const remoteTotal = result.metsights_total || total;
            const pages = totalPagesFromCount(remoteTotal, result.page_size || pageSizeHint);
            const hasNext = result.metsights_next != null && result.metsights_next !== "";

            pageFailStreakRef.current = 0;
            setPageRetryAttempt(0);
            page += 1;
            setNextPage(page);
            setSyncError(null);
            setRetryWaitSeconds(null);

            if (!hasNext || (pages > 0 && page > pages)) {
              setSyncPhase("completed");
              await refreshMsStats();
              break;
            }

            const paced = await sleepInterruptible(METSIGHTS_PAGE_GAP_MS, {
              isPaused: () => pauseRef.current,
              isAborted: () => Boolean(abortRef.current?.signal.aborted),
            });
            if (!paced) {
              if (abortRef.current?.signal.aborted) {
                return;
              }
              setSyncPhase("paused");
              setSyncError(`Paused before page ${page}. Resume to continue.`);
              await refreshMsStats();
              break;
            }
          } catch (err) {
            if (abortRef.current?.signal.aborted) return;

            if (!shouldAutoRetryMetsightsSyncError(err)) {
              setSyncError(getApiError(err));
              setFailedPage(page);
              setSyncPhase("error");
              break;
            }

            pageFailStreakRef.current += 1;
            const attempt = pageFailStreakRef.current;
            const waitSec = retryWaitSecondsForAttempt(attempt, err);

            setFailedPage(page);
            setPageRetryAttempt(attempt);
            setSyncPhase("waiting");
            setSyncError(
              `Page ${page} failed (attempt ${attempt}). Retrying in ${waitSec}s (Metsights rate limit)…`
            );

            const waitOutcome = await waitInterruptible(waitSec, {
              onTick: setRetryWaitSeconds,
              isPaused: () => pauseRef.current,
              isAborted: () => Boolean(abortRef.current?.signal.aborted),
            });

            setRetryWaitSeconds(null);

            if (waitOutcome === "aborted") {
              return;
            }
            if (waitOutcome === "paused") {
              setSyncPhase("paused");
              setSyncError(`Paused before retrying page ${page}. Resume to continue.`);
              await refreshMsStats();
              break;
            }

            setSyncError(null);
            setSyncPhase("running");
            continue;
          }
        }

        if (pauseRef.current) {
          setSyncPhase("paused");
          await refreshMsStats();
        }
      } finally {
        runningRef.current = false;
        setRetryWaitSeconds(null);
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
    setRetryWaitSeconds(null);
    setPageRetryAttempt(0);
    pageFailStreakRef.current = 0;
    setSyncPhase("idle");
    const total = msStats?.metsights_total ?? 0;
    setMetsightsTotal(total);
    void runSyncLoop(1);
  }

  function handlePause() {
    pauseRef.current = true;
  }

  function handleResume() {
    const resumePage = failedPage ?? nextPage;
    if (syncPhase === "error" || syncPhase === "paused") {
      void runSyncLoop(resumePage, { preserveRetryStreak: syncPhase === "paused" && failedPage != null });
      return;
    }
    void runSyncLoop(nextPage);
  }

  function handleRetryPage() {
    if (failedPage == null) return;
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
    syncPhase !== "running" &&
    syncPhase !== "waiting" &&
    !msStatsLoading &&
    (msStats?.metsights_total ?? 0) > 0 &&
    !msStatsError;
  const isSyncing = syncPhase === "running" || syncPhase === "waiting";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Platform defaults and Metsights profile synchronization.
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
        {syncPhase === "waiting" ? (
          <p className="text-sm text-amber-700" role="status">
            {retryWaitSeconds != null
              ? `Waiting ${retryWaitSeconds}s — retry ${pageRetryAttempt || 1} for page ${failedPage ?? nextPage} (then continues sync)…`
              : syncError}
          </p>
        ) : null}
        {syncError && syncPhase !== "waiting" ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-red-600" role="alert">
              {syncError}
            </p>
            {failedPage != null && syncPhase === "error" ? (
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
    </div>
  );
}
