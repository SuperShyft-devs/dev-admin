import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { organizationsApi, type CampListItem, getApiError } from "../../lib/api";

interface CampDepartmentsModalProps {
  camp: CampListItem | null;
  onClose: () => void;
}

export function CampDepartmentsModal({ camp, onClose }: CampDepartmentsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ department: string; slug: string }[]>([]);

  useEffect(() => {
    if (!camp) {
      setDepartments([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    organizationsApi
      .get(camp.organization_id)
      .then((res) => {
        if (cancelled) return;
        setDepartments(res.data.data.departments ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getApiError(err));
        setDepartments([]);
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
      title={camp ? `Departments — ${camp.camp_name}` : "Departments"}
      maxWidthClassName="max-w-md"
    >
      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      ) : departments.length === 0 ? (
        <p className="text-sm text-zinc-600">No departments configured for this organization.</p>
      ) : (
        <ul className="space-y-2">
          {departments.map((dept) => (
            <li
              key={dept.slug}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <span className="text-zinc-900">{dept.department}</span>
              <span className="text-zinc-500 font-mono text-xs">{dept.slug}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
