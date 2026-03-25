import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { checklistTasksApi, getApiError, type MyTask } from "../../lib/api";

type TabFilter = "" | "pending" | "done";

function formatDueDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dueDateToInput(value?: string | null): string {
  if (!value) return "";
  const s = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function isOverdue(due?: string | null, status?: string) {
  if (!due || (status ?? "").toLowerCase() === "done") return false;
  const end = new Date(due);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end < today;
}

export function MyTasks() {
  const [data, setData] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>("");
  const [sortKey, setSortKey] = useState<string>("task_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [editRow, setEditRow] = useState<MyTask | null>(null);
  const [editDue, setEditDue] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await checklistTasksApi.myTasks({
        status: tab || undefined,
      });
      setData(res.data.data);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  const sorted = [...data].sort((a, b) => {
    const ak = a[sortKey as keyof MyTask];
    const bk = b[sortKey as keyof MyTask];
    const aVal = ak == null ? "" : String(ak);
    const bVal = bk == null ? "" : String(bk);
    const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleStatus = async (row: MyTask) => {
    const next = (row.status ?? "").toLowerCase() === "done" ? "pending" : "done";
    setUpdatingId(row.task_id);
    setError(null);
    try {
      await checklistTasksApi.updateStatus(row.task_id, { status: next });
      await fetchTasks();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const openEdit = (row: MyTask) => {
    setEditRow(row);
    setEditDue(dueDateToInput(row.due_date));
    setEditNotes(row.notes ?? "");
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await checklistTasksApi.update(editRow.task_id, {
        notes: editNotes.trim() ? editNotes.trim() : null,
        due_date: editDue.trim() ? editDue.trim() : null,
      });
      setEditRow(null);
      await fetchTasks();
    } catch (err) {
      setEditError(getApiError(err));
    } finally {
      setEditSaving(false);
    }
  };

  const columns: Column<MyTask>[] = [
    {
      key: "item_title",
      label: "Task",
      sortable: true,
      render: (r) => <span className="font-medium text-zinc-900">{r.item_title}</span>,
    },
    {
      key: "status",
      label: "Done",
      sortable: true,
      className: "w-14 text-center",
      render: (r) => {
        const done = (r.status ?? "").toLowerCase() === "done";
        const busy = updatingId === r.task_id;
        return (
          <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" aria-hidden />
            ) : (
              <input
                type="checkbox"
                checked={done}
                onChange={() => void toggleStatus(r)}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-zinc-900 cursor-pointer"
                aria-label={done ? "Mark as pending" : "Mark as done"}
              />
            )}
          </div>
        );
      },
    },
    {
      key: "engagement_name",
      label: "Engagement",
      sortable: true,
      hideOnTablet: true,
      render: (r) => r.engagement_name ?? "—",
    },
    {
      key: "due_date",
      label: "Due date",
      sortable: true,
      hideOnMobile: true,
      render: (r) => {
        const text = formatDueDate(r.due_date);
        const overdue = isOverdue(r.due_date, r.status);
        return (
          <span className={overdue ? "text-amber-600 font-medium" : "text-zinc-600"}>
            {text}
          </span>
        );
      },
    },
    {
      key: "notes",
      label: "Notes",
      sortable: false,
      hideOnTablet: true,
      render: (r) => {
        const n = r.notes?.trim();
        if (!n) return "—";
        return n.length > 50 ? `${n.slice(0, 50)}…` : n;
      },
    },
  ];

  const emptyMessage =
    tab === "pending"
      ? "No pending tasks."
      : tab === "done"
        ? "No done tasks."
        : "No tasks assigned to you yet.";

  const tabClass = (active: boolean) =>
    `pb-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-zinc-900 text-zinc-900"
        : "border-transparent text-zinc-500 hover:text-zinc-700"
    }`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">My Tasks</h1>
        <div className="flex gap-4 sm:gap-6 border-b border-zinc-200">
          <button type="button" className={tabClass(tab === "")} onClick={() => setTab("")}>
            All
          </button>
          <button type="button" className={tabClass(tab === "pending")} onClick={() => setTab("pending")}>
            Pending
          </button>
          <button type="button" className={tabClass(tab === "done")} onClick={() => setTab("done")}>
            Done
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">{emptyMessage}</div>
        ) : (
          <DataTable
            columns={columns}
            data={sorted}
            keyExtractor={(r) => r.task_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            firstColumnClickableView={false}
            onEdit={openEdit}
          />
        )}
      </div>

      {editRow && (
        <Modal
          open={!!editRow}
          onClose={() => setEditRow(null)}
          title={`Edit task — ${editRow.item_title}`}
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            {editError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {editError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="my-task-due">
                Due date
              </label>
              <input
                id="my-task-due"
                type="date"
                value={editDue}
                onChange={(e) => setEditDue(e.target.value)}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <p className="text-xs text-zinc-500 mt-1">Clear the field and save to remove the due date.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="my-task-notes">
                Notes
              </label>
              <textarea
                id="my-task-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={4}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="Optional notes…"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={editSaving}
                onClick={() => void saveEdit()}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
