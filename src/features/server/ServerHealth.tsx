import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Server, Loader2, RefreshCw } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import {
  getApiError,
  serverHealthApi,
  type HealthCheck,
  type HealthRun,
  type ServerHealthCurrent,
} from "../../lib/api";
import { VitalMonitors } from "./VitalMonitors";
const REFRESH_MS = 60_000;

function categoryHasIssues(checks: HealthCheck[]): boolean {
  return checks.some((c) => {
    const s = c.status.toUpperCase();
    return s === "WARN" || s === "CRIT";
  });
}

function CategoryAccordion({
  category,
  checks,
  defaultOpen,
}: {
  category: string;
  checks: HealthCheck[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const issueCount = checks.filter((c) => {
    const s = c.status.toUpperCase();
    return s === "WARN" || s === "CRIT";
  }).length;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 bg-zinc-50 border-b border-zinc-100 text-left hover:bg-zinc-100/80 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
            aria-hidden
          />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 truncate">
            {category}
          </h3>
          <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
            {checks.length} check{checks.length === 1 ? "" : "s"}
          </span>
        </div>
        {issueCount > 0 ? (
          <span className="text-[11px] font-medium text-amber-700 shrink-0">
            {issueCount} issue{issueCount === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-emerald-700 shrink-0">All OK</span>
        )}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-4 sm:px-5 py-2.5 font-medium w-28">Status</th>
                <th className="px-4 sm:px-5 py-2.5 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 sm:px-5 py-3 align-top">
                    <CheckStatusBadge status={check.status} />
                  </td>
                  <td className="px-4 sm:px-5 py-3 text-zinc-700">{check.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatRunAt(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function CheckStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border";
  if (normalized === "OK") {
    return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>OK</span>;
  }
  if (normalized === "WARN") {
    return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>WARN</span>;
  }
  if (normalized === "CRIT") {
    return <span className={`${base} bg-red-50 text-red-700 border-red-200`}>CRIT</span>;
  }
  return <span className={`${base} bg-zinc-50 text-zinc-700 border-zinc-200`}>{status}</span>;
}

function OverallStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border";
  if (normalized === "HEALTHY") {
    return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>Healthy</span>;
  }
  if (normalized === "WARNING") {
    return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>Warning</span>;
  }
  if (normalized === "CRITICAL") {
    return <span className={`${base} bg-red-50 text-red-700 border-red-200`}>Critical</span>;
  }
  return <span className={`${base} bg-zinc-50 text-zinc-700 border-zinc-200`}>{status}</span>;
}

function StatusBannerWithCounts({ run }: { run: HealthRun }) {
  const normalized = run.overall_status.toUpperCase();
  const styles: Record<string, string> = {
    HEALTHY: "bg-emerald-50 border-emerald-200 text-emerald-800",
    WARNING: "bg-amber-50 border-amber-200 text-amber-900",
    CRITICAL: "bg-red-50 border-red-200 text-red-800",
  };
  const dotStyles: Record<string, string> = {
    HEALTHY: "bg-emerald-500",
    WARNING: "bg-amber-500",
    CRITICAL: "bg-red-500",
  };

  return (
    <div
      className={`rounded-xl border px-4 py-4 sm:px-5 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${styles[normalized] ?? "bg-zinc-50 border-zinc-200 text-zinc-800"}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`w-3 h-3 rounded-full shrink-0 ${dotStyles[normalized] ?? "bg-zinc-400"}`}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight">
            {normalized === "HEALTHY"
              ? "Healthy"
              : normalized === "WARNING"
                ? "Warning"
                : normalized === "CRITICAL"
                  ? "Critical"
                  : normalized === "UNKNOWN"
                    ? "Unknown"
                    : run.overall_status}
          </p>
          <p className="text-sm opacity-80 mt-0.5">Last check: {formatRunAt(run.run_at)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm font-medium tabular-nums">
        <span className="text-emerald-700">{run.ok_count} OK</span>
        <span className="text-amber-700">{run.warn_count} WARN</span>
        <span className="text-red-700">{run.crit_count} CRIT</span>
      </div>
    </div>
  );
}

export function ServerHealth() {
  const { employeeRole } = useAuth();
  const [current, setCurrent] = useState<ServerHealthCurrent | null>(null);
  const [history, setHistory] = useState<HealthRun[]>([]);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const fetchCurrent = useCallback(async (silent = false) => {
    if (!silent) setLoadingCurrent(true);
    try {
      const res = await serverHealthApi.current();
      setCurrent(res.data.data);
      setError(null);
      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(getApiError(err));
    } finally {
      if (!silent) setLoadingCurrent(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await serverHealthApi.history({ limit: 50 });
      setHistory(res.data.data);
      setError(null);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const refreshAll = useCallback(async (silent = false) => {
    await Promise.all([fetchCurrent(silent), fetchHistory()]);
  }, [fetchCurrent, fetchHistory]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchCurrent(true);
    }, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [fetchCurrent]);

  const historyColumns = useMemo<Column<HealthRun>[]>(
    () => [
      {
        key: "run_at",
        label: "Run at",
        sortable: true,
        render: (row) => <span className="text-zinc-700">{formatRunAt(row.run_at)}</span>,
      },
      {
        key: "overall_status",
        label: "Status",
        sortable: true,
        render: (row) => <OverallStatusBadge status={row.overall_status} />,
      },
      {
        key: "ok_count",
        label: "OK",
        sortable: true,
        className: "text-emerald-700 font-medium tabular-nums",
      },
      {
        key: "warn_count",
        label: "WARN",
        sortable: true,
        className: "text-amber-700 font-medium tabular-nums",
      },
      {
        key: "crit_count",
        label: "CRIT",
        sortable: true,
        className: "text-red-700 font-medium tabular-nums",
      },
      {
        key: "cpu_pct",
        label: "CPU %",
        sortable: true,
        hideOnMobile: true,
        render: (row) => (
          <span className="tabular-nums text-zinc-700">
            {row.cpu_pct == null ? "—" : `${Math.round(row.cpu_pct)}%`}
          </span>
        ),
      },
      {
        key: "mem_pct",
        label: "Mem %",
        sortable: true,
        hideOnMobile: true,
        render: (row) => (
          <span className="tabular-nums text-zinc-700">
            {row.mem_pct == null ? "—" : `${Math.round(row.mem_pct)}%`}
          </span>
        ),
      },
      {
        key: "storage_pct",
        label: "Disk %",
        sortable: true,
        hideOnMobile: true,
        render: (row) => (
          <span className="tabular-nums text-zinc-700">
            {row.storage_pct == null ? "—" : `${Math.round(row.storage_pct)}%`}
          </span>
        ),
      },
    ],
    []
  );

  if (employeeRole !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-5 h-5 text-zinc-400" />
            <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Server</h1>
          </div>
          <p className="text-sm text-zinc-500">
            Production server health checks (refreshes every 60 seconds).
            {lastRefreshedAt ? ` Last updated ${lastRefreshedAt.toLocaleTimeString()}.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={loadingCurrent || loadingHistory}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
        >
          {loadingCurrent || loadingHistory ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loadingCurrent ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="h-16 bg-zinc-100 rounded-lg animate-pulse" />
        </div>
      ) : current?.run ? (
        <StatusBannerWithCounts run={current.run} />
      ) : !error ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          No health check runs recorded yet.
        </div>
      ) : null}

      <VitalMonitors history={history} loading={loadingHistory} />

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-900">Current checks</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Latest run, grouped by category</p>
        </div>

        {loadingCurrent ? (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-zinc-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !current?.checks_by_category?.length ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">No checks available.</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {current.checks_by_category.map((group) => (
              <CategoryAccordion
                key={group.category}
                category={group.category}
                checks={group.checks}
                defaultOpen={categoryHasIssues(group.checks)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-900">History</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Recent runs (last 50)</p>
        </div>
        {loadingHistory ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <DataTable
            columns={historyColumns}
            data={history}
            keyExtractor={(row) => row.id}
            firstColumnClickableView={false}
          />
        )}
      </div>
    </div>
  );
}
