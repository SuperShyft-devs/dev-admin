import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, CalendarDays } from "lucide-react";
import { Modal } from "./Modal";
import { engagementsApi, type EngagementListItem, getApiError } from "../../lib/api";

interface OrganizationEngagementsModalProps {
  open: boolean;
  onClose: () => void;
  orgId: number;
  orgName?: string;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusClasses(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "active") return "bg-emerald-50 text-emerald-700";
  if (s === "inactive") return "bg-zinc-100 text-zinc-500";
  return "bg-amber-50 text-amber-700";
}

export function OrganizationEngagementsModal({
  open,
  onClose,
  orgId,
  orgName,
}: OrganizationEngagementsModalProps) {
  const [engagements, setEngagements] = useState<EngagementListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchEngagements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let all: EngagementListItem[] = [];
      let total = 0;

      while (true) {
        const res = await engagementsApi.list({ page, limit: pageSize, org_id: orgId });
        const chunk = res.data.data ?? [];
        total = res.data.meta?.total ?? chunk.length;
        all = [...all, ...chunk];
        if (all.length >= total || chunk.length === 0) break;
        page += 1;
      }

      setEngagements(all);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    fetchEngagements();
  }, [open, fetchEngagements]);

  const filtered = search.trim()
    ? engagements.filter((e) => {
        const q = search.trim().toLowerCase();
        return (
          (e.engagement_name ?? "").toLowerCase().includes(q) ||
          (e.engagement_code ?? "").toLowerCase().includes(q) ||
          (e.engagement_type ?? "").toLowerCase().includes(q) ||
          (e.city ?? "").toLowerCase().includes(q)
        );
      })
    : engagements;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Engagements — ${orgName || `Org #${orgId}`}`}
      maxWidthClassName="max-w-4xl"
    >
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name, code, type, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
      </div>

      {loading && (
        <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="w-7 h-7 animate-spin" />
          <span className="text-sm">Loading engagements…</span>
        </div>
      )}

      {!loading && error && (
        <div className="py-6 text-center">
          <p className="text-red-600 text-sm mb-3">{error}</p>
          <button
            onClick={fetchEngagements}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
          <CalendarDays className="w-10 h-10" />
          <p className="text-sm">
            {engagements.length === 0
              ? "No engagements found for this organization."
              : "No results match your search."}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <p className="text-xs text-zinc-500 mb-3">
            {filtered.length === engagements.length
              ? `${engagements.length} engagement${engagements.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${engagements.length} engagement${engagements.length !== 1 ? "s" : ""}`}
          </p>

          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Name</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Code</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap hidden sm:table-cell">Type</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap hidden md:table-cell">City</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Start</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap hidden sm:table-cell">End</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.engagement_id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-800">
                      <div className="font-medium leading-tight">{e.engagement_name || "—"}</div>
                      {e.engagement_code && (
                        <div className="text-xs text-zinc-400 mt-0.5 sm:hidden">{e.engagement_code}</div>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">{e.engagement_code || "—"}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 hidden sm:table-cell whitespace-nowrap">{e.engagement_type || "—"}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 hidden md:table-cell whitespace-nowrap">{e.city || "—"}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">{formatDate(e.start_date)}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 hidden sm:table-cell whitespace-nowrap">{formatDate(e.end_date)}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusClasses(e.status)}`}>
                        {e.status || "—"}
                      </span>
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
