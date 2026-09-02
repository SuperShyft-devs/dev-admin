import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Loader2, X, ScrollText, Search, Trash2 } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { UserSearchPicker } from "../../shared/ui/UserSearchPicker";
import { EngagementSearchPicker } from "../../shared/ui/EngagementSearchPicker";
import { IntegrationSyncLogsModal } from "../assessments/IntegrationSyncLogsModal";
import {
  notificationsApi,
  notificationEventsApi,
  engagementTypesApi,
  type NotificationItem,
  type NotificationRecipient,
  type NotificationServiceItem,
  type NotificationEventItem,
  type EngagementTypeItem,
  getApiError,
} from "../../lib/api";

type TabKey = "notifications" | "services" | "events";
const TAB_KEYS: TabKey[] = ["notifications", "services", "events"];

const STATUS_OPTIONS = ["pending", "sent", "failed"];
const CHANNEL_OPTIONS = ["email", "whatsapp"];
const FILTER_DEBOUNCE_MS = 300;

type TimePreset = "" | "1h" | "24h" | "7d" | "30d" | "custom";

const DEFAULT_TIME_PRESET: TimePreset = "1h";

const TIME_PRESETS: { key: TimePreset; label: string }[] = [
  { key: "", label: "All time" },
  { key: "1h", label: "Last 1h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "custom", label: "Custom" },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? "bg-zinc-50 text-zinc-700 border-zinc-200"}`}
    >
      {status}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-zinc-50 text-zinc-500 border-zinc-200">
      Inactive
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const colors: Record<string, string> = {
    email: "bg-blue-50 text-blue-700 border-blue-200",
    whatsapp: "bg-green-50 text-green-700 border-green-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[channel] ?? "bg-zinc-50 text-zinc-700 border-zinc-200"}`}
    >
      {channel}
    </span>
  );
}

function formatDateTime(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString();
  } catch {
    return val;
  }
}

