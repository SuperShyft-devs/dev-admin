import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  notificationsApi,
  participantsApi,
  type Engagement,
  type NotificationServiceItem,
  type Participant,
  getApiError,
} from "../../lib/api";

async function fetchEngagementParticipants(engagement: Engagement): Promise<Participant[]> {
  const limit = 100;
  let page = 1;
  let total = 0;
  const all: Participant[] = [];

  do {
    const res = await participantsApi.byEngagementId(engagement.engagement_id, { page, limit });
    const chunk = res.data.data ?? [];
    total = Number(res.data.meta?.total ?? chunk.length);
    all.push(...chunk);
    page += 1;
    if (chunk.length === 0) break;
  } while (all.length < total);

  return all;
}

async function fetchNotifiedUserIds(
  engagementId: number,
  serviceKey: string
): Promise<Set<number>> {
  const ids = new Set<number>();
  const limit = 100;
  let page = 1;
  let total = 0;

  do {
    const res = await notificationsApi.list({
      engagement_id: engagementId,
      service_key: serviceKey,
      page,
      limit,
    });
    const items = res.data.data ?? [];
    total = Number(res.data.meta?.total ?? items.length);
    for (const n of items) {
      if (n.user?.user_ids) {
        for (const uid of n.user.user_ids) {
          ids.add(uid);
        }
      }
    }
    page += 1;
    if (items.length === 0) break;
  } while ((page - 1) * limit < total);

  return ids;
}

function participantDetailsFromRow(p: Participant): Record<string, string> {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return {
    name: name || "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    engagement: p.engagement_name ?? p.engagement_code ?? "",
  };
}

export interface EngagementNotificationModalProps {
  open: boolean;
  onClose: () => void;
  engagement: Engagement | null;
  /** When set, notifications are limited to these participants (e.g. from Participants modal selection). */
  scopedRecipients?: Participant[];
}

