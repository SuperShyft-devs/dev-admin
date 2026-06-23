import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Loader2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { integrationSyncLogsApi, getApiError, type IntegrationSyncLog } from "../../lib/api";

type TimePreset = "" | "1h" | "24h" | "7d" | "30d";
type PayloadTab = "request" | "response" | "error";
type SyncLogsVariant = "metsights" | "n8n";

const STATUS_OPTIONS = ["pending", "success", "failed", "skipped"] as const;
const TIME_PRESETS: { key: TimePreset; label: string }[] = [
  { key: "1h", label: "Last 1h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "", label: "All time" },
];

function formatDateTime(val?: string | null) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString();
  } catch {
    return val;
  }
}

function StatusBadge({ status }: { status?: string | null }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border";
  if (status === "success") return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>success</span>;
  if (status === "failed") return <span className={`${base} bg-red-50 text-red-700 border-red-200`}>failed</span>;
  if (status === "pending") return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>pending</span>;
  if (status === "skipped") return <span className={`${base} bg-zinc-100 text-zinc-600 border-zinc-300`}>skipped</span>;
  return <span className={`${base} bg-zinc-50 text-zinc-600 border-zinc-200`}>{status ?? "—"}</span>;
}

function inferOperation(log: IntegrationSyncLog): "push" | "pull" | "unknown" {
  const response = log.response_payload;
  if (response && typeof response === "object" && !Array.isArray(response) && "imported" in response) {
    return "pull";
  }
  const request = log.request_payload;
  if (request && typeof request === "object" && !Array.isArray(request) && Object.keys(request).length > 0) {
    return "push";
  }
  return "unknown";
}

function parseCategoryFromUrl(url: string): string {
  const match = url.match(/\/records\/[^/]+\/([^/]+)\/?$/);
  return match?.[1] ?? "—";
}

function parseWebhookFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    const segments = pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "—";
  } catch {
    const trimmed = url.replace(/\/+$/g, "");
    const segments = trimmed.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "—";
  }
}

function parseNotificationId(log: IntegrationSyncLog): string {
  const payload = log.request_payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "notification_id" in payload) {
    const id = payload.notification_id;
    return id == null ? "—" : String(id);
  }
  return "—";
}

function getTimeRange(preset: TimePreset): { from?: string; to?: string } {
  if (!preset) return {};
  const now = new Date();
  const from = new Date(now);
  if (preset === "1h") from.setHours(from.getHours() - 1);
  if (preset === "24h") from.setDate(from.getDate() - 1);
  if (preset === "7d") from.setDate(from.getDate() - 7);
  if (preset === "30d") from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: now.toISOString() };
}

function PayloadPanel({
  tab,
  log,
}: {
  tab: PayloadTab;
  log: IntegrationSyncLog;
}) {
  const copyText = useMemo(() => {
    if (tab === "error") return log.error_message ?? "";
    const payload = tab === "request" ? log.request_payload : log.response_payload;
    if (payload == null) return "";
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }, [tab, log]);

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      // ignore
    }
  };

  if (tab === "error") {
    if (!log.error_message) {
      return <p className="text-sm text-zinc-500 py-2">No error message.</p>;
    }
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 bg-white text-xs text-zinc-600 hover:bg-zinc-50"
        >
          <Copy className="w-3 h-3" /> Copy
        </button>
        <pre className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap">
          {log.error_message}
        </pre>
      </div>
    );
  }

  const payload = tab === "request" ? log.request_payload : log.response_payload;
  if (payload == null || (typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0)) {
    return <p className="text-sm text-zinc-500 py-2">No {tab} payload.</p>;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 bg-white text-xs text-zinc-600 hover:bg-zinc-50"
      >
        <Copy className="w-3 h-3" /> Copy
      </button>
      <pre className="text-xs font-mono text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg p-3 max-h-48 overflow-auto">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}

