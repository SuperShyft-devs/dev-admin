import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Loader2, Users } from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import {
  expertsPortalApi,
  getApiError,
  type CampConsultationEngagementItem,
} from "../../lib/api";

function engagementLabel(item: CampConsultationEngagementItem): string {
  return item.engagement_name || item.engagement_code || `Engagement ${item.engagement_id}`;
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
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Camp Consultation</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Offline camp engagements where you are assigned as an onboarding assistant.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-500">
            No camp consultations assigned to you.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.engagement_id}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/experts/portal/camp-consultations/${item.engagement_id}`, {
                      state: {
                        engagementName: engagementLabel(item),
                        engagementCode: item.engagement_code,
                      },
                    })
                  }
                  className="block w-full text-left p-4 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 truncate">{engagementLabel(item)}</p>
                      {item.engagement_code && (
                        <p className="text-xs text-zinc-500 mt-0.5">{item.engagement_code}</p>
                      )}
                      {(item.start_date || item.end_date) && (
                        <p className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {item.start_date ?? "—"} — {item.end_date ?? "—"}
                          </span>
                        </p>
                      )}
                      {item.city || item.camp_no != null ? (
                        <p className="text-xs text-zinc-500 mt-1">
                          {[item.city, item.camp_no != null ? `Camp ${item.camp_no}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Users className="w-3.5 h-3.5" />
                        <span>{item.consultation_pending_count} pending</span>
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ExpertPortalLayout>
  );
}
