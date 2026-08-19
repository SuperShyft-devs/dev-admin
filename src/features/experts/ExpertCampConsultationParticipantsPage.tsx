import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Loader2, Stethoscope } from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import {
  expertsPortalApi,
  getApiError,
  type CampConsultationParticipantItem,
} from "../../lib/api";

function formatName(item: CampConsultationParticipantItem): string {
  const name = [item.first_name, item.last_name].filter(Boolean).join(" ").trim();
  return name || `User #${item.user_id}`;
}

function formatType(typeKey: string): string {
  if (!typeKey) return "—";
  return typeKey.charAt(0).toUpperCase() + typeKey.slice(1).replace(/_/g, " ");
}

export function ExpertCampConsultationParticipantsPage() {
  const { engagementId: engagementIdParam } = useParams<{ engagementId: string }>();
  const engagementId = Number(engagementIdParam);
  const navigate = useNavigate();

  const [items, setItems] = useState<CampConsultationParticipantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(engagementId) || engagementId <= 0) {
      setError("Invalid engagement id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await expertsPortalApi.listCampConsultationParticipants(engagementId);
      setItems(res.data.data ?? []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rowKey = (item: CampConsultationParticipantItem) =>
    `${item.consultation_id}:${item.user_id}:${item.expert_type}`;

  const handleConsult = (item: CampConsultationParticipantItem) => {
    navigate(`/experts/consultation/${item.consultation_id}/manage`, {
      state: { fromCamp: true, engagementId },
    });
  };

  return (
    <ExpertPortalLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            to="/experts/portal/camp-consultations"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Camp Consultation
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900">Participants</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Participants who requested your consultation type at this camp.
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
            <p className="text-sm">No participants waiting for consultation</p>
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100">
            {items.map((item) => {
              const key = rowKey(item);
              const isOpen = openKey === key;
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
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-sm font-medium text-zinc-900 truncate">
                            {formatName(item)}
                          </div>
                          {item.done && (
                            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                              Done
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 truncate mt-0.5">
                          {formatType(item.expert_type)}
                          {item.date ? ` · ${item.date}` : ""}
                          {item.slot ? ` · ${item.slot}` : ""}
                          {item.cabin ? ` · ${item.cabin}` : ""}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center pr-3">
                      <button
                        type="button"
                        onClick={() => handleConsult(item)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 shrink-0"
                      >
                        Consult
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
                          <div className="text-xs text-zinc-500">Slot</div>
                          <div className="text-zinc-900">
                            {item.date && item.slot ? `${item.date} at ${item.slot}` : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Cabin</div>
                          <div className="text-zinc-900">{item.cabin ?? "—"}</div>
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