function localDatetimeToIso(val: string): string | undefined {
  if (!val.trim()) return undefined;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function getDispatchedRange(
  preset: TimePreset,
  customFrom: string,
  customTo: string
): { dispatched_from?: string; dispatched_to?: string } {
  if (preset === "custom") {
    return {
      dispatched_from: localDatetimeToIso(customFrom),
      dispatched_to: localDatetimeToIso(customTo),
    };
  }
  if (!preset) return {};
  const now = new Date();
  const to = now.toISOString();
  const hours: Record<string, number> = { "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
  const h = hours[preset];
  if (!h) return {};
  const from = new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
  return { dispatched_from: from, dispatched_to: to };
}

function recipientDisplayName(r: NotificationRecipient): string {
  const first = (r.first_name ?? "").trim();
  const last = (r.last_name ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || `User #${r.user_id}`;
}

function formatRecipientsCell(row: NotificationItem): { text: string; title: string } {
  const recipients = row.recipients ?? [];
  if (recipients.length > 0) {
    const names = recipients.map(recipientDisplayName);
    return { text: names.join(", "), title: names.join(", ") };
  }
  const ids = row.user?.user_ids ?? [];
  if (!ids.length) return { text: "—", title: "" };
  const text = ids.map((id) => `User #${id}`).join(", ");
  return { text, title: text };
}

function formatEngagementCell(row: NotificationItem): string {
  if (row.engagement_id == null) return "—";
  const name = (row.engagement_name ?? row.engagement_code ?? "").trim();
  return name || `Engagement #${row.engagement_id}`;
}

function filterChipClass(active: boolean): string {
  return `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
    active
      ? "bg-zinc-900 text-white border-zinc-900"
      : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400"
  }`;
}

// ── Notifications Tab ──────────────────────────────────────────────────

function NotificationsTab() {
  const [data, setData] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [timePreset, setTimePreset] = useState<TimePreset>(DEFAULT_TIME_PRESET);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [serviceKeyFilter, setServiceKeyFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState(0);
  const [engagementIdFilter, setEngagementIdFilter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [debouncedStatusFilters, setDebouncedStatusFilters] = useState<string[]>([]);
  const [debouncedTimePreset, setDebouncedTimePreset] = useState<TimePreset>(DEFAULT_TIME_PRESET);
  const [debouncedCustomFrom, setDebouncedCustomFrom] = useState("");
  const [debouncedCustomTo, setDebouncedCustomTo] = useState("");
  const [debouncedServiceKey, setDebouncedServiceKey] = useState("");
  const [debouncedChannel, setDebouncedChannel] = useState("");
  const [debouncedUserId, setDebouncedUserId] = useState(0);
  const [debouncedEngagementId, setDebouncedEngagementId] = useState(0);

  const [services, setServices] = useState<NotificationServiceItem[]>([]);

  useEffect(() => {
    notificationsApi.listServices().then((r) => setServices(r.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedStatusFilters(statusFilters);
      setDebouncedTimePreset(timePreset);
      setDebouncedCustomFrom(customFrom);
      setDebouncedCustomTo(customTo);
      setDebouncedServiceKey(serviceKeyFilter);
      setDebouncedChannel(channelFilter);
      setDebouncedUserId(userIdFilter);
      setDebouncedEngagementId(engagementIdFilter);
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    statusFilters,
    timePreset,
    customFrom,
    customTo,
    serviceKeyFilter,
    channelFilter,
    userIdFilter,
    engagementIdFilter,
  ]);

  const listQueryParams = useMemo(() => {
    const range = getDispatchedRange(debouncedTimePreset, debouncedCustomFrom, debouncedCustomTo);
    return {
      page,
      limit,
      status: debouncedStatusFilters.length
        ? debouncedStatusFilters.join(",")
        : undefined,
      service_key: debouncedServiceKey || undefined,
      channel: debouncedChannel || undefined,
      user_id: debouncedUserId > 0 ? debouncedUserId : undefined,
      engagement_id: debouncedEngagementId > 0 ? debouncedEngagementId : undefined,
      ...range,
    };
  }, [
    page,
    limit,
    debouncedStatusFilters,
    debouncedServiceKey,
    debouncedChannel,
    debouncedUserId,
    debouncedEngagementId,
    debouncedTimePreset,
    debouncedCustomFrom,
    debouncedCustomTo,
  ]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationsApi.list(listQueryParams);
      setData(res.data.data);
      setTotal(res.data.meta.total);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [listQueryParams]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const resetPage = () => setPage(1);

  const toggleStatus = (status: string) => {
    setStatusFilters((prev) => {
      if (prev.includes(status)) return prev.filter((s) => s !== status);
      return [...prev, status];
    });
    resetPage();
  };

  const clearAllFilters = () => {
    setStatusFilters([]);
    setTimePreset(DEFAULT_TIME_PRESET);
    setCustomFrom("");
    setCustomTo("");
    setServiceKeyFilter("");
    setChannelFilter("");
    setUserIdFilter(0);
    setEngagementIdFilter(0);
    resetPage();
  };

  const hasActiveFilters =
    statusFilters.length > 0 ||
    (timePreset !== "" && timePreset !== DEFAULT_TIME_PRESET) ||
    serviceKeyFilter !== "" ||
    channelFilter !== "" ||
    userIdFilter > 0 ||
    engagementIdFilter > 0;

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (statusFilters.length) labels.push(`Status: ${statusFilters.join(", ")}`);
    if (timePreset === "custom") {
      if (customFrom || customTo) labels.push("Custom date range");
    } else if (timePreset && timePreset !== DEFAULT_TIME_PRESET) {
      const presetLabel = TIME_PRESETS.find((p) => p.key === timePreset)?.label;
      if (presetLabel) labels.push(presetLabel);
    }
    if (serviceKeyFilter) {
      const svc = services.find((s) => s.service_key === serviceKeyFilter);
      labels.push(`Service: ${svc?.display_name ?? serviceKeyFilter}`);
    }
    if (channelFilter) labels.push(`Channel: ${channelFilter}`);
    if (userIdFilter > 0) labels.push(`User #${userIdFilter}`);
    if (engagementIdFilter > 0) labels.push(`Engagement #${engagementIdFilter}`);
    return labels;
  }, [
    statusFilters,
    timePreset,
    customFrom,
    customTo,
    serviceKeyFilter,
    channelFilter,
    userIdFilter,
    engagementIdFilter,
    services,
  ]);

  const handleDelete = async (row: NotificationItem) => {
    if (!window.confirm(`Delete notification #${row.notification_id}? This cannot be undone.`)) return;
    try {
      await notificationsApi.delete(row.notification_id);
      setSelectedIds((prev) => {
        if (!prev.has(row.notification_id)) return prev;
        const next = new Set(prev);
        next.delete(row.notification_id);
        return next;
      });
      await fetchList();
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const pageIds = useMemo(() => data.map((r) => r.notification_id), [data]);
  const selectedCount = selectedIds.size;
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someOnPageSelected = pageIds.some((id) => selectedIds.has(id));

  const toggleRowSelection = (notificationId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(notificationId)) next.delete(notificationId);
      else next.add(notificationId);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedCount === 0) return;
    const noun = selectedCount === 1 ? "notification" : "notifications";
    if (!window.confirm(`Delete ${selectedCount} ${noun}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const chunkSize = 500;
      for (let i = 0; i < ids.length; i += chunkSize) {
        await notificationsApi.bulkDelete(ids.slice(i, i + chunkSize));
      }
      setSelectedIds(new Set());
      await fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setBulkDeleting(false);
    }
  };

  const columns: Column<NotificationItem>[] = [
    {
      key: "_select",
      label: (
        <input
          type="checkbox"
          checked={allOnPageSelected}
          ref={(el) => {
            if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
          }}
          onChange={toggleSelectAllOnPage}
          onClick={(e) => e.stopPropagation()}
          disabled={data.length === 0 || bulkDeleting}
          className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          aria-label="Select all notifications on this page"
          title="Select all on this page"
        />
      ),
      sortable: false,
      className: "w-10",
      render: (r) => (
        <input
          type="checkbox"
          checked={selectedIds.has(r.notification_id)}
          onChange={() => toggleRowSelection(r.notification_id)}
          disabled={bulkDeleting}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          aria-label={`Select notification ${r.notification_id}`}
        />
      ),
    },
    { key: "notification_id", label: "ID", sortable: false, className: "w-16" },
    {
      key: "service_display_name",
      label: "Service",
      sortable: false,
      render: (r) => {
        const display = r.service_display_name || r.service_key;
        return (
          <span className="font-medium" title={r.service_key}>
            {display}
          </span>
        );
      },
    },
    {
      key: "channel",
      label: "Channel",
      sortable: false,
      hideOnMobile: true,
      render: (r) => <ChannelBadge channel={r.channel} />,
    },
    {
      key: "status",
      label: "Status",
      sortable: false,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "recipients",
      label: "Recipients",
      sortable: false,
      hideOnMobile: true,
      render: (r) => {
        const { text, title } = formatRecipientsCell(r);
        return (
          <span className="block max-w-[10rem] truncate" title={title || undefined}>
            {text}
          </span>
        );
      },
    },
    {
      key: "engagement_name",
      label: "Engagement",
      sortable: false,
      hideOnTablet: true,
      render: (r) => {
        const label = formatEngagementCell(r);
        const title =
          r.engagement_id != null
            ? [r.engagement_name, r.engagement_code, `#${r.engagement_id}`]
                .filter(Boolean)
                .join(" · ")
            : undefined;
        return (
          <span className="block max-w-[12rem] truncate" title={title}>
            {label}
          </span>
        );
      },
    },
    {
      key: "message",
      label: "Message",
      sortable: false,
      hideOnTablet: true,
      render: (r) => (
        <span className="block max-w-xs truncate" title={r.message ?? ""}>
          {r.message || "—"}
        </span>
      ),
    },
    {
      key: "dispatched_at",
      label: "Dispatched",
      sortable: false,
      hideOnTablet: true,
      render: (r) => <span className="text-xs text-zinc-500">{formatDateTime(r.dispatched_at)}</span>,
    },
    {
      key: "completed_at",
      label: "Completed",
      sortable: false,
      hideOnTablet: true,
      render: (r) => <span className="text-xs text-zinc-500">{formatDateTime(r.completed_at)}</span>,
    },
  ];

  return (
    <>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 w-full sm:w-auto">Status</span>
          <button
            type="button"
            onClick={() => {
              setStatusFilters([]);
              resetPage();
            }}
            className={filterChipClass(statusFilters.length === 0)}
          >
            All
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={filterChipClass(statusFilters.includes(s))}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 w-full sm:w-auto">Dispatched</span>
          {TIME_PRESETS.map((p) => (
            <button
              key={p.key || "all"}
              type="button"
              onClick={() => {
                setTimePreset(p.key);
                resetPage();
              }}
              className={filterChipClass(timePreset === p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {timePreset === "custom" && (
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <label className="block">
              <span className="text-xs text-zinc-500">From</span>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  resetPage();
                }}
                className="mt-1 block px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">To</span>
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  resetPage();
                }}
                className="mt-1 block px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-end">
          <label className="block">
            <span className="text-xs text-zinc-500">Service</span>
            <select
              value={serviceKeyFilter}
              onChange={(e) => {
                setServiceKeyFilter(e.target.value);
                resetPage();
              }}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s.service_key} value={s.service_key}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">Channel</span>
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                resetPage();
              }}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="">All channels</option>
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <UserSearchPicker
            value={userIdFilter}
            onChange={(id) => {
              setUserIdFilter(id);
              resetPage();
            }}
            label="User"
            className="min-w-0"
          />
          <div className="flex items-end gap-2 min-w-0">
            <EngagementSearchPicker
              value={engagementIdFilter}
              onChange={(id) => {
                setEngagementIdFilter(id);
                resetPage();
              }}
              label="Engagement"
              className="min-w-0 flex-1"
            />
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={bulkDeleting || loading}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {bulkDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete ({selectedCount})
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <X className="w-4 h-4" />
              Clear filters
            </button>
          )}
        </div>

        {activeFilterLabels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilterLabels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-zinc-100 text-zinc-700 border border-zinc-200"
              >
                {label}
              </span>
            ))}
          </div>
        )}
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
            keyExtractor={(r) => r.notification_id}
            onDelete={handleDelete}
            firstColumnClickableView={false}
            pagination={{ page, limit, total, onPageChange: setPage }}
          />
        )}
      </div>
    </>
  );
}

