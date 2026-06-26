import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, FileBarChart } from "lucide-react";
import { Modal } from "./Modal";
import { organizationsApi, type CampListItem, getApiError } from "../../lib/api";

interface OrganizationCampsModalProps {
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

export function OrganizationCampsModal({
  open,
  onClose,
  orgId,
  orgName,
}: OrganizationCampsModalProps) {
  const [camps, setCamps] = useState<CampListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchCamps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let all: CampListItem[] = [];
      let total = 0;

      while (true) {
        const res = await organizationsApi.listCampsByOrganization(orgId, { page, limit: pageSize });
        const chunk = res.data.data ?? [];
        total = res.data.meta?.total ?? chunk.length;
        all = [...all, ...chunk];
        if (all.length >= total || chunk.length === 0) break;
        page += 1;
      }

      setCamps(all);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    fetchCamps();
  }, [open, fetchCamps]);

  const filtered = search.trim()
    ? camps.filter((c) => {
        const q = search.trim().toLowerCase();
        return (
          (c.camp_name ?? "").toLowerCase().includes(q) ||
          String(c.camp_no).includes(q)
        );
      })
    : camps;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Camps — ${orgName || `Org #${orgId}`}`}
      maxWidthClassName="max-w-4xl"
    >
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by camp name or camp no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
      </div>

      {loading && (
        <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="w-7 h-7 animate-spin" />
          <span className="text-sm">Loading camps…</span>
        </div>
      )}

      {!loading && error && (
        <div className="py-6 text-center">
          <p className="text-red-600 text-sm mb-3">{error}</p>
          <button
            onClick={fetchCamps}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
          <FileBarChart className="w-10 h-10" />
          <p className="text-sm">
            {camps.length === 0
              ? "No camps found for this organization."
              : "No results match your search."}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <p className="text-xs text-zinc-500 mb-3">
            {filtered.length === camps.length
              ? `${camps.length} camp${camps.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${camps.length} camp${camps.length !== 1 ? "s" : ""}`}
          </p>

          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Camp No</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Camp name</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Start date</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Engagements</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap hidden sm:table-cell">Departments</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap hidden sm:table-cell">Reports</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.camp_no} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">{c.camp_no}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-800 font-medium">{c.camp_name || "—"}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">{formatDate(c.start_date)}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">{c.engagement_count}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 hidden sm:table-cell whitespace-nowrap">{c.department_count}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 hidden sm:table-cell whitespace-nowrap">{c.report_count}</td>
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
