import { useCallback, useEffect, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import { ExpertConsultationListTable } from "./ExpertConsultationListTable";
import {
  consultationRowKey,
  useConsultationListFilter,
} from "./expertConsultationListUtils";
import {
  expertsPortalApi,
  getApiError,
  type ConsultationRequestItem,
} from "../../lib/api";

export function ExpertRequestsPage() {
  const [items, setItems] = useState<ConsultationRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);

  const { search, setSearch, dateFilter, setDateFilter, dateOptions, filtered } =
    useConsultationListFilter(items);

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

  const handleAccept = async (item: ConsultationRequestItem) => {
    if (!item.date || !item.slot) {
      setError("This request has no date/slot yet. The user must book a slot first.");
      return;
    }
    const key = consultationRowKey(item);
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
      setItems((prev) => prev.filter((r) => consultationRowKey(r) !== key));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setAcceptingKey(null);
    }
  };

  const canAccept = (item: ConsultationRequestItem) =>
    Boolean(item.date && item.slot && acceptingKey !== consultationRowKey(item));

  return (
    <ExpertPortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Requests</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pending consultation requests from online engagements waiting for expert assignment.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <ExpertConsultationListTable
            items={items}
            filtered={filtered}
            search={search}
            onSearchChange={setSearch}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            dateOptions={dateOptions}
            countLabel="request"
            emptyIcon={<Inbox className="w-10 h-10 text-zinc-300" />}
            emptyMessage="No pending requests"
            primaryActionLabel="Accept"
            onPrimaryAction={(item) => void handleAccept(item)}
            primaryActionDisabled={(item) => !canAccept(item)}
            primaryActionLoading={(item) => acceptingKey === consultationRowKey(item)}
            onRowClick={(item) => {
              if (canAccept(item)) void handleAccept(item);
            }}
            renderStatus={(item) =>
              item.date && item.slot ? (
                <span className="inline-flex text-[11px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                  Ready
                </span>
              ) : (
                <span className="inline-flex text-[11px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                  No slot
                </span>
              )
            }
          />
        )}
      </div>
    </ExpertPortalLayout>
  );
}
