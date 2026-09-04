import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  notificationsApi,
  participantsApi,
  type ConsultationPreference,
  type Engagement,
  type NotificationServiceItem,
  type Participant,
  type SessionDetailsPayload,
  getApiError,
} from "../../lib/api";

async function fetchParticipantCacheForSend(
  engagementId: number,
  userIds: number[],
  existing: Map<number, Participant>
): Promise<Map<number, Participant>> {
  const cache = new Map(existing);
  const missing = new Set(userIds.filter((id) => !cache.has(id)));
  if (missing.size === 0) return cache;

  const limit = 100;
  let page = 1;
  let total = 0;

  do {
    const res = await participantsApi.byEngagementId(engagementId, { page, limit });
    const chunk = res.data.data ?? [];
    total = Number(res.data.meta?.total ?? chunk.length);
    for (const participant of chunk) {
      cache.set(participant.user_id, participant);
      missing.delete(participant.user_id);
    }
    page += 1;
    if (chunk.length === 0) break;
  } while (missing.size > 0 && (page - 1) * limit < total);

  return cache;
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

function sessionDetailsFromParticipantConsultations(
  consultations: Participant["consultations"],
  referenceDate?: string
): SessionDetailsPayload | null {
  if (!consultations || typeof consultations === "boolean") return null;

  const today = referenceDate ?? new Date().toISOString().slice(0, 10);
  let best: SessionDetailsPayload | null = null;
  let bestDate = "";

  for (const [expertType, pref] of Object.entries(consultations)) {
    if (!pref || typeof pref === "boolean") continue;
    const booking = pref as ConsultationPreference;
    if (!booking.want) continue;
    const date = (booking.date ?? "").trim();
    if (!date) continue;

    const details: SessionDetailsPayload = {
      want: booking.want,
      date,
      slot: booking.slot ?? "",
      expert_type: expertType,
      cabin: booking.cabin?.trim() || undefined,
    };

    if (date === today) {
      return details;
    }

    if (date > bestDate) {
      bestDate = date;
      best = details;
    }
  }

  return best;
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
  const [recipientUserIds, setRecipientUserIds] = useState<number[]>([]);
  const [recipientsLoaded, setRecipientsLoaded] = useState(false);
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

  const [externalLink, setExternalLink] = useState("");

  const selectedService = useMemo(
    () => services.find((s) => s.service_key === serviceKey) ?? null,
    [services, serviceKey]
  );

  const recipientUserIdsResolved = useMemo(() => {
    if (scopedRecipients != null) {
      const seen = new Set<number>();
      const ids: number[] = [];
      for (const participant of scopedRecipients) {
        if (!seen.has(participant.user_id)) {
          seen.add(participant.user_id);
          ids.push(participant.user_id);
        }
      }
      return ids;
    }
    return recipientUserIds;
  }, [scopedRecipients, recipientUserIds]);

  const totalRecipients = recipientUserIdsResolved.length;
  const alreadyNotifiedCount = recipientUserIdsResolved.filter((id) => notifiedIds.has(id)).length;
  const pendingUserIds = recipientUserIdsResolved.filter((id) => !notifiedIds.has(id));

  const loadRecipients = useCallback(async () => {
    if (!engagement) return;
    if (scopedRecipients != null) {
      setRecipients(scopedRecipients);
      setRecipientsLoaded(true);
      setRecipientsLoading(false);
      setRecipientsError(null);
      return;
    }

    setRecipientsLoading(true);
    setRecipientsError(null);
    try {
      const idsRes = await participantsApi.ids(engagement.engagement_id);
      const userIds = idsRes.data.data?.user_ids ?? [];
      setRecipientUserIds(userIds);
      if (userIds.length === 0) {
        setRecipients([]);
        setRecipientsLoaded(true);
        return;
      }

      const pageRes = await participantsApi.byEngagementId(engagement.engagement_id, {
        page: 1,
        limit: 100,
      });
      setRecipients(pageRes.data.data ?? []);
      setRecipientsLoaded(true);
    } catch (err) {
      setRecipients([]);
      setRecipientUserIds([]);
      setRecipientsLoaded(false);
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
    setExternalLink("");
    setError(null);
    setSuccess(null);
    setSendProgress(null);
    setDropdownOpen(false);
    setRecipients([]);
    setRecipientUserIds([]);
    setRecipientsLoaded(false);
    setRecipientsError(null);

    setServicesLoading(true);
    notificationsApi
      .listServices()
      .then((res) => setServices(res.data.data.filter((s) => s.is_active)))
      .catch(() => setServices([]))
      .finally(() => setServicesLoading(false));

    if (scopedRecipients != null) {
      void loadRecipients();
    }
  }, [open, engagement, scopedRecipients, loadRecipients]);

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

    if (svc.require_external_link) {
      const link = externalLink.trim();
      if (!link) {
        setError("This service requires an external link.");
        return;
      }
      try {
        const parsed = new URL(link);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          setError("External link must be a valid http(s) URL.");
          return;
        }
      } catch {
        setError("External link must be a valid http(s) URL.");
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setSendProgress({ done: 0, total: pendingUserIds.length });

    let participantsByUserId = new Map(recipients.map((participant) => [participant.user_id, participant]));
    if (svc.require_session_details || svc.require_participant_detail) {
      participantsByUserId = await fetchParticipantCacheForSend(
        engagement.engagement_id,
        pendingUserIds,
        participantsByUserId
      );
    }

    let sentCount = 0;
    let lastError: string | null = null;

    try {
      for (let i = 0; i < pendingUserIds.length; i++) {
        const userId = pendingUserIds[i];
        const participant = participantsByUserId.get(userId);

        try {
          let sessionDetails: SessionDetailsPayload | undefined;
          if (svc.require_session_details) {
            const resolved = participant
              ? sessionDetailsFromParticipantConsultations(participant.consultations)
              : null;
            if (!resolved) {
              lastError = `No consultation booking found for user ${userId}.`;
              setSendProgress({ done: i + 1, total: pendingUserIds.length });
              continue;
            }
            sessionDetails = resolved;
          }

          await notificationsApi.dispatch({
            service_key: serviceKey,
            user_ids: [userId],
            engagement_id: engagement.engagement_id,
            participant_details:
              svc.require_participant_detail && participant
                ? participantDetailsFromRow(participant)
                : undefined,
            session_details: sessionDetails,
            external_link: svc.require_external_link ? externalLink.trim() : undefined,
          });
          sentCount += 1;
          setNotifiedIds((prev) => {
            const next = new Set(prev);
            next.add(userId);
            return next;
          });
        } catch (err) {
          lastError = getApiError(err);
        }

        setSendProgress({ done: i + 1, total: pendingUserIds.length });
      }

      if (sentCount === 0) {
        setError(lastError ?? "Failed to send notifications.");
        return;
      }

      const newTotalNotified = alreadyNotifiedCount + sentCount;
      const batchTotal = pendingUserIds.length;

      if (sentCount < batchTotal) {
        setError(
          lastError
            ? `Sent to ${sentCount} of ${batchTotal} users. Last error: ${lastError}`
            : `Sent to ${sentCount} of ${batchTotal} users. Select Send again for remaining users.`
        );
        return;
      }

      setSuccess(
        batchTotal === totalRecipients
          ? `Notifications sent to ${newTotalNotified}/${totalRecipients} users.`
          : `Sent to ${sentCount} new user${sentCount === 1 ? "" : "s"}. ${newTotalNotified}/${totalRecipients} users notified for this service.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const scopeHint = engagement
    ? scopedRecipients != null
      ? `Sending to ${totalRecipients} selected participant${totalRecipients === 1 ? "" : "s"} only.`
      : recipientsLoaded
      ? `Participants enrolled on this engagement only (${totalRecipients} user${totalRecipients === 1 ? "" : "s"}).`
      : "Load recipients to see how many users will receive this notification."
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

        {!recipientsLoading && !recipientsError && engagement && scopedRecipients == null && !recipientsLoaded && (
          <button
            type="button"
            onClick={() => void loadRecipients()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            Load recipients
          </button>
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
                        setExternalLink("");
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

        {selectedService?.require_external_link && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">External link</label>
            <input
              type="url"
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
        )}

        {submitting && sendProgress && (
          <div className="text-xs text-zinc-500">
            Sending… {sendProgress.done}/{sendProgress.total}
          </div>
        )}

        {!recipientsLoading && recipientsLoaded && totalRecipients === 0 && (
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
              !recipientsLoaded ||
              (selectedService?.require_external_link && !externalLink.trim()) ||
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
