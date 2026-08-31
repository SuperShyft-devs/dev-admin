import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  engagementDataCompletenessApi,
  getApiError,
  type EngagementDataCompletenessSummaryResponse,
} from "../../lib/api";
import {
  CompletenessSummaryCard,
  formatCompletenessRatio,
} from "./engagementCompletenessUi";

export type EngagementCompletenessSummaryFilters = {
  audience: "b2b" | "b2c";
  search?: string;
  engagement_type?: string;
  city?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  filters: EngagementCompletenessSummaryFilters;
  tabLabel: string;
  onViewEngagement?: (engagementId: number) => void;
};

function formatEngagementStatusLabel(status?: string | null): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "draft") return "Draft";
  if (normalized === "scheduled") return "Scheduled";
  if (normalized === "running") return "Running";
  if (normalized === "completed") return "Completed";
  if (normalized === "cancelled") return "Cancelled";
  return status ?? "—";
}

export function EngagementDataCompletenessSummaryModal({
  open,
  onClose,
  filters,
  tabLabel,
  onViewEngagement,
}: Props) {
  const [data, setData] = useState<EngagementDataCompletenessSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtitle = useMemo(() => {
    const parts = [tabLabel, "All statuses"];
    if (filters.city?.trim()) parts.push(filters.city.trim());
    if (filters.engagement_type?.trim()) parts.push(filters.engagement_type.trim());
    if (filters.search?.trim()) parts.push(`"${filters.search.trim()}"`);
    return parts.join(" · ");
  }, [filters.city, filters.engagement_type, filters.search, tabLabel]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await engagementDataCompletenessApi.listSummary({
        audience: filters.audience,
        search: filters.search,
        engagement_type: filters.engagement_type,
        city: filters.city,
      });
      setData(res.data.data);
    } catch (err) {
      setError(getApiError(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      return;
    }
    void load();
  }, [load, open]);

  const rollup = data?.rollup;
  const totalParticipants = rollup?.total_participants ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Data completeness summary"
      maxWidthClassName="max-w-5xl"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-zinc-500">{subtitle}</p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading && !data ? (
          <div className="py-10 flex flex-col items-center gap-2 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading completeness summary…</span>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {data && rollup ? (
          <>
            <div className="text-xs text-zinc-500">
              {rollup.engagement_count} engagement{rollup.engagement_count === 1 ? "" : "s"} ·{" "}
              {rollup.total_participants} participant{rollup.total_participants === 1 ? "" : "s"}
            </div>

            {rollup.engagement_count === 0 ? (
              <p className="text-sm text-zinc-500 italic">No engagements match the current filters.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  <CompletenessSummaryCard
                    label="Booking ID"
                    count={rollup.with_booking_id}
                    total={totalParticipants}
                    tone="emerald"
                  />
                  <CompletenessSummaryCard
                    label="Blood report"
                    count={rollup.blood_report}
                    total={totalParticipants}
                    tone="sky"
                  />
                  <CompletenessSummaryCard
                    label="Blood values"
                    count={rollup.blood_values}
                    total={totalParticipants}
                    tone="sky"
                  />
                  <CompletenessSummaryCard
                    label="Bio AI report"
                    count={rollup.bio_ai_report}
                    total={totalParticipants}
                    tone="violet"
                  />
                  <CompletenessSummaryCard
                    label="Bio AI JSON"
                    count={rollup.bio_ai_json}
                    total={totalParticipants}
                    tone="violet"
                  />
                  <CompletenessSummaryCard
                    label="Questionnaire filled"
                    count={rollup.questionnaire_filled}
                    total={totalParticipants}
                    tone="emerald"
                  />
                  <CompletenessSummaryCard
                    label="Questionnaire partial / not started"
                    count={rollup.questionnaire_partially_filled + rollup.questionnaire_not_started}
                    total={totalParticipants}
                    tone="amber"
                  />
                </div>

                <div className="overflow-x-auto rounded-lg border border-zinc-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50">
                        <th className="px-3 py-2 text-left font-medium text-zinc-600">Engagement</th>
                        <th className="px-2 py-2 text-left font-medium text-zinc-600">City</th>
                        <th className="px-2 py-2 text-left font-medium text-zinc-600">Status</th>
                        <th className="px-2 py-2 text-center font-medium text-zinc-600">P</th>
                        <th className="px-2 py-2 text-center font-medium text-zinc-600">Book</th>
                        <th className="px-2 py-2 text-center font-medium text-zinc-600">Blood</th>
                        <th className="px-2 py-2 text-center font-medium text-zinc-600">Values</th>
                        <th className="px-2 py-2 text-center font-medium text-zinc-600">BioAI</th>
                        <th className="px-2 py-2 text-center font-medium text-zinc-600">JSON</th>
                        <th className="px-2 py-2 text-center font-medium text-zinc-600">Q</th>
                        {onViewEngagement ? (
                          <th className="px-2 py-2 text-right font-medium text-zinc-600"> </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {data.engagements.map((row) => {
                        const total = row.summary.total_participants;
                        const name = row.engagement_name || row.engagement_code || `Engagement ${row.engagement_id}`;
                        return (
                          <tr
                            key={row.engagement_id}
                            className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium text-zinc-800">{name}</div>
                              {row.engagement_code ? (
                                <div className="text-zinc-400">{row.engagement_code}</div>
                              ) : null}
                            </td>
                            <td className="px-2 py-2 text-zinc-600">{row.city ?? "—"}</td>
                            <td className="px-2 py-2 text-zinc-600">
                              {formatEngagementStatusLabel(row.status)}
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums text-zinc-700">{total}</td>
                            <td className="px-2 py-2 text-center tabular-nums text-zinc-700">
                              {formatCompletenessRatio(row.summary.with_booking_id, total)}
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums text-zinc-700">
                              {formatCompletenessRatio(row.summary.blood_report, total)}
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums text-zinc-700">
                              {formatCompletenessRatio(row.summary.blood_values, total)}
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums text-zinc-700">
                              {formatCompletenessRatio(row.summary.bio_ai_report, total)}
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums text-zinc-700">
                              {formatCompletenessRatio(row.summary.bio_ai_json, total)}
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums text-zinc-700">
                              {formatCompletenessRatio(row.summary.questionnaire_filled, total)}
                            </td>
                            {onViewEngagement ? (
                              <td className="px-2 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => onViewEngagement(row.engagement_id)}
                                  className="text-xs font-medium text-zinc-700 hover:text-zinc-900"
                                >
                                  View
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