// ── Services Tab ───────────────────────────────────────────────────────

interface ServiceFormData {
  service_key: string;
  display_name: string;
  channel: string;
  webhook_path: string;
  is_active: boolean;
  require_blood_report_url: boolean;
  require_bio_ai_report_url: boolean;
  require_participant_detail: boolean;
  require_otp: boolean;
  require_session_details: boolean;
  require_external_link: boolean;
}

const EMPTY_SERVICE_FORM: ServiceFormData = {
  service_key: "",
  display_name: "",
  channel: "email",
  webhook_path: "",
  is_active: true,
  require_blood_report_url: false,
  require_bio_ai_report_url: false,
  require_participant_detail: false,
  require_otp: false,
  require_session_details: false,
  require_external_link: false,
};

type ServiceChannelFilter = "" | "email" | "whatsapp";
type ServiceStatusFilter = "" | "active" | "inactive";
type ServiceRequirementsFilter = "" | "any";

function getServiceRequirementLabels(row: NotificationServiceItem): string[] {
  const labels: string[] = [];
  if (row.require_blood_report_url) labels.push("Blood report");
  if (row.require_bio_ai_report_url) labels.push("BioAI report");
  if (row.require_participant_detail) labels.push("Participant");
  if (row.require_session_details) labels.push("Session");
  if (row.require_external_link) labels.push("External link");
  if (row.require_otp) labels.push("OTP");
  return labels;
}

