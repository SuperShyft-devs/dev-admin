import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, Users, Download, Trash2, AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { participantsApi, type Participant, getApiError } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Source =
  | { kind: "engagement-code"; code: string; name?: string }
  | { kind: "public" }
  | { kind: "organization"; orgId: number; orgName?: string };

interface ParticipantsModalProps {
  open: boolean;
  onClose: () => void;
  source: Source;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(p: Participant): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
}

function modalTitle(source: Source): string {
  switch (source.kind) {
    case "engagement-code":
      return `Participants — ${source.name || source.code}`;
    case "public":
      return "Participants — Public (B2C)";
    case "organization":
      return `Participants — ${source.orgName || `Org #${source.orgId}`}`;
  }
}

function formatBool(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function toCsvCell(value: unknown): string {
  if (value == null) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  const needsQuotes =
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r");
  if (!needsQuotes) return text;
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function participantToRecord(participant: Participant): Record<string, unknown> {
  return participant as unknown as Record<string, unknown>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ParticipantsModal({ open, onClose, source }: ParticipantsModalProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Participant | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (source.kind === "organization") {
        const res = await participantsApi.byOrganization(source.orgId);
        setParticipants(res.data.data ?? []);
      } else {
        const limit = 100;
        let page = 1;
        let total = 0;
        const all: Participant[] = [];

        do {
          const res =
            source.kind === "engagement-code"
              ? await participantsApi.byEngagementCode(source.code, { page, limit })
              : await participantsApi.public({ page, limit });
          const chunk = res.data.data ?? [];
          total = Number(res.data.meta?.total ?? chunk.length);
          all.push(...chunk);
          page += 1;
          if (chunk.length === 0) break;
        } while (all.length < total);

        setParticipants(all);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    if (open) {
      setSearch("");
      fetchParticipants();
    }
  }, [open, fetchParticipants]);

  const filtered = search.trim()
    ? participants.filter((p) => {
        const q = search.toLowerCase();
        return (
          fullName(p).toLowerCase().includes(q) ||
          (p.phone ?? "").includes(q) ||
          (p.email ?? "").toLowerCase().includes(q) ||
          (p.engagement_name ?? "").toLowerCase().includes(q) ||
          (p.engagement_code ?? "").toLowerCase().includes(q) ||
          (p.city ?? "").toLowerCase().includes(q)
        );
      })
    : participants;
  const canDeleteRows = source.kind === "engagement-code";

  const handleExportCsv = () => {
    if (participants.length === 0) return;

    const preferredColumns = [
      "engagement_participant_id",
      "engagement_id",
      "engagement_name",
      "engagement_code",
      "engagement_type",
      "engagement_date",
      "slot_start_time",
      "user_id",
      "first_name",
      "last_name",
      "phone",
      "email",
      "status",
      "participants_employee_id",
      "participant_department",
      "participant_blood_group",
      "want_doctor_consultation",
      "want_nutritionist_consultation",
      "want_doctor_and_nutritionist_consultation",
      "is_profile_created_on_metsights",
      "is_primary_record_id_synced",
      "is_fitprint_record_id_synced",
      "city",
    ];

    const discoveredColumns = new Set<string>();
    participants.forEach((participant) => {
      const row = participantToRecord(participant);
      Object.keys(row).forEach((key) => {
        discoveredColumns.add(key);
      });
    });

    const columns = [
      ...preferredColumns.filter((key) => discoveredColumns.has(key)),
      ...Array.from(discoveredColumns).filter((key) => !preferredColumns.includes(key)).sort(),
    ];

    const lines = [
      columns.map((key) => toCsvCell(key)).join(","),
      ...participants.map((participant) => {
        const row = participantToRecord(participant);
        return columns.map((key) => toCsvCell(row[key])).join(",");
      }),
    ];

    const csv = lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const codePart = source.kind === "engagement-code" ? source.code : source.kind;
    const datePart = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute("download", `participants-${codePart}-${datePart}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.engagement_id || !deleteTarget.user_id) {
      setDeleteError("Participant identifiers are missing.");
      return;
    }
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await participantsApi.removeFromEngagement(deleteTarget.engagement_id, deleteTarget.user_id);
      setDeleteTarget(null);
      await fetchParticipants();
    } catch (err) {
      setDeleteError(getApiError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={modalTitle(source)}
        maxWidthClassName="max-w-3xl"
      >
      {/* Search */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={participants.length === 0 || loading}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* State: loading */}
      {loading && (
        <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="w-7 h-7 animate-spin" />
          <span className="text-sm">Loading participants…</span>
        </div>
      )}

      {/* State: error */}
      {!loading && error && (
        <div className="py-6 text-center">
          <p className="text-red-600 text-sm mb-3">{error}</p>
          <button
            onClick={fetchParticipants}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* State: empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
          <Users className="w-10 h-10" />
          <p className="text-sm">
            {participants.length === 0
              ? "No participants found."
              : "No results match your search."}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <>
          {/* Summary */}
          <p className="text-xs text-zinc-500 mb-3">
            {filtered.length === participants.length
              ? `${participants.length} participant${participants.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${participants.length} participant${participants.length !== 1 ? "s" : ""}`}
          </p>

          {/* Scrollable table wrapper */}
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm min-w-[1500px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Name
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Phone
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Email
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Engagement ID
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Engagement Date
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Slot Start Time
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Department
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Blood Group
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Doctor Consultation
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Nutritionist Consultation
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Doctor + Nutritionist
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Profile Created On Metsights
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Primary Record Synced
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    FitPrint Record Synced
                  </th>
                  {canDeleteRows && (
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => (
                  <tr
                    key={`${p.engagement_participant_id ?? p.user_id}-${idx}`}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                  >
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-800">
                      <div className="font-medium leading-tight whitespace-nowrap">{fullName(p)}</div>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {p.phone || "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {p.email || "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {p.engagement_id ?? "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {p.engagement_date || "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {p.slot_start_time || "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {p.participant_department || "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {p.participant_blood_group || "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {formatBool(p.want_doctor_consultation)}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {formatBool(p.want_nutritionist_consultation)}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {formatBool(p.want_doctor_and_nutritionist_consultation)}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {formatBool(p.is_profile_created_on_metsights)}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {formatBool(p.is_primary_record_id_synced)}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                      {formatBool(p.is_fitprint_record_id_synced)}
                    </td>
                    {canDeleteRows && (
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(p);
                          }}
                          className="inline-flex items-center justify-center p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete participant from this engagement"
                          aria-label="Delete participant from this engagement"
                          disabled={deleteLoading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </Modal>

      {canDeleteRows && deleteTarget && (
        <Modal
          open={!!deleteTarget}
          onClose={() => (deleteLoading ? undefined : setDeleteTarget(null))}
          title="Delete Participant Engagement Data"
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-sm text-red-700">
                This will permanently remove this participant from the selected engagement and delete linked
                assessments, questionnaire responses, and generated reports for this engagement only.
              </p>
            </div>
            <p className="text-sm text-zinc-700">
              Are you sure you want to continue for <span className="font-semibold">{fullName(deleteTarget)}</span>?
            </p>
            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                disabled={deleteLoading}
              >
                {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes, Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
