import type { ReactNode } from "react";

export function formatEngagementStatusLabel(status?: string | null): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "running") return "Running";
  if (normalized === "completed") return "Completed";
  return status ?? "—";
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-xs font-medium text-zinc-500 mb-0.5">{label}</div>
      <div className="text-zinc-900">{children ?? "—"}</div>
    </div>
  );
}

export function isB2BEngagement(organizationId?: number | null): boolean {
  return organizationId != null && organizationId > 0;
}
