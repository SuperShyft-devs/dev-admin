/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {
  EMPTY_PERMISSIONS,
  normalizePermissions,
  normalizeTaskPermissions,
  permissionForRole,
  type PermissionCategory,
  type PermissionLevel,
  type PermissionMap,
  type TaskPermissionMap,
} from "../auth/permissions";

interface PermissionContextValue {
  permissions: PermissionMap;
  level: (category: PermissionCategory) => PermissionLevel;
  canView: (category: PermissionCategory) => boolean;
  canEdit: (category: PermissionCategory) => boolean;
  taskPermissions: TaskPermissionMap;
  canViewTask: (category: PermissionCategory, taskKey: string) => boolean;
  canEditTask: (category: PermissionCategory, taskKey: string) => boolean;
  hasAnyAccess: boolean;
  isFullAdmin: boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { employeeRole, userProfile } = useAuth();
  const permissions = useMemo(
    () => normalizePermissions(userProfile?.employee?.permissions),
    [userProfile?.employee?.permissions]
  );
  const taskPermissions = useMemo(
    () => normalizeTaskPermissions(userProfile?.employee?.permissions),
    [userProfile?.employee?.permissions]
  );
  const level = useCallback(
    (category: PermissionCategory) => permissionForRole(employeeRole, permissions, category),
    [employeeRole, permissions]
  );
  const canView = useCallback(
    (category: PermissionCategory) => level(category) !== "none",
    [level]
  );
  const canEdit = useCallback(
    (category: PermissionCategory) => {
      if (employeeRole === "inferior_admin" && taskPermissions[category]) {
        const levels = Object.values(taskPermissions[category] ?? {});
        return levels.length > 0 && levels.every((item) => item === "edit");
      }
      return level(category) === "edit";
    },
    [employeeRole, level, taskPermissions]
  );
  const taskLevel = useCallback(
    (category: PermissionCategory, taskKey: string) => {
      if (employeeRole !== "inferior_admin") return employeeRole ? "edit" : "none";
      const configuredTasks = taskPermissions[category];
      return configuredTasks ? configuredTasks[taskKey] ?? "none" : level(category);
    },
    [employeeRole, level, taskPermissions]
  );
  const canViewTask = useCallback(
    (category: PermissionCategory, taskKey: string) =>
      taskLevel(category, taskKey) !== "none",
    [taskLevel]
  );
  const canEditTask = useCallback(
    (category: PermissionCategory, taskKey: string) =>
      taskLevel(category, taskKey) === "edit",
    [taskLevel]
  );

  const value = useMemo<PermissionContextValue>(
    () => ({
      permissions: employeeRole ? permissions : EMPTY_PERMISSIONS,
      level,
      canView,
      canEdit,
      taskPermissions,
      canViewTask,
      canEditTask,
      hasAnyAccess: employeeRole !== "inferior_admin" || Object.values(permissions).some((item) => item !== "none"),
      isFullAdmin: employeeRole === "admin",
    }),
    [canEdit, canEditTask, canView, canViewTask, employeeRole, level, permissions, taskPermissions]
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) throw new Error("usePermissions must be used within PermissionProvider");
  return context;
}

export function PermissionGate({
  category,
  taskKey,
  action = "view",
  children,
  fallback = null,
}: {
  category: PermissionCategory;
  taskKey?: string;
  action?: "view" | "edit";
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { canView, canEdit, canViewTask, canEditTask } = usePermissions();
  const allowed = taskKey
    ? action === "edit"
      ? canEditTask(category, taskKey)
      : canViewTask(category, taskKey)
    : action === "edit"
      ? canEdit(category)
      : canView(category);
  return <>{allowed ? children : fallback}</>;
}
