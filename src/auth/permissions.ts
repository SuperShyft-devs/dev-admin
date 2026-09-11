export const PERMISSION_CATEGORIES = [
  "users",
  "organizations",
  "engagements",
  "engagement_console",
  "assessments",
  "diagnostics",
  "reports",
  "experts",
  "payments_bookings",
  "notifications",
  "checklists_tasks",
  "support",
  "employees",
  "partners",
  "platform_settings",
  "system_monitoring",
] as const;

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];
export type PermissionLevel = "none" | "view" | "edit";
export type EmployeeRole =
  | "admin"
  | "inferior_admin"
  | "onboarding_assistant"
  | "organization_manager"
  | "expert";

export type PartnerRole = "phlebo" | "expert" | "organization_manager";

export interface CategoryPermission {
  category: PermissionCategory;
  view: boolean;
  edit: boolean;
}

export const PERMISSION_METADATA: ReadonlyArray<{
  key: PermissionCategory;
  label: string;
  description: string;
}> = [
  { key: "users", label: "Users", description: "User records and participant journeys" },
  { key: "organizations", label: "Organizations", description: "Organizations, camps and contacts" },
  { key: "engagements", label: "Engagements", description: "Engagement setup and administration" },
  { key: "engagement_console", label: "Engagement Console", description: "Operational engagement console" },
  { key: "assessments", label: "Assessments", description: "Assessment packages, categories and questions" },
  { key: "diagnostics", label: "Diagnostics", description: "Diagnostic packages, groups and tests" },
  { key: "reports", label: "Reports", description: "Camp and participant reports" },
  { key: "experts", label: "Experts", description: "Experts, types and consultations" },
  { key: "payments_bookings", label: "Payments & Bookings", description: "Payment and booking records" },
  { key: "notifications", label: "Notifications", description: "Notifications, services and events" },
  { key: "checklists_tasks", label: "Checklists & Tasks", description: "Checklist templates and task administration" },
  { key: "support", label: "Support", description: "Support tickets" },
  { key: "employees", label: "Employees", description: "Employee directory" },
  { key: "partners", label: "Partners", description: "Phlebo, expert, and organization manager partners" },
  { key: "platform_settings", label: "Platform Settings", description: "Platform-level configuration" },
  { key: "system_monitoring", label: "System Monitoring", description: "Server health and monitoring" },
] as const;

export type PermissionMap = Record<PermissionCategory, PermissionLevel>;
export type TaskPermissionMap = Partial<
  Record<PermissionCategory, Record<string, PermissionLevel>>
>;

export const EMPTY_PERMISSIONS = Object.fromEntries(
  PERMISSION_CATEGORIES.map((key) => [key, "none"])
) as PermissionMap;

export function normalizePermissions(value: unknown): PermissionMap {
  const result = { ...EMPTY_PERMISSIONS };
  if (!value) return result;

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "categories" in value
  ) {
    value = (value as { categories?: unknown }).categories;
  }

  const apply = (category: unknown, raw: unknown) => {
    if (!PERMISSION_CATEGORIES.includes(category as PermissionCategory)) return;
    let level: PermissionLevel = "none";
    if (typeof raw === "string" && ["none", "view", "edit"].includes(raw)) {
      level = raw as PermissionLevel;
    } else if (typeof raw === "boolean") {
      level = raw ? "view" : "none";
    } else if (raw && typeof raw === "object") {
      const record = raw as Record<string, unknown>;
      level = record.edit || record.can_edit
        ? "edit"
        : record.view || record.can_view
          ? "view"
          : "none";
    }
    result[category as PermissionCategory] = level;
  };

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (typeof entry === "string") apply(entry, "view");
      else if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        apply(record.category ?? record.key ?? record.category_key, record.level ?? record.access ?? record);
      }
    });
  } else if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => apply(key, raw));
  }
  return result;
}

export function normalizeTaskPermissions(value: unknown): TaskPermissionMap {
  if (Array.isArray(value)) {
    const result: TaskPermissionMap = {};
    value.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const record = entry as Record<string, unknown>;
      const category = record.category_key ?? record.category;
      if (!PERMISSION_CATEGORIES.includes(category as PermissionCategory)) return;
      if (!Array.isArray(record.tasks)) return;
      result[category as PermissionCategory] = Object.fromEntries(
        record.tasks
          .filter((task): task is Record<string, unknown> => !!task && typeof task === "object")
          .map((task) => {
            const taskKey = String(task.task_key ?? "");
            const level: PermissionLevel = task.edit || task.can_edit
              ? "edit"
              : task.view || task.can_view
                ? "view"
                : "none";
            return [taskKey, level];
          })
          .filter(([taskKey]) => Boolean(taskKey))
      );
    });
    return result;
  }
  if (!value || typeof value !== "object") return {};
  const envelope = "categories" in value
    ? (value as { categories?: unknown }).categories
    : value;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return {};

  const result: TaskPermissionMap = {};
  Object.entries(envelope as Record<string, unknown>).forEach(([category, raw]) => {
    if (!PERMISSION_CATEGORIES.includes(category as PermissionCategory)) return;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const tasks = (raw as { tasks?: unknown }).tasks;
    if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) return;
    const normalized: Record<string, PermissionLevel> = {};
    Object.entries(tasks as Record<string, unknown>).forEach(([taskKey, taskRaw]) => {
      if (!taskRaw || typeof taskRaw !== "object" || Array.isArray(taskRaw)) return;
      const record = taskRaw as Record<string, unknown>;
      normalized[taskKey] = record.edit || record.can_edit
        ? "edit"
        : record.view || record.can_view
          ? "view"
          : "none";
    });
    result[category as PermissionCategory] = normalized;
  });
  return result;
}

export function permissionForRole(
  role: EmployeeRole | null,
  permissions: PermissionMap,
  category: PermissionCategory
): PermissionLevel {
  // Existing role behavior is intentionally unchanged; category restrictions only
  // apply to inferior admins.
  return role === "inferior_admin" ? permissions[category] : role ? "edit" : "none";
}

export function categoryForPath(pathname: string): PermissionCategory | null {
  if (pathname.startsWith("/users")) return "users";
  if (pathname.includes("/reports")) return "reports";
  if (pathname.startsWith("/organisations")) return "organizations";
  if (pathname === "/engagements/console" || /\/engagements\/[^/]+\/console/.test(pathname)) return "engagement_console";
  if (pathname.startsWith("/engagements")) return "engagements";
  if (pathname.startsWith("/assess")) return "assessments";
  if (pathname.startsWith("/diagnostics") || pathname.startsWith("/library/health-metrics")) return "diagnostics";
  if (pathname.startsWith("/experts")) return "experts";
  if (pathname.startsWith("/payments")) return "payments_bookings";
  if (pathname.startsWith("/notifications")) return "notifications";
  if (pathname.startsWith("/checklists")) return "checklists_tasks";
  if (pathname.startsWith("/support")) return "support";
  if (pathname.startsWith("/employees")) return "employees";
  if (pathname.startsWith("/partners")) return "partners";
  if (pathname.startsWith("/settings")) return "platform_settings";
  if (pathname.startsWith("/server")) return "system_monitoring";
  return null;
}
