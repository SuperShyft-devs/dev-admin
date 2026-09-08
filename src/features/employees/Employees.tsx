import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2, ShieldCheck } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  employeesApi,
  usersApi,
  type EmployeeListItem,
  type EmployeeCreate,
  type EmployeeUpdate,
  type UserListItem,
  getApiError,
} from "../../lib/api";
import { usePermissions } from "../../contexts/PermissionContext";
import {
  EMPTY_PERMISSIONS,
  PERMISSION_METADATA,
  normalizePermissions,
  normalizeTaskPermissions,
  type PermissionCategory,
  type PermissionLevel,
  type PermissionMap,
  type TaskPermissionMap,
} from "../../auth/permissions";

const STATUS_OPTIONS = ["active", "inactive", "archived"];
const ALWAYS_ACTIVE_EMPLOYEE_ID = 1;
const SEARCH_DEBOUNCE_MS = 300;

type ModalMode = "add" | "edit";

export function Employees() {
  const { canEditTask, isFullAdmin } = usePermissions();
  const mayEditEmployeeStatus = canEditTask("employees", "status");
  const [data, setData] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<string>("employee_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [userPickerSearch, setUserPickerSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [selected, setSelected] = useState<EmployeeListItem | null>(null);
  const [formData, setFormData] = useState<EmployeeCreate>({
    user_id: 0,
    role: "admin",
    status: "active",
  });
  const [submitting, setSubmitting] = useState(false);
  const [configureEmployee, setConfigureEmployee] = useState<EmployeeListItem | null>(null);
  const [permissionEditorOpen, setPermissionEditorOpen] = useState(false);
  const [permissionEditorForForm, setPermissionEditorForForm] = useState(false);
  const [permissionDraft, setPermissionDraft] = useState<PermissionMap>({ ...EMPTY_PERMISSIONS });
  const [taskPermissionDraft, setTaskPermissionDraft] = useState<TaskPermissionMap>({});
  const [configuredTaskCategories, setConfiguredTaskCategories] = useState<Set<PermissionCategory>>(new Set());
  const [expandedTaskCategory, setExpandedTaskCategory] = useState<PermissionCategory | null>(null);
  const [permissionDraftLoaded, setPermissionDraftLoaded] = useState(true);
  const [permissionsVersion, setPermissionsVersion] = useState(1);
  const [permissionLabels, setPermissionLabels] = useState<Record<string, {
    label?: string;
    description?: string;
    tasks?: Array<{ task_key: string; display_name: string; description?: string }>;
  }>>({});
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  const getUserName = useCallback((row: EmployeeListItem) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
    return name || `User ${row.user_id}`;
  }, []);

  const fetchUsersForPicker = useCallback(async (searchQuery: string) => {
    setUsersLoading(true);
    setError(null);
    try {
      const res = await usersApi.list({
        page: 1,
        limit: 50,
        status: "active",
        search: searchQuery.trim() || undefined,
        sort_by: "name",
        sort_dir: "asc",
      });
      setUsers(res.data.data);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sortBy =
        sortKey === "name" ? "first_name" : sortKey === "role" || sortKey === "status" ? sortKey : sortKey;
      const res = await employeesApi.list({
        page,
        limit,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setData(res.data.data);
      setTotal(res.data.meta.total);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, debouncedSearch, sortKey, sortDir]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const openAdd = () => {
    setSelected(null);
    setUserPickerSearch("");
    setFormData({
      user_id: 0,
      role: "admin",
      status: "active",
    });
    setPermissionDraft({ ...EMPTY_PERMISSIONS });
    setTaskPermissionDraft({});
    setConfiguredTaskCategories(new Set());
    setExpandedTaskCategory(null);
    setPermissionDraftLoaded(true);
    setPermissionsVersion(1);
    setModalMode("add");
    setModalOpen(true);
    void fetchUsersForPicker("");
  };

  const openEdit = (row: EmployeeListItem) => {
    setSelected(row);
    setFormData({
      user_id: row.user_id,
      role: row.role ?? "",
      status: row.status ?? "active",
    });
    setPermissionDraft({ ...EMPTY_PERMISSIONS });
    setTaskPermissionDraft({});
    setConfiguredTaskCategories(new Set());
    setExpandedTaskCategory(null);
    setPermissionDraftLoaded(row.role !== "inferior_admin");
    setPermissionsVersion(row.permissions_version ?? 1);
    setModalMode("edit");
    setModalOpen(true);
    if (row.role === "inferior_admin") {
      void employeesApi
        .getPermissions(row.employee_id)
        .then((detail) => {
          setPermissionDraft(normalizePermissions(detail.data.data.permissions));
          const tasks = normalizeTaskPermissions(detail.data.data.permissions);
          setTaskPermissionDraft(tasks);
          setConfiguredTaskCategories(new Set(Object.keys(tasks) as PermissionCategory[]));
          setPermissionsVersion(detail.data.data.version);
          setPermissionDraftLoaded(true);
        })
        .catch((err) => setError(getApiError(err)));
    }
  };

  const handleSubmit = async () => {
    if (!formData.user_id || !formData.role) {
      setError("Please select a user and a role");
      return;
    }
    if (formData.role === "inferior_admin" && !permissionDraftLoaded) {
      setError("Permission configuration is still loading. Please try again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const grants = buildPermissionPayload();
      if (modalMode === "add") {
        await employeesApi.create({
          ...formData,
          permissions: formData.role === "inferior_admin" ? grants : undefined,
        });
      } else if (selected) {
        const payload: EmployeeUpdate = {
          user_id: formData.user_id,
          role: formData.role,
          expected_version:
            formData.role === "inferior_admin" ? permissionsVersion : undefined,
          permissions: formData.role === "inferior_admin" ? grants : undefined,
        };
        await employeesApi.update(selected.employee_id, payload);
      }
      setModalOpen(false);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openConfigure = async (row: EmployeeListItem) => {
    setConfigureEmployee(row);
    setPermissionEditorForForm(false);
    setPermissionEditorOpen(true);
    setExpandedTaskCategory(null);
    setPermissionsLoading(true);
    setError(null);
    try {
      const [catalog, detail] = await Promise.all([
        employeesApi.permissionCatalog(),
        employeesApi.getPermissions(row.employee_id),
      ]);
      setPermissionLabels(Object.fromEntries(
        catalog.data.data.map((item) => [
          item.category_key,
          { label: item.display_name, description: item.description, tasks: item.tasks },
        ])
      ));
      setPermissionDraft(normalizePermissions(detail.data.data.permissions));
      const tasks = normalizeTaskPermissions(detail.data.data.permissions);
      setTaskPermissionDraft(tasks);
      setConfiguredTaskCategories(new Set(Object.keys(tasks) as PermissionCategory[]));
      setPermissionsVersion(detail.data.data.version);
    } catch (err) {
      setError(getApiError(err));
      setConfigureEmployee(null);
      setPermissionEditorOpen(false);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const openFormPermissionEditor = async () => {
    setConfigureEmployee(selected);
    setPermissionEditorForForm(true);
    setPermissionEditorOpen(true);
    setPermissionsLoading(true);
    setError(null);
    try {
      const catalog = await employeesApi.permissionCatalog();
      setPermissionLabels(
        Object.fromEntries(
          catalog.data.data.map((item) => [
            item.category_key,
            { label: item.display_name, description: item.description, tasks: item.tasks },
          ])
        )
      );
      if (modalMode === "edit" && selected?.role === "inferior_admin") {
        const detail = await employeesApi.getPermissions(selected.employee_id);
        setPermissionDraft(normalizePermissions(detail.data.data.permissions));
        const tasks = normalizeTaskPermissions(detail.data.data.permissions);
        setTaskPermissionDraft(tasks);
        setConfiguredTaskCategories(new Set(Object.keys(tasks) as PermissionCategory[]));
        setPermissionsVersion(detail.data.data.version);
        setPermissionDraftLoaded(true);
      }
    } catch (err) {
      setError(getApiError(err));
      setPermissionEditorOpen(false);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const setPermission = (category: PermissionCategory, field: "view" | "edit", checked: boolean) => {
    setPermissionDraft((current) => {
      const level = current[category];
      const nextView = field === "view" ? checked : checked || level !== "none";
      const nextEdit = field === "edit" ? checked : checked ? level === "edit" : false;
      return { ...current, [category]: nextEdit ? "edit" : nextView ? "view" : "none" };
    });
    setConfiguredTaskCategories((current) => {
      const next = new Set(current);
      next.delete(category);
      return next;
    });
    setTaskPermissionDraft((current) => {
      const next = { ...current };
      delete next[category];
      return next;
    });
  };

  const setTaskPermission = (
    category: PermissionCategory,
    taskKey: string,
    field: "view" | "edit",
    checked: boolean
  ) => {
    const catalog = permissionLabels[category]?.tasks ?? [];
    setTaskPermissionDraft((current) => {
      const categoryLevel = permissionDraft[category];
      const existing = current[category] ?? Object.fromEntries(
        catalog.map((task) => [task.task_key, categoryLevel])
      );
      const currentLevel = existing[taskKey] ?? categoryLevel;
      const nextView = field === "view" ? checked : checked || currentLevel !== "none";
      const nextEdit = field === "edit" ? checked : checked ? currentLevel === "edit" : false;
      const updated = {
        ...existing,
        [taskKey]: nextEdit ? "edit" : nextView ? "view" : "none",
      } as Record<string, PermissionLevel>;
      const levels = Object.values(updated);
      setPermissionDraft((permissions) => ({
        ...permissions,
        [category]: levels.some((level) => level === "edit")
          ? "edit"
          : levels.some((level) => level === "view")
            ? "view"
            : "none",
      }));
      return { ...current, [category]: updated };
    });
    setConfiguredTaskCategories((current) => new Set(current).add(category));
  };

  const buildPermissionPayload = () =>
    PERMISSION_METADATA.map(({ key }) => ({
      category_key: key,
      can_view: permissionDraft[key] !== "none",
      can_edit: permissionDraft[key] === "edit",
      tasks: configuredTaskCategories.has(key)
        ? Object.entries(taskPermissionDraft[key] ?? {}).map(([task_key, level]) => ({
            task_key,
            can_view: level !== "none",
            can_edit: level === "edit",
          }))
        : undefined,
    }));

  const savePermissions = async () => {
    if (permissionEditorForForm) {
      setPermissionEditorOpen(false);
      return;
    }
    if (!configureEmployee) return;
    setPermissionsSaving(true);
    setError(null);
    try {
      const response = await employeesApi.updatePermissions(configureEmployee.employee_id, {
        expected_version: permissionsVersion,
        permissions: buildPermissionPayload(),
      });
      setPermissionsVersion(response.data.data.version);
      setConfigureEmployee(null);
      setPermissionEditorOpen(false);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setPermissionsSaving(false);
    }
  };

  const columns: Column<EmployeeListItem>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-zinc-900">{getUserName(row)}</span>
        </div>
      ),
    },
    { key: "role", label: "Role", sortable: true, hideOnMobile: true },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => {
        const isProtectedEmployee = row.employee_id === ALWAYS_ACTIVE_EMPLOYEE_ID;
        const isActive = isProtectedEmployee || (row.status ?? "").toLowerCase() === "active";
        return (
          <button
            type="button"
            disabled={isProtectedEmployee || !mayEditEmployeeStatus}
            onClick={(event) => {
              event.stopPropagation();
              if (isProtectedEmployee || !mayEditEmployeeStatus) {
                return;
              }
              const nextStatus = isActive ? "inactive" : "active";
              employeesApi
                .updateStatus(row.employee_id, nextStatus)
                .then(() => fetchList())
                .catch((err) => setError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition disabled:cursor-not-allowed disabled:opacity-80 ${
              isActive ? "bg-emerald-500" : "bg-zinc-300"
            }`}
            aria-pressed={isActive}
            aria-label={
              isProtectedEmployee
                ? `${getUserName(row)} is always active`
                : `Set ${getUserName(row)} ${isActive ? "inactive" : "active"}`
            }
          >
            <span
              className={`h-5 w-5 bg-white rounded-full shadow transform transition translate-x-0.5 ${
                isActive ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        );
      },
    },
  ];

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Employees</h1>
        {isFullAdmin && <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Add Employee</span>
        </button>}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={data}
            keyExtractor={(r) => r.employee_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onEdit={isFullAdmin ? openEdit : undefined}
            renderExtraMenuItems={isFullAdmin ? (row, closeMenu) => row.role === "inferior_admin" ? (
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  void openConfigure(row);
                }}
                className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" /> Manage access
              </button>
            ) : null : undefined}
            pagination={{
              page,
              limit,
              total,
              onPageChange: setPage,
            }}
          />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "add" ? "Add Employee" : "Edit Employee"}
        maxWidthClassName="max-w-xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">User *</label>
            {modalMode === "add" && (
              <input
                type="search"
                value={userPickerSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  setUserPickerSearch(value);
                  void fetchUsersForPicker(value);
                }}
                placeholder="Search users by name, phone, or email..."
                className="w-full mb-2 px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            )}
            <select
              value={formData.user_id}
              onChange={(e) => setFormData({ ...formData, user_id: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              required
              disabled={modalMode === "edit" || usersLoading}
            >
              <option value={0}>Select user</option>
              {users.map((user) => {
                const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
                return (
                  <option key={user.user_id} value={user.user_id}>
                    {name || user.email || `User ${user.user_id}`} (#{user.user_id})
                  </option>
                );
              })}
            </select>
            {usersLoading && (
              <p className="mt-1 text-xs text-zinc-500">Loading users...</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Role *</label>
            <select
              value={formData.role}
              onChange={(e) => {
                const role = e.target.value;
                setFormData({ ...formData, role });
                if (role !== "inferior_admin") {
                  setPermissionDraft({ ...EMPTY_PERMISSIONS });
                  setTaskPermissionDraft({});
                  setConfiguredTaskCategories(new Set());
                  setPermissionDraftLoaded(true);
                } else if (selected?.role !== "inferior_admin") {
                  setPermissionDraft({ ...EMPTY_PERMISSIONS });
                  setTaskPermissionDraft({});
                  setConfiguredTaskCategories(new Set());
                  setPermissionDraftLoaded(true);
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              required
            >
              <option value="admin">Admin</option>
              <option value="inferior_admin">Inferior Admin</option>
              <option value="onboarding_assistant">Onboarding Assistant</option>
              <option value="organization_manager">Organization Manager</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          {formData.role === "inferior_admin" && (
            <div className="rounded-lg border border-zinc-200 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-800">Access permissions</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {Object.values(permissionDraft).filter((level) => level !== "none").length} of{" "}
                  {PERMISSION_METADATA.length} categories configured
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openFormPermissionEditor()}
                className="px-3 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Manage access
              </button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !permissionDraftLoaded}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Saving..." : modalMode === "add" ? "Create" : "Update"}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={permissionEditorOpen}
        onClose={() => {
          if (!permissionsSaving) {
            setPermissionEditorOpen(false);
            setConfigureEmployee(null);
          }
        }}
        title={`Manage access${configureEmployee ? ` — ${getUserName(configureEmployee)}` : ""}`}
        maxWidthClassName="max-w-3xl"
      >
        {permissionsLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">
              View permits read-only access. Edit also enables View. Use Configure to assign only specific tasks.
            </p>
            <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100 max-h-[55vh] overflow-y-auto">
              {PERMISSION_METADATA.map((metadata) => {
                const copy = permissionLabels[metadata.key] ?? metadata;
                const level = permissionDraft[metadata.key];
                const tasks = "tasks" in copy ? copy.tasks ?? [] : [];
                const expanded = expandedTaskCategory === metadata.key;
                const custom = configuredTaskCategories.has(metadata.key);
                return (
                  <div key={metadata.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-800">{copy.label ?? metadata.label}</p>
                        {custom && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">{copy.description ?? metadata.description}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-zinc-600">
                      <input
                        type="checkbox"
                        checked={level !== "none"}
                        onChange={(event) => setPermission(metadata.key, "view", event.target.checked)}
                      />
                      View
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-600">
                      <input
                        type="checkbox"
                        checked={level === "edit"}
                        onChange={(event) => setPermission(metadata.key, "edit", event.target.checked)}
                      />
                      Edit
                    </label>
                    <button
                      type="button"
                      onClick={() => setExpandedTaskCategory(expanded ? null : metadata.key)}
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {expanded ? "Close" : "Configure"}
                    </button>
                    {expanded && (
                      <div className="col-span-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                        {tasks.length === 0 && (
                          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Task catalog unavailable. Restart the backend and reopen Manage access.
                          </p>
                        )}
                        {tasks.map((task) => {
                          const taskLevel =
                            taskPermissionDraft[metadata.key]?.[task.task_key] ?? level;
                          return (
                            <div
                              key={task.task_key}
                              className="grid grid-cols-[1fr_auto_auto] gap-4 items-center rounded-md bg-white px-3 py-2 border border-zinc-100"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-zinc-800">{task.display_name}</p>
                                {task.description && (
                                  <p className="text-[11px] text-zinc-500">{task.description}</p>
                                )}
                              </div>
                              <label className="flex items-center gap-2 text-xs text-zinc-600">
                                <input
                                  type="checkbox"
                                  checked={taskLevel !== "none"}
                                  onChange={(event) =>
                                    setTaskPermission(metadata.key, task.task_key, "view", event.target.checked)
                                  }
                                />
                                View
                              </label>
                              <label className="flex items-center gap-2 text-xs text-zinc-600">
                                <input
                                  type="checkbox"
                                  checked={taskLevel === "edit"}
                                  onChange={(event) =>
                                    setTaskPermission(metadata.key, task.task_key, "edit", event.target.checked)
                                  }
                                />
                                Edit
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPermissionEditorOpen(false);
                  setConfigureEmployee(null);
                }}
                disabled={permissionsSaving}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePermissions()}
                disabled={permissionsSaving}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {permissionsSaving ? "Saving…" : "Save access"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
