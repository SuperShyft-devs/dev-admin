import { describe, expect, it } from "vitest";
import {
  PERMISSION_CATEGORIES,
  categoryForPath,
  normalizePermissions,
  normalizeTaskPermissions,
  permissionForRole,
} from "./permissions";

describe("RBAC permission contracts", () => {
  it("uses the exact backend category catalog", () => {
    expect(PERMISSION_CATEGORIES).toEqual([
      "users", "organizations", "engagements", "engagement_console",
      "assessments", "diagnostics", "reports", "experts",
      "payments_bookings", "notifications", "checklists_tasks", "support",
      "employees", "platform_settings", "system_monitoring",
    ]);
  });

  it("normalizes permissions and enforces edit-implies-view", () => {
    const permissions = normalizePermissions({
      users: { view: false, edit: true },
      support: "view",
      unknown_category: "edit",
    });
    expect(permissions.users).toBe("edit");
    expect(permissions.support).toBe("view");
    expect(Object.keys(permissions)).toHaveLength(15);
  });

  it("normalizes the permissions envelope returned by users/me", () => {
    const permissions = normalizePermissions({
      version: 3,
      categories: {
        users: { can_view: true, can_edit: false },
        reports: { can_view: true, can_edit: true },
      },
    });
    expect(permissions.users).toBe("view");
    expect(permissions.reports).toBe("edit");
  });

  it("normalizes nested task permissions from profile and management responses", () => {
    const profileTasks = normalizeTaskPermissions({
      categories: {
        users: {
          can_view: true,
          can_edit: true,
          tasks: {
            directory: { can_view: true, can_edit: false },
            profiles: { can_view: true, can_edit: true },
          },
        },
      },
    });
    expect(profileTasks.users).toEqual({ directory: "view", profiles: "edit" });

    const managementTasks = normalizeTaskPermissions([
      {
        category_key: "reports",
        tasks: [{ task_key: "camp_reports", can_view: true, can_edit: false }],
      },
    ]);
    expect(managementTasks.reports).toEqual({ camp_reports: "view" });
  });

  it("restricts only inferior admins and preserves existing roles", () => {
    const permissions = normalizePermissions({ users: "view" });
    expect(permissionForRole("inferior_admin", permissions, "users")).toBe("view");
    expect(permissionForRole("inferior_admin", permissions, "employees")).toBe("none");
    expect(permissionForRole("organization_manager", permissions, "employees")).toBe("edit");
  });

  it("maps report and console routes before their broader parents", () => {
    expect(categoryForPath("/organisations/camps/12/reports")).toBe("reports");
    expect(categoryForPath("/engagements/55/console")).toBe("engagement_console");
    expect(categoryForPath("/engagements")).toBe("engagements");
  });
});
