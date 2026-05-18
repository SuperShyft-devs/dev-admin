import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Plus, Loader2 } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  notificationsApi,
  type NotificationItem,
  type NotificationServiceItem,
  getApiError,
} from "../../lib/api";

type TabKey = "notifications" | "services";
const TAB_KEYS: TabKey[] = ["notifications", "services"];

const STATUS_OPTIONS = ["pending", "sent", "failed"];
const CHANNEL_OPTIONS = ["email", "whatsapp"];

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

// ── Notifications Tab ──────────────────────────────────────────────────

function NotificationsTab() {
  const [data, setData] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState("");
  const [serviceKeyFilter, setServiceKeyFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [engagementIdFilter, setEngagementIdFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [services, setServices] = useState<NotificationServiceItem[]>([]);

  useEffect(() => {
    notificationsApi.listServices().then((r) => setServices(r.data.data)).catch(() => {});
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationsApi.list({
        page,
        limit,
        status: statusFilter || undefined,
        service_key: serviceKeyFilter || undefined,
        user_id: userIdFilter ? Number(userIdFilter) : undefined,
        engagement_id: engagementIdFilter ? Number(engagementIdFilter) : undefined,
      });
      setData(res.data.data);
      setTotal(res.data.meta.total);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, serviceKeyFilter, userIdFilter, engagementIdFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

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
      key: "service_key",
      label: "Service",
      sortable: false,
      render: (r) => <span className="font-medium">{r.service_key}</span>,
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
      key: "user_id",
      label: "User ID",
      sortable: false,
      hideOnMobile: true,
      render: (r) => (r.user_id != null ? String(r.user_id) : "—"),
    },
    {
      key: "engagement_id",
      label: "Engagement",
      sortable: false,
      hideOnTablet: true,
      render: (r) => (r.engagement_id != null ? String(r.engagement_id) : "—"),
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

      <div className="mb-4 flex flex-col sm:flex-row gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={serviceKeyFilter}
          onChange={(e) => { setServiceKeyFilter(e.target.value); setPage(1); }}
          className="sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.service_key} value={s.service_key}>{s.display_name}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="User ID"
            value={userIdFilter}
            onChange={(e) => { setUserIdFilter(e.target.value.replace(/\D/g, "")); setPage(1); }}
            className="pl-9 pr-4 py-2 w-32 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Engagement ID"
            value={engagementIdFilter}
            onChange={(e) => { setEngagementIdFilter(e.target.value.replace(/\D/g, "")); setPage(1); }}
            className="pl-9 pr-4 py-2 w-40 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
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
}

const EMPTY_SERVICE_FORM: ServiceFormData = {
  service_key: "",
  display_name: "",
  channel: "email",
  webhook_path: "",
  is_active: true,
  require_record_id: true,
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