function ServiceRequirementsCell({ row }: { row: NotificationServiceItem }) {
  const labels = getServiceRequirementLabels(row);
  if (labels.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-xs">
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-violet-50 text-violet-700 border-violet-200"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function ServiceNameCell({ row }: { row: NotificationServiceItem }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-zinc-900 truncate">{row.display_name}</div>
      <div className="text-xs text-zinc-500 truncate" title={row.service_key}>
        {row.service_key}
      </div>
    </div>
  );
}

function ServicesTab() {
  const [data, setData] = useState<NotificationServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<ServiceChannelFilter>("");
  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>("");
  const [requirementsFilter, setRequirementsFilter] = useState<ServiceRequirementsFilter>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(EMPTY_SERVICE_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationsApi.listServices();
      setData(res.data.data);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return data.filter((row) => {
      if (query) {
        const haystack = `${row.display_name} ${row.service_key} ${row.webhook_path}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (channelFilter && row.channel !== channelFilter) return false;
      if (statusFilter === "active" && !row.is_active) return false;
      if (statusFilter === "inactive" && row.is_active) return false;
      if (requirementsFilter === "any" && getServiceRequirementLabels(row).length === 0) return false;
      return true;
    });
  }, [channelFilter, data, requirementsFilter, searchQuery, statusFilter]);

  const editingRow = useMemo(
    () => (editingId != null ? data.find((row) => row.notification_service_id === editingId) ?? null : null),
    [data, editingId]
  );

  const openAdd = () => {
    setFormData(EMPTY_SERVICE_FORM);
    setEditingId(null);
    setModalMode("add");
    setModalOpen(true);
    setError(null);
  };

  const openEdit = (row: NotificationServiceItem) => {
    setFormData({
      service_key: row.service_key,
      display_name: row.display_name,
      channel: row.channel,
      webhook_path: row.webhook_path,
      is_active: row.is_active,
      require_blood_report_url: row.require_blood_report_url,
      require_bio_ai_report_url: row.require_bio_ai_report_url,
      require_participant_detail: row.require_participant_detail,
      require_otp: row.require_otp,
      require_session_details: row.require_session_details,
      require_external_link: row.require_external_link,
    });
    setEditingId(row.notification_service_id);
    setModalMode("edit");
    setModalOpen(true);
    setError(null);
  };

  const handleDelete = async (row: NotificationServiceItem) => {
    if (
      !window.confirm(
        `Delete service "${row.display_name}" (${row.service_key})? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await notificationsApi.deleteService(row.notification_service_id);
      await fetchList();
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (modalMode === "add") {
        await notificationsApi.createService(formData);
      } else if (editingId !== null) {
        await notificationsApi.updateService(editingId, {
          display_name: formData.display_name,
          channel: formData.channel,
          webhook_path: formData.webhook_path,
          is_active: formData.is_active,
          require_blood_report_url: formData.require_blood_report_url,
          require_bio_ai_report_url: formData.require_bio_ai_report_url,
          require_participant_detail: formData.require_participant_detail,
          require_otp: formData.require_otp,
          require_session_details: formData.require_session_details,
          require_external_link: formData.require_external_link,
        });
      }
      setModalOpen(false);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<NotificationServiceItem>[] = [
    {
      key: "display_name",
      label: "Service",
      sortable: false,
      render: (r) => <ServiceNameCell row={r} />,
    },
    {
      key: "channel",
      label: "Channel",
      sortable: false,
      render: (r) => <ChannelBadge channel={r.channel} />,
    },
    {
      key: "is_active",
      label: "Status",
      sortable: false,
      render: (r) => <ActiveBadge active={r.is_active} />,
    },
    {
      key: "requirements",
      label: "Requirements",
      sortable: false,
      render: (r) => <ServiceRequirementsCell row={r} />,
    },
  ];

  return (
    <>
      {error && !modalOpen && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center flex-1 min-w-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_OPTIONS.map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() =>
                  setChannelFilter((prev) => (prev === channel ? "" : (channel as ServiceChannelFilter)))
                }
                className={filterChipClass(channelFilter === channel)}
              >
                {channel.charAt(0).toUpperCase() + channel.slice(1)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === "active" ? "" : "active"))}
              className={filterChipClass(statusFilter === "active")}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === "inactive" ? "" : "inactive"))}
              className={filterChipClass(statusFilter === "inactive")}
            >
              Inactive
            </button>
            <button
              type="button"
              onClick={() => setRequirementsFilter((prev) => (prev === "any" ? "" : "any"))}
              className={filterChipClass(requirementsFilter === "any")}
            >
              Has requirements
            </button>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Service
        </button>
      </div>

      {!loading && data.length > 0 ? (
        <p className="mb-3 text-xs text-zinc-500">
          Showing {filteredData.length} of {data.length} service{data.length === 1 ? "" : "s"}
        </p>
      ) : null}

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="py-12 px-6 text-center text-sm text-zinc-500">
            {data.length === 0
              ? "No notification services configured yet."
              : "No services match your search or filters."}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredData}
            keyExtractor={(r) => r.notification_service_id}
            onView={openEdit}
            onEdit={openEdit}
            onDelete={handleDelete}
            firstColumnClickableView
          />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setError(null); }}
        title={modalMode === "add" ? "Add Notification Service" : "Edit Notification Service"}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="space-y-4"
        >
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Service Key</label>
            <input
              type="text"
              value={formData.service_key}
              onChange={(e) => setFormData({ ...formData, service_key: e.target.value })}
              disabled={modalMode === "edit"}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
              placeholder="e.g. reports_email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              placeholder="e.g. Send Reports Email"
              required
            />
          </div>

          <div className="rounded-lg border border-zinc-200 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-800">Delivery</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                How this service sends notifications through n8n.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Channel</label>
              <select
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                {CHANNEL_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Webhook Path</label>
              <input
                type="text"
                value={formData.webhook_path}
                onChange={(e) => setFormData({ ...formData, webhook_path: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="/webhook/send-reports-email"
                required
              />
              <p className="mt-1 text-xs text-zinc-500">
                Only enter the path. The BASE_URL will be auto-picked from server configuration.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="text-sm text-zinc-700">Active</span>
            </label>
          </div>

          <div className="rounded-lg border border-zinc-200 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-800">Required payload</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Data the admin UI must collect before dispatching this service.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.require_blood_report_url}
                  onChange={(e) => setFormData({ ...formData, require_blood_report_url: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-sm text-zinc-700">Blood report URL</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.require_bio_ai_report_url}
                  onChange={(e) => setFormData({ ...formData, require_bio_ai_report_url: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-sm text-zinc-700">BioAI report URL</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.require_participant_detail}
                  onChange={(e) => setFormData({ ...formData, require_participant_detail: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-sm text-zinc-700">Participant detail</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.require_session_details}
                  onChange={(e) => setFormData({ ...formData, require_session_details: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-sm text-zinc-700">Session details</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.require_external_link}
                  onChange={(e) => setFormData({ ...formData, require_external_link: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-sm text-zinc-700">External link</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">OTP</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="require_otp"
                    checked={formData.require_otp === true}
                    onChange={() => setFormData({ ...formData, require_otp: true })}
                    className="w-4 h-4 border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span className="text-sm text-zinc-700">Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="require_otp"
                    checked={formData.require_otp === false}
                    onChange={() => setFormData({ ...formData, require_otp: false })}
                    className="w-4 h-4 border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span className="text-sm text-zinc-700">Not required</span>
                </label>
              </div>
            </div>
          </div>

          {modalMode === "edit" && editingRow ? (
            <p className="text-xs text-zinc-500">
              Created {formatDateTime(editingRow.created_at)}
            </p>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : modalMode === "add" ? "Create Service" : "Update Service"}
            </button>
            <button
              type="button"
              onClick={() => { setModalOpen(false); setError(null); }}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Events Tab ────────────────────────────────────────────────────────

interface EventFormData {
  event_code: string;
  display_name: string;
  description: string;
  engagement_type_ids: number[];
}

const EMPTY_EVENT_FORM: EventFormData = {
  event_code: "",
  display_name: "",
  description: "",
  engagement_type_ids: [],
};

function EventsTab() {
  const [data, setData] = useState<NotificationEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<EventFormData>(EMPTY_EVENT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<NotificationEventItem | null>(null);

  const [engagementTypes, setEngagementTypes] = useState<EngagementTypeItem[]>([]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationEventsApi.list();
      setData(res.data.data);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    engagementTypesApi.list().then((r) => setEngagementTypes(r.data.data)).catch(() => {});
  }, []);

  const openAdd = () => {
    setFormData(EMPTY_EVENT_FORM);
    setEditingId(null);
    setModalMode("add");
    setModalOpen(true);
    setError(null);
  };

  const openEdit = (row: NotificationEventItem) => {
    setFormData({
      event_code: row.event_code,
      display_name: row.display_name,
      description: row.description ?? "",
      engagement_type_ids: row.engagement_types.map((et) => et.engagement_type_id),
    });
    setEditingId(row.notification_event_id);
    setModalMode("edit");
    setModalOpen(true);
    setError(null);
  };

  const openDetail = (row: NotificationEventItem) => {
    setDetailItem(row);
    setDetailModalOpen(true);
  };

  const handleDelete = async (row: NotificationEventItem) => {
    if (
      !window.confirm(
        `Delete event "${row.display_name}" (${row.event_code})? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await notificationEventsApi.delete(row.notification_event_id);
      await fetchList();
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (modalMode === "add") {
        await notificationEventsApi.create({
          event_code: formData.event_code,
          display_name: formData.display_name,
          description: formData.description || undefined,
          engagement_type_ids: formData.engagement_type_ids,
        });
      } else if (editingId !== null) {
        await notificationEventsApi.update(editingId, {
          display_name: formData.display_name,
          description: formData.description || undefined,
          engagement_type_ids: formData.engagement_type_ids,
        });
      }
      setModalOpen(false);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEngagementType = (id: number) => {
    setFormData((prev) => ({
      ...prev,
      engagement_type_ids: prev.engagement_type_ids.includes(id)
        ? prev.engagement_type_ids.filter((x) => x !== id)
        : [...prev.engagement_type_ids, id],
    }));
  };

  const columns: Column<NotificationEventItem>[] = [
    { key: "event_code", label: "Event Code", sortable: false },
    { key: "display_name", label: "Display Name", sortable: false },
    {
      key: "engagement_types",
      label: "Engagement Types",
      sortable: false,
      hideOnMobile: true,
      render: (r) =>
        r.engagement_types.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.engagement_types.map((et) => (
              <span
                key={et.engagement_type_id}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200"
              >
                {et.display_name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        ),
    },
    {
      key: "description",
      label: "Description",
      sortable: false,
      hideOnTablet: true,
      render: (r) => (
        <span className="block max-w-xs truncate" title={r.description ?? ""}>
          {r.description || "—"}
        </span>
      ),
    },
  ];

  return (
    <>
      {error && !modalOpen && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="mb-4 flex justify-end">
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          Add Event
        </button>
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
            keyExtractor={(r) => r.notification_event_id}
            onView={openDetail}
            onEdit={openEdit}
            onDelete={handleDelete}
            firstColumnClickableView={false}
          />
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setError(null); }}
        title={modalMode === "add" ? "Add Notification Event" : "Edit Notification Event"}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="space-y-4"
        >
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Event Code</label>
            <input
              type="text"
              value={formData.event_code}
              onChange={(e) => setFormData({ ...formData, event_code: e.target.value })}
              disabled={modalMode === "edit"}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
              placeholder="e.g. report_ready"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              placeholder="e.g. Report Ready"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-[80px]"
              placeholder="Describe the event..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Engagement Types</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {engagementTypes.map((et) => {
                const selected = formData.engagement_type_ids.includes(et.id);
                return (
                  <button
                    key={et.id}
                    type="button"
                    onClick={() => toggleEngagementType(et.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selected
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400"
                    }`}
                  >
                    {et.display_name}
                  </button>
                );
              })}
              {engagementTypes.length === 0 && (
                <span className="text-xs text-zinc-400">No engagement types available</span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : modalMode === "add" ? "Create Event" : "Update Event"}
            </button>
            <button
              type="button"
              onClick={() => { setModalOpen(false); setError(null); }}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal (read-only) */}
      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Event Details"
      >
        {detailItem && (
          <div className="space-y-4">
            <div>
              <span className="block text-xs text-zinc-500 mb-0.5">Event Code</span>
              <span className="text-sm font-medium text-zinc-900">{detailItem.event_code}</span>
            </div>
            <div>
              <span className="block text-xs text-zinc-500 mb-0.5">Display Name</span>
              <span className="text-sm text-zinc-900">{detailItem.display_name}</span>
            </div>
            <div>
              <span className="block text-xs text-zinc-500 mb-0.5">Description</span>
              <span className="text-sm text-zinc-900">{detailItem.description || "—"}</span>
            </div>
            <div>
              <span className="block text-xs text-zinc-500 mb-0.5">Engagement Types</span>
              {detailItem.engagement_types.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {detailItem.engagement_types.map((et) => (
                    <span
                      key={et.engagement_type_id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200"
                    >
                      {et.display_name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-zinc-400">—</span>
              )}
            </div>
            <div>
              <span className="block text-xs text-zinc-500 mb-0.5">Created</span>
              <span className="text-sm text-zinc-900">{formatDateTime(detailItem.created_at)}</span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export function Notifications() {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const [syncLogsOpen, setSyncLogsOpen] = useState(false);
  const activeTab: TabKey = TAB_KEYS.includes((tabParam ?? "") as TabKey)
    ? (tabParam as TabKey)
    : "notifications";

  useEffect(() => {
    if (tabParam !== activeTab) {
      navigate(`/notifications/${activeTab}`, { replace: true });
    }
  }, [activeTab, navigate, tabParam]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900">
          Notifications
        </h1>
        {activeTab === "notifications" && (
          <button
            type="button"
            onClick={() => setSyncLogsOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors shrink-0"
            title="View n8n notification dispatch logs"
          >
            <ScrollText className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Sync Logs</span>
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-5 border-b border-zinc-200">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            onClick={() => navigate(`/notifications/${tab}`)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === tab
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab === "notifications" ? "Notifications" : tab === "services" ? "Services" : "Events"}
          </button>
        ))}
      </div>

      {activeTab === "notifications" && <NotificationsTab />}
      {activeTab === "services" && <ServicesTab />}
      {activeTab === "events" && <EventsTab />}

      <IntegrationSyncLogsModal
        open={syncLogsOpen}
        onClose={() => setSyncLogsOpen(false)}
        variant="n8n"
      />
    </div>
  );
}
