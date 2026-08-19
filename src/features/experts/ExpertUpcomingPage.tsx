import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Loader2 } from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import { ExpertConsultationListTable } from "./ExpertConsultationListTable";
import { useConsultationListFilter } from "./expertConsultationListUtils";
import {
  expertsPortalApi,
  getApiError,
  type ConsultationRequestItem,
} from "../../lib/api";

export function ExpertUpcomingPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ConsultationRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { search, setSearch, dateFilter, setDateFilter, dateOptions, filtered } =
    useConsultationListFilter(items);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await expertsPortalApi.listUpcoming();
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

  const handleOpen = (item: ConsultationRequestItem) => {
    if (!item.consultation_id) {
      setError("Missing consultation id for this slot");
      return;
    }
    navigate(`/experts/consultation/${item.consultation_id}/manage`);
  };

  return (
    <ExpertPortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Upcoming</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Confirmed consultations assigned to you that are still upcoming.
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
            countLabel="consultation"
            emptyIcon={<CalendarDays className="w-10 h-10 text-zinc-300" />}
            emptyMessage="No upcoming consultations"
            primaryActionLabel="Consult"
            onPrimaryAction={handleOpen}
            primaryActionDisabled={(item) => !item.consultation_id}
            onRowClick={handleOpen}
          />
        )}
      </div>
    </ExpertPortalLayout>
  );
}
