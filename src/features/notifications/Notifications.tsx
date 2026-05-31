import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Loader2, X } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { UserSearchPicker } from "../../shared/ui/UserSearchPicker";
import { EngagementSearchPicker } from "../../shared/ui/EngagementSearchPicker";
import {
  notificationsApi,
  type NotificationItem,
  type NotificationRecipient,
  type NotificationServiceItem,
  getApiError,
} from "../../lib/api";

type TabKey = "notifications" | "services";
const TAB_KEYS: TabKey[] = ["notifications", "services"];

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
      await fetchList();
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const columns: Column<NotificationItem>[] = [
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
          <EngagementSearchPicker
            value={engagementIdFilter}
            onChange={(id) => {
              setEngagementIdFilter(id);
              resetPage();
            }}
            label="Engagement"
            className="min-w-0"
          />
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
  require_record_id: boolean;
  require_participant_detail: boolean;
  require_otp: boolean;
}

const EMPTY_SERVICE_FORM: ServiceFormData = {
  service_key: "",
  display_name: "",
  channel: "email",
  webhook_path: "",
  is_active: true,
  require_record_id: true,
  require_participant_detail: false,
  require_otp: false,
};

function ServicesTab() {
  const [data, setData] = useState<NotificationServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      require_record_id: row.require_record_id,
      require_participant_detail: row.require_participant_detail,
      require_otp: row.require_otp,
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
          require_record_id: formData.require_record_id,
          require_participant_detail: formData.require_participant_detail,
          require_otp: formData.require_otp,
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
    { key: "service_key", label: "Service Key", sortable: false },
    { key: "display_name", label: "Display Name", sortable: false },
    {
      key: "channel",
      label: "Channel",
      sortable: false,
      render: (r) => <ChannelBadge channel={r.channel} />,
    },
    {
      key: "webhook_path",
      label: "Webhook Path",
      sortable: false,
      hideOnMobile: true,
      render: (r) => <code className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded">{r.webhook_path}</code>,
    },
    {
      key: "is_active",
      label: "Active",
      sortable: false,
      hideOnMobile: true,
      render: (r) => <ActiveBadge active={r.is_active} />,
    },
    {
      key: "require_record_id",
      label: "Requires Record",
      sortable: false,
      hideOnTablet: true,
      render: (r) => (r.require_record_id ? "Yes" : "No"),
    },
    {
      key: "require_participant_detail",
      label: "Requires Participant",
      sortable: false,
      hideOnTablet: true,
      render: (r) => (r.require_participant_detail ? "Yes" : "No"),
    },
    {
      key: "require_otp",
      label: "Requires OTP",
      sortable: false,
      hideOnTablet: true,
      render: (r) => (r.require_otp ? "Yes" : "No"),
    },
    {
      key: "created_at",
      label: "Created",
      sortable: false,
      hideOnTablet: true,
      render: (r) => <span className="text-xs text-zinc-500">{formatDateTime(r.created_at)}</span>,
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
          Add Service
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
            keyExtractor={(r) => r.notification_service_id}
            onEdit={openEdit}
            onDelete={handleDelete}
            firstColumnClickableView={false}
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

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="text-sm text-zinc-700">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.require_record_id}
                onChange={(e) => setFormData({ ...formData, require_record_id: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="text-sm text-zinc-700">Require Record ID</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.require_participant_detail}
                onChange={(e) => setFormData({ ...formData, require_participant_detail: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="text-sm text-zinc-700">Require Participant Detail</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Require OTP</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="require_otp"
                  checked={formData.require_otp === true}
                  onChange={() => setFormData({ ...formData, require_otp: true })}
                  className="w-4 h-4 border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-sm text-zinc-700">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="require_otp"
                  checked={formData.require_otp === false}
                  onChange={() => setFormData({ ...formData, require_otp: false })}
                  className="w-4 h-4 border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-sm text-zinc-700">No</span>
              </label>
            </div>
          </div>

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

// ── Main Page ──────────────────────────────────────────────────────────

export function Notifications() {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();
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
      <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900 mb-5">
        Notifications
      </h1>

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
            {tab === "notifications" ? "Notifications" : "Services"}
          </button>
        ))}
      </div>

      {activeTab === "notifications" && <NotificationsTab />}
      {activeTab === "services" && <ServicesTab />}
    </div>
  );
}
