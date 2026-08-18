import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { UserMultiSearchPicker } from "./UserMultiSearchPicker";
import type { CityContactAssignments, ContactPersonUserIds } from "../../lib/api";

type DepartmentOption = {
  slug: string;
  name: string;
};

type OrganizationContactPersonsEditorProps = {
  value: ContactPersonUserIds | null | undefined;
  onChange: (value: ContactPersonUserIds | null) => void;
  departments: DepartmentOption[];
  engagementCities: string[];
  disabled?: boolean;
};

function normalizeValue(value: ContactPersonUserIds | null | undefined): ContactPersonUserIds {
  if (!value || typeof value !== "object") {
    return { organization_managers: [] };
  }
  const organizationManagers = Array.isArray(value.organization_managers)
    ? value.organization_managers.filter((id) => typeof id === "number" && id > 0)
    : [];
  const next: ContactPersonUserIds = { organization_managers: organizationManagers };
  for (const [key, raw] of Object.entries(value)) {
    if (key === "organization_managers" || !raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const managers = Array.isArray(raw.managers)
      ? raw.managers.filter((id) => typeof id === "number" && id > 0)
      : [];
    const cityPayload: CityContactAssignments = { managers };
    for (const [deptKey, deptIds] of Object.entries(raw)) {
      if (deptKey === "managers" || !Array.isArray(deptIds)) continue;
      cityPayload[deptKey] = deptIds.filter((id) => typeof id === "number" && id > 0);
    }
    next[key] = cityPayload;
  }
  return next;
}

function cityHasAssignments(payload: CityContactAssignments | undefined): boolean {
  if (!payload) return false;
  if (payload.managers?.length) return true;
  return Object.entries(payload).some(
    ([key, ids]) => key !== "managers" && Array.isArray(ids) && ids.length > 0
  );
}

function serializeValue(
  value: ContactPersonUserIds,
  engagementCities: string[],
): ContactPersonUserIds | null {
  const normalized = normalizeValue(value);
  const allowedCities = new Set(engagementCities);

  const next: ContactPersonUserIds = {
    organization_managers: normalized.organization_managers,
  };

  for (const city of engagementCities) {
    const payload = normalized[city];
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    if (!cityHasAssignments(payload as CityContactAssignments)) continue;
    next[city] = payload;
  }

  for (const [city, raw] of Object.entries(normalized)) {
    if (city === "organization_managers" || allowedCities.has(city)) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    if (!cityHasAssignments(raw as CityContactAssignments)) continue;
    next[city] = raw;
  }

  const hasOrgManagers = next.organization_managers.length > 0;
  const hasCityAssignments = Object.keys(next).some(
    (key) =>
      key !== "organization_managers" &&
      cityHasAssignments(next[key] as CityContactAssignments),
  );

  if (!hasOrgManagers && !hasCityAssignments) return null;
  return next;
}

export function OrganizationContactPersonsEditor({
  value,
  onChange,
  departments,
  engagementCities,
  disabled = false,
}: OrganizationContactPersonsEditorProps) {
  const normalized = useMemo(() => normalizeValue(value), [value]);
  const sortedCities = useMemo(
    () => [...engagementCities].sort((a, b) => a.localeCompare(b)),
    [engagementCities],
  );
  const [expandedCities, setExpandedCities] = useState<Record<string, boolean>>({});

  const updateValue = (next: ContactPersonUserIds) => {
    onChange(serializeValue(next, engagementCities));
  };

  const setOrgManagers = (userIds: number[]) => {
    updateValue({ ...normalized, organization_managers: userIds });
  };

  const ensureCityPayload = (city: string): CityContactAssignments => {
    const existing = normalized[city];
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      return existing as CityContactAssignments;
    }
    return { managers: [] };
  };

  const setCityManagers = (city: string, userIds: number[]) => {
    const cityPayload = { ...ensureCityPayload(city), managers: userIds };
    updateValue({ ...normalized, [city]: cityPayload });
  };

  const setDepartmentManagers = (city: string, slug: string, userIds: number[]) => {
    const cityPayload = { ...ensureCityPayload(city), [slug]: userIds };
    updateValue({ ...normalized, [city]: cityPayload });
  };

  const isCityExpanded = (city: string) => expandedCities[city] ?? sortedCities.length <= 2;

  return (
    <div className="space-y-5 md:col-span-2 rounded-xl border border-zinc-200 p-4 bg-zinc-50/50">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Who can manage this organization?</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Assign people who should access camps, console, and reports. Leave empty if not needed yet.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3">
        <h4 className="text-sm font-medium text-zinc-900">Full organization access</h4>
        <p className="text-xs text-zinc-500 mt-1">
          These users can see every camp, city, and department in this organization.
        </p>
        <div className="mt-3">
          <UserMultiSearchPicker
            label="Organization managers"
            value={normalized.organization_managers}
            onChange={setOrgManagers}
            disabled={disabled}
            placeholder="Search and add users…"
          />
        </div>
      </div>

      {sortedCities.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <h4 className="text-sm font-medium text-zinc-900">Limited access by city</h4>
          <p className="text-xs text-zinc-500 mt-1">
            Optional. Cities below come from this organization&apos;s engagements. Assign people who
            should only see specific cities or departments.
          </p>

          <div className="mt-3 space-y-2">
            {sortedCities.map((city) => {
              const payload = ensureCityPayload(city);
              const expanded = isCityExpanded(city);
              const hasAssignments = cityHasAssignments(payload);

              return (
                <div key={city} className="rounded-lg border border-zinc-200 overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 bg-zinc-50 text-left hover:bg-zinc-100/80"
                    onClick={() =>
                      setExpandedCities((prev) => ({ ...prev, [city]: !expanded }))
                    }
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
                      {expanded ? (
                        <ChevronDown className="w-4 h-4 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 shrink-0" />
                      )}
                      {city}
                    </span>
                    {hasAssignments ? (
                      <span className="text-xs text-zinc-500 shrink-0">Assigned</span>
                    ) : (
                      <span className="text-xs text-zinc-400 shrink-0">No one assigned</span>
                    )}
                  </button>

                  {expanded ? (
                    <div className="p-3 space-y-4 border-t border-zinc-200">
                      <UserMultiSearchPicker
                        label={`All departments in ${city}`}
                        value={payload.managers ?? []}
                        onChange={(ids) => setCityManagers(city, ids)}
                        disabled={disabled}
                        placeholder="Search and add users…"
                      />

                      {departments.length > 0 ? (
                        <div className="space-y-3 pt-1 border-t border-dashed border-zinc-200">
                          <p className="text-xs font-medium text-zinc-600">Or limit to one department</p>
                          {departments.map((dept) => (
                            <UserMultiSearchPicker
                              key={`${city}-${dept.slug}`}
                              label={`${dept.name} only (${city})`}
                              value={
                                Array.isArray(payload[dept.slug])
                                  ? (payload[dept.slug] as number[])
                                  : []
                              }
                              onChange={(ids) => setDepartmentManagers(city, dept.slug, ids)}
                              disabled={disabled}
                              placeholder="Search and add users…"
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          Add departments on this form to enable department-level access for {city}.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex gap-2 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-3 text-xs text-zinc-600">
          <Info className="w-4 h-4 shrink-0 text-zinc-400 mt-0.5" />
          <p>
            City and department managers can be assigned after this organization has engagements.
            Create the organization first, add engagements with cities, then edit this organization to
            assign scoped access.
          </p>
        </div>
      )}
    </div>
  );
}

export function summarizeContactPersonUserIds(
  value: ContactPersonUserIds | null | undefined,
  formatUser: (userId: number) => string,
  departments?: DepartmentOption[],
): string[] {
  const normalized = normalizeValue(value ?? null);
  const deptNames = new Map((departments ?? []).map((d) => [d.slug, d.name]));
  const lines: string[] = [];

  if (normalized.organization_managers.length) {
    lines.push(
      `Organization-wide: ${normalized.organization_managers.map(formatUser).join(", ")}`,
    );
  }

  for (const city of Object.keys(normalized).filter((key) => key !== "organization_managers")) {
    const payload = normalized[city];
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const parts: string[] = [];
    if (payload.managers?.length) {
      parts.push(`All depts: ${payload.managers.map(formatUser).join(", ")}`);
    }
    for (const [key, ids] of Object.entries(payload)) {
      if (key === "managers" || !Array.isArray(ids) || !ids.length) continue;
      const label = deptNames.get(key) ?? key;
      parts.push(`${label}: ${ids.map(formatUser).join(", ")}`);
    }
    if (parts.length) {
      lines.push(`${city} — ${parts.join(" · ")}`);
    }
  }

  return lines;
}