export function EngagementNotificationModal({
  open,
  onClose,
  engagement,
  scopedRecipients,
}: EngagementNotificationModalProps) {
  const [services, setServices] = useState<NotificationServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [recipients, setRecipients] = useState<Participant[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);

  const [serviceKey, setServiceKey] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [notifiedIds, setNotifiedIds] = useState<Set<number>>(new Set());
  const [notifiedLoading, setNotifiedLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedService = useMemo(
    () => services.find((s) => s.service_key === serviceKey) ?? null,
    [services, serviceKey]
  );

  const recipientUserIds = useMemo(() => {
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const p of recipients) {
      if (!seen.has(p.user_id)) {
        seen.add(p.user_id);
        ids.push(p.user_id);
      }
    }
    return ids;
  }, [recipients]);

  const totalRecipients = recipientUserIds.length;
  const alreadyNotifiedCount = recipientUserIds.filter((id) => notifiedIds.has(id)).length;
  const pendingUserIds = recipientUserIds.filter((id) => !notifiedIds.has(id));

  const loadRecipients = useCallback(async () => {
    if (!engagement) return;
    if (scopedRecipients != null) {
      setRecipients(scopedRecipients);
      setRecipientsLoading(false);
      setRecipientsError(null);
      return;
    }
    setRecipientsLoading(true);
    setRecipientsError(null);
    try {
      const rows = await fetchEngagementParticipants(engagement);
      setRecipients(rows);
    } catch (err) {
      setRecipients([]);
      setRecipientsError(getApiError(err));
    } finally {
      setRecipientsLoading(false);
    }
  }, [engagement, scopedRecipients]);

  const loadNotified = useCallback(async () => {
    if (!engagement || !serviceKey) {
      setNotifiedIds(new Set());
      return;
    }
    setNotifiedLoading(true);
    try {
      const ids = await fetchNotifiedUserIds(engagement.engagement_id, serviceKey);
      setNotifiedIds(ids);
    } catch {
      setNotifiedIds(new Set());
    } finally {
      setNotifiedLoading(false);
    }
  }, [engagement, serviceKey]);

  useEffect(() => {
    if (!open || !engagement) return;
    setServiceKey("");
    setServiceSearch("");
    setError(null);
    setSuccess(null);
    setSendProgress(null);
    setDropdownOpen(false);

    setServicesLoading(true);
    notificationsApi
      .listServices()
      .then((res) => setServices(res.data.data.filter((s) => s.is_active)))
      .catch(() => setServices([]))
      .finally(() => setServicesLoading(false));

    loadRecipients();
  }, [open, engagement, loadRecipients]);

  useEffect(() => {
    if (open && engagement && serviceKey) {
      loadNotified();
    }
  }, [open, engagement, serviceKey, loadNotified]);

  const filteredServices = services.filter(
    (s) =>
      s.display_name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
      s.service_key.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const handleSend = async () => {
    if (!engagement || !serviceKey || pendingUserIds.length === 0) return;

    const svc = selectedService;
    if (!svc) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setSendProgress({ done: 0, total: pendingUserIds.length });

    const participantsByUserId = new Map(recipients.map((p) => [p.user_id, p]));
    const firstParticipant = participantsByUserId.get(pendingUserIds[0]);

    try {
      await notificationsApi.dispatch({
        service_key: serviceKey,
        user_ids: pendingUserIds,
        engagement_id: engagement.engagement_id,
        record_id: null,
        participant_details:
          svc.require_participant_detail && firstParticipant
            ? participantDetailsFromRow(firstParticipant)
            : undefined,
      });
      setNotifiedIds((prev) => {
        const next = new Set(prev);
        for (const uid of pendingUserIds) next.add(uid);
        return next;
      });
      setSendProgress({ done: pendingUserIds.length, total: pendingUserIds.length });

      const newTotalNotified = alreadyNotifiedCount + pendingUserIds.length;
      setSuccess(
        pendingUserIds.length === totalRecipients
          ? `Notifications sent to ${newTotalNotified}/${totalRecipients} users.`
          : `Sent to ${pendingUserIds.length} new user${pendingUserIds.length === 1 ? "" : "s"}. ${newTotalNotified}/${totalRecipients} users notified for this service.`
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const scopeHint = engagement
    ? scopedRecipients != null
      ? `Sending to ${totalRecipients} selected participant${totalRecipients === 1 ? "" : "s"} only.`
      : `Participants enrolled on this engagement only (${totalRecipients} user${totalRecipients === 1 ? "" : "s"}).`
    : "";

  return (
    <Modal open={open} onClose={onClose} title="Send Notification">
      <div className="space-y-4">
        {engagement && (
          <p className="text-sm text-zinc-600">
            Engagement:{" "}
            <span className="font-semibold text-zinc-900">
              {engagement.engagement_name ?? engagement.engagement_code ?? engagement.engagement_id}
            </span>
          </p>
        )}

        {recipientsLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading recipients…
          </div>
        )}

        {!recipientsLoading && recipientsError && (
          <p className="text-sm text-red-600">{recipientsError}</p>
        )}

        {!recipientsLoading && !recipientsError && engagement && (
          <p className="text-xs text-zinc-500">{scopeHint}</p>
        )}

        {serviceKey && !recipientsLoading && totalRecipients > 0 && (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-sm text-zinc-700">
            {notifiedLoading ? (
              <span className="inline-flex items-center gap-1.5 text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading delivery status…
              </span>
            ) : (
              <>
                <span className="font-medium">
                  {alreadyNotifiedCount}/{totalRecipients}
                </span>{" "}
                users already notified with this service
                {pendingUserIds.length > 0 && !submitting && (
                  <span className="text-zinc-500">
                    {" "}
                    · {pendingUserIds.length} pending
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">{success}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Notification service
          </label>
          {servicesLoading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading services…
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                placeholder="Search services…"
                value={serviceSearch}
                onChange={(e) => {
                  setServiceSearch(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {dropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                  {filteredServices.map((s) => (
                    <button
                      key={s.service_key}
                      type="button"
                      onClick={() => {
                        setServiceKey(s.service_key);
                        setServiceSearch(s.display_name);
                        setDropdownOpen(false);
                        setSuccess(null);
                        setError(null);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center justify-between ${
                        serviceKey === s.service_key ? "bg-zinc-50 font-medium" : "text-zinc-700"
                      }`}
                    >
                      <span>{s.display_name}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          s.channel === "email"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-green-50 text-green-600"
                        }`}
                      >
                        {s.channel}
                      </span>
                    </button>
                  ))}
                  {filteredServices.length === 0 && (
                    <div className="px-3 py-2 text-sm text-zinc-500">No services found</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {submitting && sendProgress && (
          <div className="text-xs text-zinc-500">
            Sending… {sendProgress.done}/{sendProgress.total}
          </div>
        )}

        {!recipientsLoading && totalRecipients === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No participants found. Add participants before sending notifications.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-100">
          <button
            type="button"
            onClick={handleSend}
            disabled={
              submitting ||
              !serviceKey ||
              totalRecipients === 0 ||
              pendingUserIds.length === 0 ||
              !!success
            }
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting
              ? "Sending…"
              : pendingUserIds.length === 0 && alreadyNotifiedCount > 0
              ? "All users notified"
              : pendingUserIds.length < totalRecipients && alreadyNotifiedCount > 0
              ? `Send to ${pendingUserIds.length} new user${pendingUserIds.length === 1 ? "" : "s"}`
              : "Send"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
          >
            {success ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
