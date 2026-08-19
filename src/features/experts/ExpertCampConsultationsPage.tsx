import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Stethoscope } from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import {
  expertsPortalApi,
  getApiError,
  type CampConsultationEngagementItem,
} from "../../lib/api";

function formatDateRange(start?: string | null, end?: string | null): string {
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || "—";
}

export function ExpertCampConsultationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CampConsultationEngagementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await expertsPortalApi.listCampConsultationEngagements();
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

  return (
    <ExpertPortalLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">Camp Consultation</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Offline camp engagements where you are assigned as an onboarding assistant.
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
            <Stethoscope className="w-10 h-10 mb-3 text-zinc-300" />
            <p className="text-sm">No camp consultations assigned to you</p>
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100">
            {items.map((item) => (
              <button
                key={item.engagement_id}
                type="button"
                onClick={() =>
                  navigate(`/experts/portal/camp-consultations/${item.engagement_id}`)
                }
                className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-zinc-50 min-w-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-900 truncate">
                    {item.engagement_name || `Engagement #${item.engagement_id}`}
                  </div>
                  <div className="text-xs text-zinc-500 truncate mt-0.5">
                    {item.engagement_code ? `${item.engagement_code} · ` : ""}
                    {formatDateRange(item.start_date, item.end_date)}
                    {item.city ? ` · ${item.city}` : ""}
                    {item.camp_no != null ? ` · Camp ${item.camp_no}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-zinc-900">
                    {item.consultation_pending_count}
                  </div>
                  <div className="text-[11px] text-zinc-500">pending</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </ExpertPortalLayout>
  );
}
