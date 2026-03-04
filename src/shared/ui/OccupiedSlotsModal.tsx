import { useState, useEffect, useCallback } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { occupiedSlotsApi, getApiError } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Source =
  | { kind: "engagement-code"; code: string; name?: string }
  | { kind: "public" };

interface OccupiedSlotsModalProps {
  open: boolean;
  onClose: () => void;
  source: Source;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modalTitle(source: Source): string {
  if (source.kind === "engagement-code") {
    return `Occupied Slots — ${source.name || source.code}`;
  }
  return "Occupied Slots — Public (B2C)";
}

/** Format "HH:MM:SS" → "HH:MM" for cleaner display */
function formatTime(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/** Format "YYYY-MM-DD" → "Mon DD, YYYY" */
function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OccupiedSlotsModal({ open, onClose, source }: OccupiedSlotsModalProps) {
  const [slots, setSlots] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (source.kind === "engagement-code") {
        res = await occupiedSlotsApi.byEngagementCode(source.code);
      } else {
        res = await occupiedSlotsApi.public();
      }
      setSlots(res.data.data.occupied_slots ?? {});
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    if (open) {
      setSlots({});
      fetchSlots();
    }
  }, [open, fetchSlots]);

  const sortedDates = Object.keys(slots).sort();
  const totalSlots = sortedDates.reduce((acc, d) => acc + slots[d].length, 0);
  const isEmpty = sortedDates.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle(source)}
      maxWidthClassName="max-w-lg"
    >
      {/* Loading */}
      {loading && (
        <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="w-7 h-7 animate-spin" />
          <span className="text-sm">Loading occupied slots…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="py-6 text-center">
          <p className="text-red-600 text-sm mb-3">{error}</p>
          <button
            onClick={fetchSlots}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && isEmpty && (
        <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
          <CalendarClock className="w-10 h-10" />
          <p className="text-sm">No occupied slots found.</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && !isEmpty && (
        <div className="space-y-4">
          {/* Summary */}
          <p className="text-xs text-zinc-500">
            {totalSlots} slot{totalSlots !== 1 ? "s" : ""} across {sortedDates.length} date{sortedDates.length !== 1 ? "s" : ""}
          </p>

          {/* Date groups */}
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedDates.map((date) => {
              const times = slots[date];
              return (
                <div
                  key={date}
                  className="rounded-lg border border-zinc-200 overflow-hidden"
                >
                  {/* Date header */}
                  <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                    <span className="text-sm font-medium text-zinc-800">
                      {formatDate(date)}
                    </span>
                    <span className="text-xs font-medium text-zinc-500 bg-zinc-200 px-2 py-0.5 rounded-full">
                      {times.length} slot{times.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Time slots grid */}
                  <div className="p-3 sm:p-4">
                    <div className="flex flex-wrap gap-2">
                      {[...times].sort().map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-700 text-xs font-mono font-medium"
                        >
                          {formatTime(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
