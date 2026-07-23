import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { type CampListItem, getApiError } from "../../lib/api";
import { listAllEngagementsForCamp } from "./listAllEngagementsForCamp";

interface CampCitiesModalProps {
  camp: CampListItem | null;
  onClose: () => void;
}

interface CityCount {
  city: string;
  engagement_count: number;
}

export function CampCitiesModal({ camp, onClose }: CampCitiesModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cities, setCities] = useState<CityCount[]>([]);

  useEffect(() => {
    if (!camp) {
      setCities([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    listAllEngagementsForCamp(camp.camp_no)
      .then((rows) => {
        if (cancelled) return;
        const counts = new Map<string, CityCount>();
        for (const row of rows) {
          const raw = (row.city ?? "").trim();
          if (!raw) continue;
          const key = raw.toLowerCase();
          const existing = counts.get(key);
          if (existing) {
            existing.engagement_count += 1;
          } else {
            counts.set(key, { city: raw, engagement_count: 1 });
          }
        }
        setCities(
          Array.from(counts.values()).sort((a, b) => a.city.localeCompare(b.city))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getApiError(err));
        setCities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [camp]);

  return (
    <Modal
      open={!!camp}
      onClose={onClose}
      title={camp ? `Cities — ${camp.camp_name}` : "Cities"}
      maxWidthClassName="max-w-md"
    >
      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      ) : cities.length === 0 ? (
        <p className="text-sm text-zinc-600">No cities found on engagements for this camp.</p>
      ) : (
        <ul className="space-y-2">
          {cities.map((item) => (
            <li
              key={item.city.toLowerCase()}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <span className="text-zinc-900">{item.city}</span>
              <span className="text-zinc-500 text-xs">
                {item.engagement_count} engagement{item.engagement_count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
