import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Inbox } from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import {
  expertsPortalApi,
  getApiError,
  type ConsultationRequestItem,
} from "../../lib/api";

function formatName(item: ConsultationRequestItem): string {
  const name = [item.first_name, item.last_name].filter(Boolean).join(" ").trim();
  return name || `User #${item.user_id}`;
}

function formatType(typeKey: string): string {
  if (!typeKey) return "—";
  return typeKey.charAt(0).toUpperCase() + typeKey.slice(1).replace(/_/g, " ");
}

export function ExpertRequestsPage() {
  const [items, setItems] = useState<ConsultationRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await expertsPortalApi.listRequests();
      setItems(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rowKey = (item: ConsultationRequestItem) =>
    `${item.engagement_id}:${item.user_id}:${item.expert_type}`;

  const handleAccept = async (item: ConsultationRequestItem) => {
    if (!item.date || !item.slot) {
      setError("This request has no date/slot yet. The user must book a slot first.");
      return;
    }
    const key = rowKey(item);
    setAcceptingKey(key);
    setError(null);
    try {
      await expertsPortalApi.confirmRequest({
        user_id: item.user_id,
        engagement_id: item.engagement_id,
        expert_type: item.expert_type,
        date: item.date,
        slot: item.slot,
      });
      setItems((prev) => prev.filter((r) => rowKey(r) !== key));
      if (openKey === key) setOpenKey(null);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setAcceptingKey(null);
    }
  };

  return (
    <ExpertPortalLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">Requests</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Pending consultation requests from B2C engagements waiting for expert assignment.
          </p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
            <Inbox className="w-10 h-10 mb-3 text-zinc-300" />
            <p className="text-sm">No pending requests</p>
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100">
            {items.map((item) => {
              const key = rowKey(item);
              const isOpen = openKey === key;
              const accepting = acceptingKey === key;
              return (
                <div key={key}>
                  <div className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenKey(isOpen ? null : key)}
                      className="flex-1 flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 min-w-0"
                    >
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 text-zinc-400 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-zinc-900 truncate">
                          {formatName(item)}
                        </div>
                        <div className="text-xs text-zinc-500 truncate mt-0.5">
                          {formatType(item.expert_type)}
                          {item.date ? ` · ${item.date}` : ""}
                          {item.slot ? ` · ${item.slot}` : " · No slot yet"}
                          {item.engagement_code ? ` · ${item.engagement_code}` : ""}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center pr-3">
                      <button
                        type="button"
                        disabled={accepting || !item.date || !item.slot}
                        onClick={() => void handleAccept(item)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-40 shrink-0"
                      >
                        {accepting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Accept"
                        )}
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-0 bg-zinc-50/80">
                      <div className="ml-7 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-zinc-500">User ID</div>
                          <div className="text-zinc-900">{item.user_id}</div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Phone</div>
                          <div className="text-zinc-900">{item.phone ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Email</div>
                          <div className="text-zinc-900 break-all">{item.email ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Engagement</div>
                          <div className="text-zinc-900">
                            #{item.engagement_id}
                            {item.engagement_code ? ` (${item.engagement_code})` : ""}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Expert type</div>
                          <div className="text-zinc-900">{formatType(item.expert_type)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Requested slot</div>
                          <div className="text-zinc-900">
                            {item.date && item.slot
                              ? `${item.date} at ${item.slot}`
                              : "Not selected yet"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ExpertPortalLayout>
  );
}