export function IntegrationSyncLogsModal({
  open,
  onClose,
  variant = "metsights",
}: {
  open: boolean;
  onClose: () => void;
  variant?: SyncLogsVariant;
}) {
  const isN8n = variant === "n8n";
  const defaultProvider = isN8n ? "n8n" : "metsights";
  const modalTitle = isN8n ? "Notification Sync Logs" : "Integration Sync Logs";
  const columnCount = isN8n ? 5 : 7;

  const [logs, setLogs] = useState<IntegrationSyncLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [timePreset, setTimePreset] = useState<TimePreset>("1h");
  const [provider, setProvider] = useState(defaultProvider);
  const [userIdFilter, setUserIdFilter] = useState("");
  const [engagementIdFilter, setEngagementIdFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [payloadTab, setPayloadTab] = useState<PayloadTab>("request");

  useEffect(() => {
    if (open) {
      setProvider(defaultProvider);
      setPage(1);
      setStatusFilters([]);
      setTimePreset("1h");
      setUserIdFilter("");
      setEngagementIdFilter("");
      setExpandedId(null);
    }
  }, [open, defaultProvider]);

  const listParams = useMemo(() => {
    const range = getTimeRange(timePreset);
    const userId = userIdFilter.trim() ? Number(userIdFilter) : undefined;
    const engagementId = engagementIdFilter.trim() ? Number(engagementIdFilter) : undefined;
    return {
      page,
      limit,
      provider: isN8n ? "n8n" : provider || undefined,
      status: statusFilters.length ? statusFilters.join(",") : undefined,
      user_id: !isN8n && Number.isFinite(userId) && userId! > 0 ? userId : undefined,
      engagement_id: !isN8n && Number.isFinite(engagementId) && engagementId! > 0 ? engagementId : undefined,
      ...range,
    };
  }, [page, limit, provider, statusFilters, timePreset, userIdFilter, engagementIdFilter, isN8n]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await integrationSyncLogsApi.list(listParams);
      setLogs(res.data.data ?? []);
      setTotal(res.data.meta?.total ?? 0);
    } catch (err) {
      setError(getApiError(err));
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [listParams]);

  useEffect(() => {
    if (open) {
      void fetchLogs();
    }
  }, [open, fetchLogs]);

  const toggleStatus = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} maxWidthClassName="max-w-5xl">
      <div className="space-y-4 max-h-[75vh] flex flex-col">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-zinc-500 mr-1">Status</span>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilters.includes(status)
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {status}
            </button>
          ))}
          {statusFilters.length > 0 && (
            <button
              type="button"
              onClick={() => { setStatusFilters([]); setPage(1); }}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {TIME_PRESETS.map((preset) => (
            <button
              key={preset.key || "all"}
              type="button"
              onClick={() => { setTimePreset(preset.key); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                timePreset === preset.key
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {preset.label}
            </button>
          ))}
          {!isN8n && (
            <>
              <select
                value={provider}
                onChange={(e) => { setProvider(e.target.value); setPage(1); }}
                className="px-2 py-1 rounded-lg border border-zinc-300 text-xs bg-white"
              >
                <option value="metsights">metsights</option>
                <option value="">All providers</option>
              </select>
              <input
                type="number"
                placeholder="User ID"
                value={userIdFilter}
                onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
                className="w-24 px-2 py-1 rounded-lg border border-zinc-300 text-xs"
              />
              <input
                type="number"
                placeholder="Engagement ID"
                value={engagementIdFilter}
                onChange={(e) => { setEngagementIdFilter(e.target.value); setPage(1); }}
                className="w-32 px-2 py-1 rounded-lg border border-zinc-300 text-xs"
              />
            </>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        <div className="flex-1 min-h-0 overflow-auto border border-zinc-200 rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-12">No sync logs found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 sticky top-0">
                <tr className="text-left text-xs text-zinc-500">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Status</th>
                  {isN8n ? (
                    <>
                      <th className="px-3 py-2">Webhook</th>
                      <th className="px-3 py-2">Notification ID</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2">Op</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Engagement</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {logs.map((log) => {
                  const expanded = expandedId === log.sync_log_id;
                  const op = inferOperation(log);
                  return (
                    <Fragment key={log.sync_log_id}>
                      <tr
                        className="hover:bg-zinc-50 cursor-pointer"
                        onClick={() => {
                          setExpandedId(expanded ? null : log.sync_log_id);
                          setPayloadTab("request");
                        }}
                      >
                        <td className="px-3 py-2">
                          <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{formatDateTime(log.created_at)}</td>
                        <td className="px-3 py-2"><StatusBadge status={log.status} /></td>
                        {isN8n ? (
                          <>
                            <td className="px-3 py-2 font-mono text-xs">{parseWebhookFromUrl(log.api_endpoint_url)}</td>
                            <td className="px-3 py-2 text-xs">{parseNotificationId(log)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2">
                              <span className={`text-xs font-medium ${op === "push" ? "text-blue-700" : op === "pull" ? "text-violet-700" : "text-zinc-500"}`}>
                                {op}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{parseCategoryFromUrl(log.api_endpoint_url)}</td>
                            <td className="px-3 py-2 text-xs">{log.user_id ?? "—"}</td>
                            <td className="px-3 py-2 text-xs">{log.engagement_id ?? "—"}</td>
                          </>
                        )}
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={columnCount} className="px-3 py-3 bg-zinc-50">
                            <div className="flex gap-2 mb-2">
                              {(["request", "response", "error"] as PayloadTab[]).map((tab) => (
                                <button
                                  key={tab}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setPayloadTab(tab); }}
                                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize ${
                                    payloadTab === tab
                                      ? "bg-zinc-900 text-white"
                                      : "bg-white border border-zinc-300 text-zinc-600"
                                  }`}
                                >
                                  {tab}
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-zinc-500 mb-2 font-mono break-all">{log.api_endpoint_url}</p>
                            <PayloadPanel tab={payloadTab} log={log} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-zinc-500">{total} log{total !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-xs text-zinc-600">Page {page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
