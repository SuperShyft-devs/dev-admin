import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Search,
  Loader2,
  MoreVertical,
  Eye,
  Users,
} from "lucide-react";
import { ConsoleLayout } from "../../layouts/ConsoleLayout";
import { Modal } from "../../shared/ui/Modal";
import {
  engagementsApi,
  participantsApi,
  getApiError,
  type Participant,
  type Engagement,
} from "../../lib/api";
import { fetchAllPages } from "../../lib/fetchAllPages";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(p: Participant): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
}

function formatBool(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

type BoolFilter = "all" | "yes" | "no";

function matchesBoolFilter(
  value: boolean | null | undefined,
  filter: BoolFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "yes") return value === true;
  return value === false;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EngagementConsolePage() {
  const { engagementId } = useParams<{ engagementId: string }>();
  const engId = Number(engagementId);

  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");

  const [actionMenuRow, setActionMenuRow] = useState<number | null>(null);
  const [selectedParticipant, setSelectedParticipant] =
    useState<Participant | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!engId || isNaN(engId)) return;
    setLoading(true);
    setError(null);
    try {
      const [engRes, parts] = await Promise.all([
        engagementsApi.get(engId),
        fetchAllPages<Participant>(
          (page, limit) =>
            participantsApi.byEngagementId(engId, { page, limit }) as any,
          100
        ),
      ]);
      setEngagement(engRes.data.data);
      setParticipants(parts);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [engId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dateOptions = useMemo(() => {
    const dates = new Set<string>();
    participants.forEach((p) => {
      if (p.engagement_date) dates.add(p.engagement_date);
    });
    return Array.from(dates).sort();
  }, [participants]);

  const departmentOptions = useMemo(() => {
    const deps = new Set<string>();
    participants.forEach((p) => {
      if (p.participant_department) deps.add(p.participant_department);
    });
    return Array.from(deps).sort();
  }, [participants]);

  const filtered = useMemo(() => {
    let rows = participants;

    if (dateFilter) {
      rows = rows.filter((p) => (p.engagement_date ?? "") === dateFilter);
    }
    if (departmentFilter) {
      rows = rows.filter(
        (p) => (p.participant_department ?? "") === departmentFilter
      );
    }

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          fullName(p).toLowerCase().includes(q) ||
          (p.phone ?? "").includes(q) ||
          (p.email ?? "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [participants, search, dateFilter, departmentFilter]);

  const openDetail = (p: Participant) => {
    setSelectedParticipant(p);
    setDetailOpen(true);
    setActionMenuRow(null);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedParticipant(null);
  };

  useEffect(() => {
    if (actionMenuRow === null) return;
    const handleClick = () => setActionMenuRow(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [actionMenuRow]);

  if (!engId || isNaN(engId)) {
    return (
      <ConsoleLayout>
        <div className="flex items-center justify-center h-64 text-zinc-500">
          Invalid engagement.
        </div>
      </ConsoleLayout>
    );
  }

  return (
    <ConsoleLayout engagementName={engagement?.engagement_name ?? undefined}>
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64 text-red-600">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Users className="w-4 h-4" />
              <span>
                {filtered.length}
                {filtered.length !== participants.length &&
                  ` / ${participants.length}`}{" "}
                participant{participants.length !== 1 ? "s" : ""}
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
              {departmentOptions.length > 1 && (
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="">All departments</option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Table */}
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
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden xl:table-cell">
                    Age
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden lg:table-cell">
                    Collection Date
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden lg:table-cell">
                    Slot Time
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden md:table-cell">
                    Department
                  </th>
                  <th className="px-2 sm:px-4 py-3 font-medium text-zinc-600 w-10 sm:w-12">
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-zinc-400"
                    >
                      No participants found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr
                      key={
                        p.engagement_participant_id ??
                        `${p.user_id}-${p.engagement_id}`
                      }
                      onClick={() => openDetail(p)}
                      className="hover:bg-zinc-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 sm:px-4 py-3 font-medium text-zinc-900 truncate">
                        {fullName(p)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-zinc-600 truncate">
                        {p.phone ?? "—"}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-zinc-600 truncate hidden sm:table-cell">
                        {p.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden xl:table-cell">
                        {(p as any).age ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                        {p.engagement_date ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                        {p.slot_start_time ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 truncate hidden md:table-cell">
                        {p.participant_department ?? "—"}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuRow(
                              actionMenuRow ===
                                (p.engagement_participant_id ?? p.user_id)
                                ? null
                                : (p.engagement_participant_id ?? p.user_id)
                            );
                          }}
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                          aria-label="Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {actionMenuRow ===
                          (p.engagement_participant_id ?? p.user_id) && (
                          <div className="absolute right-2 sm:right-4 top-full z-20 mt-0.5 w-36 bg-white border border-zinc-200 rounded-lg shadow-lg py-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail(p);
                              }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Participant Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={closeDetail}
        title="Participant Details"
        maxWidthClassName="max-w-lg"
      >
        {selectedParticipant && (
          <ParticipantDetail participant={selectedParticipant} />
        )}
      </Modal>
    </ConsoleLayout>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function ParticipantDetail({ participant: p }: { participant: Participant }) {
  const field = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm text-zinc-900">{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {field("Name", fullName(p))}
      {field("Phone", p.phone)}
      {field("Email", p.email)}
      {field("Age", (p as any).age)}
      {field("Blood Collection Date", p.engagement_date)}
      {field("Slot Time", p.slot_start_time)}
      {field("Department", p.participant_department)}
      {field("Employee ID", p.participants_employee_id)}
      {field("Blood Group", p.participant_blood_group)}
      {field("Doctor Consultation", formatBool(p.want_doctor_consultation))}
      {field(
        "Nutritionist Consultation",
        formatBool(p.want_nutritionist_consultation)
      )}
      {field(
        "Doctor + Nutritionist",
        formatBool(p.want_doctor_and_nutritionist_consultation)
      )}
    </div>
  );
}
