import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
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

const STATUS_OPTIONS = ["active", "inactive", "archived"];
const ALWAYS_ACTIVE_EMPLOYEE_ID = 1;

type ModalMode = "add" | "edit";

export function Employees() {
  const [data, setData] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
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
        search: search.trim() || undefined,
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
  }, [page, limit, statusFilter, search, sortKey, sortDir]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const openAdd = () => {
    setSelected(null);
    setUserPickerSearch("");
    setFormData({
      user_id: 0,
      role: "admin",
      status: "active",
    });
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
    setModalMode("edit");
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.user_id || !formData.role) {
      setError("Please select a user and a role");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (modalMode === "add") {
        await employeesApi.create(formData);
      } else if (selected) {
        const payload: EmployeeUpdate = {
          user_id: formData.user_id,
          role: formData.role,
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
            disabled={isProtectedEmployee}
            onClick={(event) => {
              event.stopPropagation();
              if (isProtectedEmployee) {
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
        <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Add Employee</span>
        </button>
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
            onEdit={openEdit}
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
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              required
            >
              <option value="admin">Admin</option>
              <option value="onboarding_assistant">Onboarding Assistant</option>
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
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
    </div>
  );
}
