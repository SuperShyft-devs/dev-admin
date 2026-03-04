import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, Users } from "lucide-react";
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ParticipantsModal({ open, onClose, source }: ParticipantsModalProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (source.kind === "engagement-code") {
        res = await participantsApi.byEngagementCode(source.code);
      } else if (source.kind === "public") {
        res = await participantsApi.public();
      } else {
        res = await participantsApi.byOrganization(source.orgId);
      }
      setParticipants(res.data.data ?? []);
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

  // Whether to show engagement columns (org view has multiple engagements)
  const showEngagement = source.kind === "organization";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle(source)}
      maxWidthClassName="max-w-3xl"
    >
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
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
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Name
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap hidden sm:table-cell">
                    Phone
                  </th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap hidden md:table-cell">
                    Email
                  </th>
                  {showEngagement && (
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap hidden md:table-cell">
                      Engagement
                    </th>
                  )}
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => (
                  <tr
                    key={`${p.user_id}-${idx}`}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                  >
                    {/* Name + phone (stacked on mobile) */}
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-800">
                      <div className="font-medium leading-tight">{fullName(p)}</div>
                      {/* Show phone inline on mobile since phone col is hidden */}
                      {p.phone && (
                        <div className="text-xs text-zinc-400 mt-0.5 sm:hidden">
                          {p.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 hidden sm:table-cell whitespace-nowrap">
                      {p.phone || "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 hidden md:table-cell">
                      {p.email || "—"}
                    </td>
                    {showEngagement && (
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 hidden md:table-cell whitespace-nowrap">
                        <div>{p.engagement_name || p.engagement_code || "—"}</div>
                        {p.engagement_code && p.engagement_name && (
                          <div className="text-xs text-zinc-400">{p.engagement_code}</div>
                        )}
                      </td>
                    )}
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  const cls =
    s === "active"
      ? "bg-emerald-50 text-emerald-700"
      : s === "inactive"
      ? "bg-zinc-100 text-zinc-500"
      : "bg-amber-50 text-amber-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status || "—"}
    </span>
  );
}
