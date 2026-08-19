import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2, MoreVertical, Search, Stethoscope, Users } from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import { PortalMenu } from "../../shared/ui/PortalMenu";
import {
  expertsPortalApi,
  getApiError,
  type CampConsultationParticipantItem,
} from "../../lib/api";

type CampEngagementNavState = {
  engagementName?: string;
  engagementCode?: string;
};

function fullName(item: CampConsultationParticipantItem): string {
  return [item.first_name, item.last_name].filter(Boolean).join(" ") || "—";
}

function matchesSearch(item: CampConsultationParticipantItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.first_name,
    item.last_name,
    item.phone,
    item.email,
    item.cabin,
    item.date,
    item.slot,
    String(item.user_id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function ExpertCampConsultationParticipantsPage() {
  const { engagementId: engagementIdParam } = useParams<{ engagementId: string }>();
  const engagementId = Number(engagementIdParam);
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as CampEngagementNavState | null) ?? null;

  const [items, setItems] = useState<CampConsultationParticipantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [actionMenuRow, setActionMenuRow] = useState<number | null>(null);
  const actionMenuAnchorRef = useRef<HTMLButtonElement | null>(null);

  const engagementTitle =
    navState?.engagementName ||
    navState?.engagementCode ||
    (Number.isFinite(engagementId) ? `Engagement ${engagementId}` : "Engagement");

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

  const dateOptions = useMemo(() => {
    const dates = new Set<string>();
    items.forEach((item) => {
      if (item.date) dates.add(item.date);
    });
    return Array.from(dates).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let rows = items;
    if (dateFilter) {
      rows = rows.filter((item) => item.date === dateFilter);
    }
    if (search.trim()) {
      rows = rows.filter((item) => matchesSearch(item, search));
    }
    return rows;
  }, [items, search, dateFilter]);

  const actionMenuParticipant = useMemo(
    () => items.find((item) => item.consultation_id === actionMenuRow) ?? null,
    [items, actionMenuRow]
  );

  const closeActionMenu = () => {
    setActionMenuRow(null);
    actionMenuAnchorRef.current = null;
  };

  const handleConsult = (item: CampConsultationParticipantItem) => {
    navigate(`/experts/consultation/${item.consultation_id}/manage`, {
      state: {
        fromCamp: true,
        engagementId,
        engagementName: engagementTitle,
      },
    });
  };

  return (
    <ExpertPortalLayout
      headerBackHref="/experts/portal/camp-consultations"
      headerBackLabel="Camp Consultation"
      contextTitle={engagementTitle}
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3 px-4">
          <p className="text-red-600 max-w-md">{error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Users className="w-4 h-4" />
              <span>
                {filtered.length}
                {filtered.length !== items.length && ` / ${items.length}`} participant
                {items.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, email..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                />
              </div>
              {dateOptions.length > 1 && (
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="">All dates</option>
                  {dateOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 bg-white border border-zinc-200 rounded-xl">
              <Stethoscope className="w-10 h-10 mb-3 text-zinc-300" />
              <p className="text-sm">No participants waiting for consultation</p>
            </div>
          ) : (
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600">
                      Name
                    </th>
                    <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600">
                      Phone
                    </th>
                    <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600 hidden sm:table-cell">
                      Email
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden lg:table-cell">
                      Consultation Date
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden lg:table-cell">
                      Slot Time
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden md:table-cell">
                      Cabin
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden xl:table-cell">
                      Status
                    </th>
                    <th className="px-2 sm:px-4 py-3 font-medium text-zinc-600 w-10 sm:w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-zinc-400">
                        No participants found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr
                        key={item.consultation_id}
                        onClick={() => handleConsult(item)}
                        className="hover:bg-zinc-50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 sm:px-4 py-3 font-medium text-zinc-900 truncate">
                          {fullName(item)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-zinc-600 truncate">
                          {item.phone ?? "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-zinc-600 truncate hidden sm:table-cell">
                          {item.email ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                          {item.date ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                          {item.slot ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 truncate hidden md:table-cell">
                          {item.cabin ?? "—"}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {item.done ? (
                            <span className="inline-flex text-[11px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                              Done
                            </span>
                          ) : (
                            <span className="inline-flex text-[11px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-center">
                          <button
                            ref={
                              actionMenuRow === item.consultation_id
                                ? actionMenuAnchorRef
                                : undefined
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (actionMenuRow === item.consultation_id) {
                                closeActionMenu();
                              } else {
                                actionMenuAnchorRef.current = e.currentTarget;
                                setActionMenuRow(item.consultation_id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                            aria-label="Actions"
                            aria-haspopup="menu"
                            aria-expanded={actionMenuRow === item.consultation_id}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <PortalMenu
            open={actionMenuRow !== null}
            anchorRef={actionMenuAnchorRef}
            onClose={closeActionMenu}
            width={180}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (actionMenuParticipant) handleConsult(actionMenuParticipant);
                closeActionMenu();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <Stethoscope className="w-4 h-4" />
              Consult
            </button>
          </PortalMenu>
        </div>
      )}
    </ExpertPortalLayout>
  );
}
