import { Modal } from "./Modal";
import { type CampListItem } from "../../lib/api";

interface CampDepartmentsModalProps {
  camp: CampListItem | null;
  onClose: () => void;
}

export function CampDepartmentsModal({ camp, onClose }: CampDepartmentsModalProps) {
  const departments = camp?.departments.departments ?? [];

  return (
    <Modal
      open={!!camp}
      onClose={onClose}
      title={camp ? `Departments — ${camp.camp_name}` : "Departments"}
      maxWidthClassName="max-w-md"
    >
      {departments.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No department reports initialized for this camp.
        </p>
      ) : (
        <ul className="space-y-2">
          {departments.map((dept) => (
            <li
              key={dept.slug}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <span className="text-zinc-900">{dept.name}</span>
              <span className="text-zinc-500 font-mono text-xs">{dept.slug}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
