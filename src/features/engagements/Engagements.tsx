import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  Loader2,
  UserCog,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  ArrowRightLeft,
} from "lucide-react";
import { EngagementFormModal } from "./EngagementFormModal";
import { EngagementDrawer } from "./EngagementDrawer";
import { ConsoleUrlActions } from "./consoleUrlActions";
import { computeCampNo } from "./campNo";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { ParticipantsModal } from "../../shared/ui/ParticipantsModal";
import { OccupiedSlotsModal } from "../../shared/ui/OccupiedSlotsModal";
import {
  engagementsApi,
  organizationsApi,
  assessmentPackagesApi,
  diagnosticPackagesApi,
  employeesApi,
  onboardingAssistantsApi,
  type ChecklistReadiness,
  type EngagementListItem,
  type Engagement,
  type EngagementCreate,
  type EngagementStatus,
  type EngagementKind,
  type DiagnosticPackageListItem,
  type OrganizationListItem,
  type AssessmentPackage,
  type EmployeeListItem,
  type OnboardingAssistant,
  engagementChecklistsApi,
  checklistTemplatesApi,
  checklistTasksApi,
  notificationsApi,
  platformSettingsApi,
  type NotificationServiceItem,
  type EngagementChecklist,
  type ChecklistTemplate,
  type ChecklistTask,
  type UserListItem,
  getApiError,
} from "../../lib/api";
import { useLocation } from "react-router-dom";

const STATUS_OPTIONS = ["draft", "scheduled", "running", "completed", "cancelled"] as const;

function formatEngagementStatusLabel(status?: string | null): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "draft") return "Draft";
  if (normalized === "scheduled") return "Scheduled";
  if (normalized === "running") return "Running";
  if (normalized === "completed") return "Completed";
  if (normalized === "cancelled") return "Cancelled";
  return status ?? "—";
}

function formatStatusFiltersLabel(statusFilters: string[]): string {
  if (statusFilters.length === 0) return "All statuses";
  return statusFilters.map((status) => formatEngagementStatusLabel(status)).join(", ");
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTaskDue(value?: string | null) {
  if (!value) return null;
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

function getEmployeeUserName(
  userId: number,
  usersById: Record<number, UserListItem>
): string {
  const u = usersById[userId];
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  return name || `User ${userId}`;
}

function getEmployeeDisplayName(
  emp: EmployeeListItem,
  usersById: Record<number, UserListItem>
): string {
  const fromEmployee = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim();
  if (fromEmployee) return fromEmployee;
  return getEmployeeUserName(emp.user_id, usersById);
}

function formatEmployeeAssignLabel(
  emp: EmployeeListItem,
  usersById: Record<number, UserListItem>
): string {
  const name = getEmployeeDisplayName(emp, usersById);
  if (name !== `User ${emp.user_id}`) {
    return emp.role?.trim() ? `${name} · ${emp.role}` : name;
  }
  if (emp.role?.trim()) return emp.role.trim();
  return "Unknown";
}

function EngagementChecklistModal({
  open,
  onClose,
  engagement,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  engagement: EngagementListItem | null;
  onChanged: () => void;
}) {
  const [checklists, setChecklists] = useState<EngagementChecklist[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [applyTemplateId, setApplyTemplateId] = useState<string>("");
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EngagementChecklist | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [taskUpdating, setTaskUpdating] = useState<Set<number>>(new Set());
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [usersById, setUsersById] = useState<Record<number, UserListItem>>({});
  const [taskAssigning, setTaskAssigning] = useState<Set<number>>(new Set());
  const [taskEdit, setTaskEdit] = useState<{
    task_id: number;
    item_title: string;
    due_date_input: string;
    notes: string;
  } | null>(null);
  const [taskEditSaving, setTaskEditSaving] = useState(false);
  const [taskEditError, setTaskEditError] = useState<string | null>(null);

  const engagementId = engagement?.engagement_id;

  const loadData = useCallback(async () => {
    if (engagementId == null) return;
    setLoading(true);
    setError(null);
    try {
      const [clRes, tRes, empRes] = await Promise.all([
        engagementChecklistsApi.list(engagementId),
        checklistTemplatesApi.list(),
        employeesApi.list({ status: "active", limit: 100 }),
      ]);
      setChecklists(clRes.data.data);
      setTemplates(tRes.data.data);
      const emps = [...empRes.data.data].sort((a, b) => a.employee_id - b.employee_id);
      setEmployees(emps);
      setUsersById({});
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    if (open && engagementId != null) {
      setExpanded(new Set());
      setApplyTemplateId("");
      setApplyError(null);
      void loadData();
    }
  }, [open, engagementId, loadData]);

  const templatesById = templates.reduce<Record<number, ChecklistTemplate>>((acc, t) => {
    acc[t.template_id] = t;
    return acc;
  }, {});

  const activeTemplates = templates.filter((t) => (t.status ?? "").toLowerCase() === "active");

  const toggleExpand = (checklistId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(checklistId)) next.delete(checklistId);
      else next.add(checklistId);
      return next;
    });
  };

  const handleApply = async () => {
    if (engagementId == null || !applyTemplateId) return;
    setApplyLoading(true);
    setApplyError(null);
    try {
      await engagementChecklistsApi.apply(engagementId, { template_id: Number(applyTemplateId) });
      setApplyTemplateId("");
      await loadData();
      onChanged();
    } catch (err) {
      setApplyError(getApiError(err));
    } finally {
      setApplyLoading(false);
    }
  };

  const handleRemove = async () => {
    if (engagementId == null || !removeTarget) return;
    setRemoveLoading(true);
    try {
      await engagementChecklistsApi.remove(engagementId, removeTarget.checklist_id);
      setRemoveTarget(null);
      await loadData();
      onChanged();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setRemoveLoading(false);
    }
  };

  const toggleTaskStatus = async (taskId: number, currentStatus: string) => {
    const next = (currentStatus ?? "").toLowerCase() === "done" ? "pending" : "done";
    setTaskUpdating((prev) => new Set(prev).add(taskId));
    setError(null);
    try {
      await checklistTasksApi.updateStatus(taskId, { status: next });
      await loadData();
      onChanged();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setTaskUpdating((prev) => {
        const n = new Set(prev);
        n.delete(taskId);
        return n;
      });
    }
  };

  const assignTask = async (taskId: number, employeeIdStr: string) => {
    const assigned_employee_id = employeeIdStr === "" ? null : Number(employeeIdStr);
    setTaskAssigning((prev) => new Set(prev).add(taskId));
    setError(null);
    try {
      await checklistTasksApi.assign(taskId, { assigned_employee_id });
      await loadData();
      onChanged();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setTaskAssigning((prev) => {
        const n = new Set(prev);
        n.delete(taskId);
        return n;
      });
    }
  };

  const openTaskEdit = (task: ChecklistTask) => {
    setTaskEdit({
      task_id: task.task_id,
      item_title: task.item_title,
      due_date_input: dueDateToInput(task.due_date),
      notes: task.notes ?? "",
    });
    setTaskEditError(null);
  };

  const saveTaskEdit = async () => {
    if (!taskEdit) return;
    setTaskEditSaving(true);
    setTaskEditError(null);
    try {
      await checklistTasksApi.update(taskEdit.task_id, {
        notes: taskEdit.notes.trim() ? taskEdit.notes.trim() : null,
        due_date: taskEdit.due_date_input.trim() ? taskEdit.due_date_input.trim() : null,
      });
      setTaskEdit(null);
      await loadData();
      onChanged();
    } catch (err) {
      setTaskEditError(getApiError(err));
    } finally {
      setTaskEditSaving(false);
    }
  };

  if (!open || !engagement) return null;

  const titleName = engagement.engagement_name || engagement.engagement_code || "Engagement";

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Checklists — ${titleName}`}
        maxWidthClassName="max-w-3xl"
      >
        <div className="space-y-6 max-h-[min(70vh,520px)] overflow-y-auto pr-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}

          <section>
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Applied checklists</h3>
            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
              </div>
            ) : checklists.length === 0 ? (
              <p className="text-sm text-zinc-500">No checklists applied yet.</p>
            ) : (
              <ul className="space-y-3">
                {checklists.map((cl) => {
                  const isOpen = expanded.has(cl.checklist_id);
                  const { done, total, percent } = cl.readiness;
                  const audience = templatesById[cl.template_id]?.audience ?? "internal";
                  const isUserFacing = audience === "user";
                  return (
                    <li
                      key={cl.checklist_id}
                      className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {isUserFacing ? (
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="font-semibold text-zinc-900 truncate block">
                                  {cl.template_name}
                                </span>
                                <span className="text-xs text-zinc-500 mt-1 block">
                                  User-facing checklist
                                </span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => toggleExpand(cl.checklist_id)}
                                className="flex items-center gap-2 text-left w-full"
                              >
                                {isOpen ? (
                                  <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                                )}
                                <span className="font-semibold text-zinc-900 truncate">{cl.template_name}</span>
                              </button>
                              <p className="text-xs text-zinc-600 mt-1 sm:ml-6">
                                Readiness: {done}/{total} tasks done
                              </p>
                              <div className="mt-2 sm:ml-6 h-1.5 w-full max-w-xs bg-zinc-100 rounded overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded transition-all"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(cl)}
                          className="self-start sm:self-center p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                          title="Remove checklist"
                          aria-label="Remove checklist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {!isUserFacing && isOpen && (
                        <ul className="mt-3 pt-3 border-t border-zinc-100 space-y-2 sm:ml-6">
                          {cl.tasks.map((task) => {
                            const doneTask = (task.status ?? "").toLowerCase() === "done";
                            const busy = taskUpdating.has(task.task_id);
                            const assigning = taskAssigning.has(task.task_id);
                            const assigneeValue =
                              task.assigned_employee_id != null ? String(task.assigned_employee_id) : "";
                            return (
                              <li
                                key={task.task_id}
                                className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 sm:p-3.5"
                              >
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    disabled={busy || assigning}
                                    onClick={() => void toggleTaskStatus(task.task_id, task.status)}
                                    className={`mt-1 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${doneTask
                                        ? "bg-emerald-500 border-emerald-500 text-white"
                                        : "border-zinc-300 bg-white hover:border-zinc-400"
                                      } disabled:opacity-60`}
                                    aria-label={doneTask ? "Mark pending" : "Mark done"}
                                  >
                                    {busy ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                                    ) : doneTask ? (
                                      <Check className="w-3.5 h-3.5" />
                                    ) : null}
                                  </button>
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                                      <p className="font-medium text-zinc-900 leading-snug min-w-[8rem] flex-1">
                                        {task.item_title}
                                      </p>
                                      <div className="flex items-center gap-2 w-full sm:w-auto sm:max-w-[min(100%,18rem)] shrink-0">
                                        <label
                                          className="text-xs font-medium text-zinc-600 whitespace-nowrap"
                                          htmlFor={`assign-${task.task_id}`}
                                        >
                                          Assign to
                                        </label>
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <select
                                            id={`assign-${task.task_id}`}
                                            value={assigneeValue}
                                            disabled={busy || assigning}
                                            onChange={(e) => void assignTask(task.task_id, e.target.value)}
                                            className="w-full min-w-0 border border-zinc-300 rounded-lg px-2.5 py-1.5 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
                                          >
                                            <option value="">Unassigned</option>
                                            {employees.map((emp) => (
                                              <option key={emp.employee_id} value={emp.employee_id}>
                                                {formatEmployeeAssignLabel(emp, usersById)}
                                              </option>
                                            ))}
                                          </select>
                                          {assigning ? (
                                            <Loader2
                                              className="w-4 h-4 animate-spin text-zinc-400 shrink-0"
                                              aria-hidden
                                            />
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                    {task.item_description?.trim() ? (
                                      <p className="text-sm text-zinc-500 leading-relaxed">{task.item_description}</p>
                                    ) : null}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                      {task.due_date ? (
                                        <span className="text-xs text-zinc-500">
                                          Due {formatTaskDue(task.due_date)}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-zinc-400">No due date</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => openTaskEdit(task)}
                                        disabled={busy || assigning}
                                        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 underline-offset-2 hover:underline disabled:opacity-50"
                                      >
                                        <Pencil className="w-3 h-3" />
                                        Edit date &amp; notes
                                      </button>
                                    </div>
                                    {task.notes?.trim() ? (
                                      <p className="text-xs italic text-zinc-600 border-l-2 border-zinc-200 pl-2">
                                        {task.notes}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="border-t border-zinc-200 pt-5">
            <h3 className="text-sm font-semibold text-zinc-900">Add a checklist</h3>
            <p className="text-xs text-zinc-500 mt-1 mb-4">
              Pick an active template. Internal templates create tasks automatically; user-facing templates show static instructions.
            </p>
            {applyError && (
              <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {applyError}
              </div>
            )}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5" htmlFor="apply-template-select">
                    Checklist template
                  </label>
                  <select
                    id="apply-template-select"
                    value={applyTemplateId}
                    onChange={(e) => setApplyTemplateId(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="">Choose a template…</option>
                    {activeTemplates.map((t) => (
                      <option key={t.template_id} value={t.template_id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={!applyTemplateId || applyLoading}
                  onClick={() => void handleApply()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 shrink-0 w-full sm:w-auto"
                >
                  {applyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Apply to engagement
                </button>
              </div>
            </div>
          </section>
        </div>
      </Modal>

      {removeTarget && (
        <Modal
          open={!!removeTarget}
          onClose={() => setRemoveTarget(null)}
          title="Remove checklist"
        >
          <p className="text-sm text-zinc-600 mb-4">
            Remove this checklist and all its tasks?
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              disabled={removeLoading}
              onClick={() => void handleRemove()}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {removeLoading ? "Removing…" : "Remove"}
            </button>
            <button
              type="button"
              onClick={() => setRemoveTarget(null)}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {taskEdit && (
        <Modal
          open={!!taskEdit}
          onClose={() => setTaskEdit(null)}
          title={`Edit task — ${taskEdit.item_title}`}
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            {taskEditError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {taskEditError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="task-edit-due">
                Due date
              </label>
              <input
                id="task-edit-due"
                type="date"
                value={taskEdit.due_date_input}
                onChange={(e) =>
                  setTaskEdit((prev) => (prev ? { ...prev, due_date_input: e.target.value } : null))
                }
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <p className="text-xs text-zinc-500 mt-1">Clear the field and save to remove the due date.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="task-edit-notes">
                Notes
              </label>
              <textarea
                id="task-edit-notes"
                value={taskEdit.notes}
                onChange={(e) =>
                  setTaskEdit((prev) => (prev ? { ...prev, notes: e.target.value } : null))
                }
                rows={4}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="Optional notes…"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={taskEditSaving}
                onClick={() => void saveTaskEdit()}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {taskEditSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
              <button
                type="button"
                onClick={() => setTaskEdit(null)}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

const EMPTY_NOTIFICATION_FIELDS: Pick<
  EngagementCreate,
  | "onboarding_notification"
  | "pretest_guidelines_notification"
  | "questionnaire_reminder_1"
  | "questionnaire_reminder_2"
  | "blood_report_notification"
  | "bioai_report_notification"
> = {
  onboarding_notification: null,
  pretest_guidelines_notification: null,
  questionnaire_reminder_1: null,
  questionnaire_reminder_2: null,
  blood_report_notification: null,
  bioai_report_notification: null,
};

export function Engagements({
  asModalForEngagementId,
  onCloseModal,
}: {
  asModalForEngagementId?: number;
  onCloseModal?: () => void;
} = {}) {
  const location = useLocation();
  const [data, setData] = useState<EngagementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>(["scheduled", "running"]);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string>("engagement_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [listTab, setListTab] = useState<"organizations" | "users">("organizations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEngagementId, setDrawerEngagementId] = useState<number | null>(null);
  const [drawerReadiness, setDrawerReadiness] = useState<ChecklistReadiness | null>(null);

  useEffect(() => {
    if (asModalForEngagementId) {
      setDrawerEngagementId(asModalForEngagementId);
      setDrawerOpen(true);
    }
  }, [asModalForEngagementId]);

  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [assessmentPackages, setAssessmentPackages] = useState<AssessmentPackage[]>([]);
  const [diagnosticPackages, setDiagnosticPackages] = useState<DiagnosticPackageListItem[]>([]);
  const [notificationServices, setNotificationServices] = useState<NotificationServiceItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [selected, setSelected] = useState<Engagement | null>(null);
  const [formData, setFormData] = useState<EngagementCreate>({
    engagement_name: "",
    metsights_engagement_id: "",
    organization_id: 0,
    engagement_type: "bio_ai",
    engagement_code: "",
    assessment_package_id: 0,
    diagnostic_package_id: undefined,
    city: "",
    address: "",
    sub_locality: "",
    landmark: "",
    pincode: "",
    state: "",
    country: "",
    latitude: null,
    longitude: null,
    slot_duration: 60,
    start_date: "",
    end_date: "",
    healthians_zone_id: undefined,
    external_camp_id: undefined,
    create_profile_on_metsights: false,
    enroll_for_fitprint_full: false,
    ...EMPTY_NOTIFICATION_FIELDS,
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<EngagementListItem | null>(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState<EngagementListItem | null>(null);
  const [statusChangeNext, setStatusChangeNext] = useState<EngagementStatus>("running");
  const [statusChangeSubmitting, setStatusChangeSubmitting] = useState(false);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);

  const [participantsSource, setParticipantsSource] = useState<
    | { kind: "engagement-id"; engagementId: number; name?: string }
    | { kind: "engagement-code"; code: string; name?: string }
    | { kind: "public" }
    | null
  >(null);

  const [occupiedSlotsSource, setOccupiedSlotsSource] = useState<
    | { kind: "engagement-code"; code: string; name?: string }
    | { kind: "public" }
    | null
  >(null);

  // ── Onboarding Assistants states ──────────────────────────────
  const [assistantsEngagement, setAssistantsEngagement] = useState<EngagementListItem | null>(null);
  const [assistantsModalOpen, setAssistantsModalOpen] = useState(false);
  const [assistants, setAssistants] = useState<OnboardingAssistant[]>([]);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [assistantsError, setAssistantsError] = useState<string | null>(null);
  const [removingAssistantId, setRemovingAssistantId] = useState<number | null>(null);

  // Add-assistants sub-panel state
  const [addAssistantsOpen, setAddAssistantsOpen] = useState(false);
  const [allEmployees, setAllEmployees] = useState<EmployeeListItem[]>([]);
  const [allEmployeesLoading, setAllEmployeesLoading] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
  const [assigningAssistants, setAssigningAssistants] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");

  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [checklistEngagement, setChecklistEngagement] = useState<EngagementListItem | null>(null);

  const [pendingEngagementPreset, setPendingEngagementPreset] = useState<{
    organization_id: number;
    orgName?: string;
    city?: string;
  } | null>(null);

  const [addChecklistPromptOpen, setAddChecklistPromptOpen] = useState(false);
  const [addChecklistPromptEngagementId, setAddChecklistPromptEngagementId] = useState<number | null>(null);
  const [addChecklistPromptBusy, setAddChecklistPromptBusy] = useState(false);
  // Tracks the newly-created engagement whose Onboarding Assistants panel should
  // auto-open once the post-creation checklist prompt flow finishes.
  const [pendingAssistantsEngagementId, setPendingAssistantsEngagementId] = useState<number | null>(null);

  const openChecklistModal = (row: EngagementListItem) => {
    setChecklistEngagement(row);
    setChecklistModalOpen(true);
  };

  const closeChecklistModal = () => {
    setChecklistModalOpen(false);
    setChecklistEngagement(null);
    // If we arrived here from a fresh engagement creation, auto-open the
    // Onboarding Assistants panel so the user can assign assistants next.
    const pendingId = pendingAssistantsEngagementId;
    if (pendingId != null) {
      setPendingAssistantsEngagementId(null);
      void openAssistantsModalById(pendingId);
    }
  };

  const fetchOrgs = useCallback(async () => {
    try {
      const r = await organizationsApi.list({ page: 1, limit: 100 });
      setOrganizations(r.data.data);
    } catch (err) {
      setError(getApiError(err));
    }
  }, []);

  const ensureOrgInList = useCallback(async (organizationId: number | null | undefined) => {
    if (!organizationId || organizationId <= 0) return;
    try {
      const res = await organizationsApi.get(organizationId);
      const org = res.data.data;
      setOrganizations((prev) => {
        if (prev.some((o) => o.organization_id === organizationId)) return prev;
        return [
          ...prev,
          {
            organization_id: org.organization_id,
            name: org.name,
            organization_type: org.organization_type,
            logo: org.logo,
            website_url: org.website_url,
            city: org.city,
            state: org.state,
            country: org.country,
            status: org.status,
          },
        ];
      });
    } catch {
      // Keep form usable even if the org lookup fails.
    }
  }, []);
  const fetchPackages = useCallback(() => {
    assessmentPackagesApi.list().then((r) => setAssessmentPackages(r.data.data));
  }, []);
  const fetchDiagnostics = useCallback(() => {
    Promise.all([
      diagnosticPackagesApi.list({ package_for: "camp" }),
      diagnosticPackagesApi.list({ package_for: "public" }),
    ])
      .then(([campRes, publicRes]) => {
        const merged = [...(campRes.data.data ?? []), ...(publicRes.data.data ?? [])];
        const uniqueById = new Map<number, DiagnosticPackageListItem>();
        merged.forEach((pkg) => uniqueById.set(pkg.diagnostic_package_id, pkg));
        setDiagnosticPackages(Array.from(uniqueById.values()));
      })
      .catch((err) => setError(getApiError(err)));
  }, []);

  useEffect(() => {
    const state = location.state as
      | { createEngagementFromOrg?: { organization_id: number; orgName?: string; city?: string } }
      | null
      | undefined;
    if (!state?.createEngagementFromOrg) return;
    setPendingEngagementPreset(state.createEngagementFromOrg);
  }, [location.state]);

  useEffect(() => {
    engagementsApi
      .filterOptions()
      .then((res) => {
        setTypeOptions(res.data.data.engagement_types);
        setCityOptions(res.data.data.cities);
      })
      .catch(() => {
        setTypeOptions([]);
        setCityOptions([]);
      });
  }, []);

  useEffect(() => {
    notificationsApi
      .listServices()
      .then((res) => {
        const active = (res.data.data ?? []).filter((s) => s.is_active);
        setNotificationServices(active);
      })
      .catch(() => setNotificationServices([]));
  }, []);

  const notificationServiceLabel = (serviceKey: string | null | undefined) => {
    const key = (serviceKey ?? "").trim();
    if (!key) return "—";
    const match = notificationServices.find((s) => s.service_key === key);
    return match ? `${match.display_name} (${key})` : key;
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await engagementsApi.list({
        page,
        limit,
        status: statusFilters.length ? statusFilters.join(",") : undefined,
        search: search.trim() || undefined,
        engagement_type: typeFilter || undefined,
        city: cityFilter || undefined,
        audience: listTab === "organizations" ? "b2b" : "b2c",
        sort_by: sortKey,
        sort_dir: sortDir,
      });
      setData(res.data.data);
      setTotal(res.data.meta.total);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilters, search, typeFilter, cityFilter, sortKey, sortDir, listTab]);

  useEffect(() => {
    if (!statusFilterOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setStatusFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [statusFilterOpen]);

  useEffect(() => {
    fetchOrgs();
    fetchPackages();
    fetchDiagnostics();
  }, [fetchOrgs, fetchPackages, fetchDiagnostics]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilters, typeFilter, cityFilter, listTab]);

  const openView = (row: EngagementListItem) => {
    setDrawerEngagementId(row.engagement_id);
    setDrawerReadiness(row.readiness ?? null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerEngagementId(null);
    setDrawerReadiness(null);
    if (onCloseModal) onCloseModal();
  };

  const openAdd = async (preset?: Partial<EngagementCreate>) => {
    setSelected(null);
    const today = new Date().toISOString().slice(0, 10);
    const nextOrganizationId =
      preset?.organization_id ?? organizations[0]?.organization_id ?? 0;
    const nextAssessmentPackageId =
      preset?.assessment_package_id ?? assessmentPackages[0]?.package_id ?? 0;

    let notificationDefaults = { ...EMPTY_NOTIFICATION_FIELDS };
    try {
      const res = await platformSettingsApi.getEngagementNotificationDefaults();
      const d = res.data.data;
      notificationDefaults = {
        onboarding_notification: d.default_onboarding_notification ?? null,
        pretest_guidelines_notification: d.default_pretest_guidelines_notification ?? null,
        questionnaire_reminder_1: d.default_questionnaire_reminder_1 ?? null,
        questionnaire_reminder_2: d.default_questionnaire_reminder_2 ?? null,
        blood_report_notification: d.default_blood_report_notification ?? null,
        bioai_report_notification: d.default_bioai_report_notification ?? null,
      };
    } catch {
      // keep empty defaults
    }

    setFormData({
      engagement_name: preset?.engagement_name ?? "",
      metsights_engagement_id: preset?.metsights_engagement_id ?? "",
      organization_id: nextOrganizationId,
      engagement_type: (preset?.engagement_type as EngagementKind | undefined) ?? "bio_ai",
      engagement_code: preset?.engagement_code ?? "",
      assessment_package_id: nextAssessmentPackageId,
      diagnostic_package_id: undefined,
      city: preset?.city ?? "",
      address: preset?.address ?? "",
      sub_locality: preset?.sub_locality ?? "",
      landmark: preset?.landmark ?? "",
      pincode: preset?.pincode ?? "",
      state: preset?.state ?? "",
      country: preset?.country ?? "",
      latitude: preset?.latitude ?? null,
      longitude: preset?.longitude ?? null,
      slot_duration: preset?.slot_duration ?? 60,
      start_date: preset?.start_date ?? today,
      end_date: preset?.end_date ?? today,
      healthians_zone_id: preset?.healthians_zone_id ?? undefined,
      external_camp_id: preset?.external_camp_id ?? undefined,
      blood_collection_type: preset?.blood_collection_type ?? undefined,
      create_profile_on_metsights: preset?.create_profile_on_metsights ?? false,
      enroll_for_fitprint_full: preset?.enroll_for_fitprint_full ?? false,
      onboarding_notification:
        preset?.onboarding_notification ?? notificationDefaults.onboarding_notification,
      pretest_guidelines_notification:
        preset?.pretest_guidelines_notification ??
        notificationDefaults.pretest_guidelines_notification,
      questionnaire_reminder_1:
        preset?.questionnaire_reminder_1 ?? notificationDefaults.questionnaire_reminder_1,
      questionnaire_reminder_2:
        preset?.questionnaire_reminder_2 ?? notificationDefaults.questionnaire_reminder_2,
      blood_report_notification:
        preset?.blood_report_notification ?? notificationDefaults.blood_report_notification,
      bioai_report_notification:
        preset?.bioai_report_notification ?? notificationDefaults.bioai_report_notification,
    });
    setModalMode("add");
    setModalOpen(true);
  };

  useEffect(() => {
    if (!pendingEngagementPreset) return;
    if (modalOpen) return;
    if (organizations.length === 0 || assessmentPackages.length === 0) return;
    openAdd({
      organization_id: pendingEngagementPreset.organization_id,
      engagement_name: pendingEngagementPreset.orgName ?? "",
      city: pendingEngagementPreset.city ?? "",
    });
    setPendingEngagementPreset(null);
  }, [pendingEngagementPreset, organizations, assessmentPackages, modalOpen]);

  const openEdit = (row: EngagementListItem) => {
    engagementsApi.get(row.engagement_id).then(async (res) => {
      const e = res.data.data;
      await ensureOrgInList(e.organization_id);
      setSelected(e);
      setFormData({
        engagement_name: e.engagement_name ?? "",
        metsights_engagement_id: e.metsights_engagement_id ?? "",
        organization_id: e.organization_id ?? 0,
        engagement_type: (e.engagement_type as EngagementKind | undefined) ?? "bio_ai",
        consultations: e.consultations ?? null,
        engagement_code: e.engagement_code ?? "",
        assessment_package_id: e.assessment_package_id ?? 0,
        diagnostic_package_id: e.diagnostic_package_id ?? undefined,
        city: e.city ?? "",
        address: e.address ?? "",
        sub_locality: e.sub_locality ?? "",
        landmark: e.landmark ?? "",
        pincode: e.pincode ?? "",
        state: e.state ?? "",
        country: e.country ?? "",
        latitude: e.latitude ?? null,
        longitude: e.longitude ?? null,
        slot_duration: e.slot_duration ?? 60,
        start_date: (e.start_date ?? "").toString().slice(0, 10),
        end_date: (e.end_date ?? "").toString().slice(0, 10),
        healthians_zone_id: e.healthians_zone_id ?? undefined,
        external_camp_id: e.external_camp_id ?? undefined,
        blood_collection_type: e.blood_collection_type ?? undefined,
        create_profile_on_metsights: Boolean(e.create_profile_on_metsights),
        enroll_for_fitprint_full: Boolean(e.enroll_for_fitprint_full),
        onboarding_notification: e.onboarding_notification ?? null,
        pretest_guidelines_notification: e.pretest_guidelines_notification ?? null,
        questionnaire_reminder_1: e.questionnaire_reminder_1 ?? null,
        questionnaire_reminder_2: e.questionnaire_reminder_2 ?? null,
        blood_report_notification: e.blood_report_notification ?? null,
        bioai_report_notification: e.bioai_report_notification ?? null,
      });
      setModalMode("edit");
      setModalOpen(true);
    }).catch((err) => setError(getApiError(err)));
  };

  const resolveOrganizationId = (data: EngagementCreate) =>
    data.organization_id && data.organization_id > 0 ? data.organization_id : null;

  const emptyToNull = (value: string | null | undefined) => {
    const trimmed = (value ?? "").trim();
    return trimmed ? trimmed : null;
  };

  const handleSubmit = async (data: EngagementCreate) => {
    const orgId = resolveOrganizationId(data);
    const missingOrg = modalMode === "add" && !orgId;
    const missingDates = !data.start_date || !data.end_date;
    if (missingOrg || missingDates) {
      const parts: string[] = [];
      if (missingOrg) parts.push("organisation");
      if (missingDates) parts.push("start and end dates");
      setError(`Please fill required fields: ${parts.join(", ")}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const locationFields = {
        city: emptyToNull(data.city),
        address: emptyToNull(data.address),
        sub_locality: emptyToNull(data.sub_locality),
        landmark: emptyToNull(data.landmark),
        pincode: emptyToNull(data.pincode),
        state: emptyToNull(data.state),
        country: emptyToNull(data.country),
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      };

      if (modalMode === "add") {
        const createPayload: EngagementCreate = {
          ...data,
          ...locationFields,
          organization_id: orgId!,
          metsights_engagement_id: data.metsights_engagement_id?.trim() || null,
          assessment_package_id:
            data.assessment_package_id && data.assessment_package_id > 0
              ? data.assessment_package_id
              : null,
          diagnostic_package_id:
            data.diagnostic_package_id && data.diagnostic_package_id > 0
              ? data.diagnostic_package_id
              : null,
          healthians_zone_id: data.healthians_zone_id?.trim() || null,
          external_camp_id: data.external_camp_id ?? null,
          blood_collection_type: data.blood_collection_type || null,
          create_profile_on_metsights: Boolean(data.create_profile_on_metsights),
          enroll_for_fitprint_full: Boolean(data.enroll_for_fitprint_full),
          onboarding_notification: data.onboarding_notification || null,
          pretest_guidelines_notification: data.pretest_guidelines_notification || null,
          questionnaire_reminder_1: data.questionnaire_reminder_1 || null,
          questionnaire_reminder_2: data.questionnaire_reminder_2 || null,
          blood_report_notification: data.blood_report_notification || null,
          bioai_report_notification: data.bioai_report_notification || null,
          camp_no: computeCampNo(orgId, data.start_date),
        };
        const created = await engagementsApi.create(createPayload);
        const engagementId = created.data.data.engagement_id;
        setAddChecklistPromptEngagementId(engagementId);
        // Remember this ID so the Onboarding Assistants panel can auto-open
        // once the checklist prompt flow (Yes → checklist modal, or No) finishes.
        setPendingAssistantsEngagementId(engagementId);
        setAddChecklistPromptOpen(true);
      } else if (selected) {
        const payload = {
          engagement_name: data.engagement_name,
          engagement_code: (data.engagement_code ?? "").trim(),
          metsights_engagement_id: data.metsights_engagement_id?.trim() || null,
          organization_id: orgId,
          engagement_type: data.engagement_type,
          assessment_package_id:
            data.assessment_package_id && data.assessment_package_id > 0
              ? data.assessment_package_id
              : null,
          diagnostic_package_id:
            data.diagnostic_package_id && data.diagnostic_package_id > 0
              ? data.diagnostic_package_id
              : null,
          ...locationFields,
          slot_duration: data.slot_duration,
          start_date: data.start_date,
          end_date: data.end_date,
          healthians_zone_id: data.healthians_zone_id?.trim() || null,
          external_camp_id: data.external_camp_id ?? null,
          blood_collection_type: data.blood_collection_type || null,
          create_profile_on_metsights: Boolean(data.create_profile_on_metsights),
          enroll_for_fitprint_full: Boolean(data.enroll_for_fitprint_full),
          onboarding_notification: data.onboarding_notification || null,
          pretest_guidelines_notification: data.pretest_guidelines_notification || null,
          questionnaire_reminder_1: data.questionnaire_reminder_1 || null,
          questionnaire_reminder_2: data.questionnaire_reminder_2 || null,
          blood_report_notification: data.blood_report_notification || null,
          bioai_report_notification: data.bioai_report_notification || null,
          camp_no: computeCampNo(orgId, data.start_date),
        };
        await engagementsApi.update(selected.engagement_id, payload);
      }
      setModalOpen(false);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openChecklistForEngagementId = async (engagementId: number) => {
    setAddChecklistPromptBusy(true);
    setError(null);
    try {
      const res = await engagementsApi.get(engagementId);
      const e = res.data.data;
      openChecklistModal({
        engagement_id: e.engagement_id,
        engagement_name: e.engagement_name ?? "",
        engagement_code: e.engagement_code ?? "",
        engagement_type: (e.engagement_type as EngagementKind | undefined) ?? "bio_ai",
        organization_id: e.organization_id ?? 0,
        city: e.city ?? "",
        slot_duration: e.slot_duration ?? null,
        start_date: e.start_date ?? null,
        end_date: e.end_date ?? null,
        status: e.status ?? null,
        participant_count: e.participant_count ?? null,
        readiness: null,
      } as EngagementListItem);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setAddChecklistPromptBusy(false);
    }
  };

  const handleDelete = async (row: EngagementListItem) => {
    if (!deleteConfirm || deleteConfirm.engagement_id !== row.engagement_id) return;
    setSubmitting(true);
    try {
      await engagementsApi.delete(row.engagement_id);
      setDeleteConfirm(null);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openStatusChange = useCallback((row: EngagementListItem) => {
    const normalized = (row.status ?? "draft").toLowerCase();
    const current = STATUS_OPTIONS.includes(normalized as (typeof STATUS_OPTIONS)[number])
      ? (normalized as EngagementStatus)
      : "draft";
    setStatusChangeNext(current);
    setStatusChangeError(null);
    setStatusChangeTarget(row);
  }, []);

  const handleStatusChange = async () => {
    if (!statusChangeTarget) return;
    const current = (statusChangeTarget.status ?? "").toLowerCase();
    if (current === statusChangeNext) {
      setStatusChangeTarget(null);
      return;
    }
    setStatusChangeSubmitting(true);
    setStatusChangeError(null);
    try {
      await engagementsApi.updateStatus(statusChangeTarget.engagement_id, statusChangeNext);
      setStatusChangeTarget(null);
      fetchList();
    } catch (err) {
      setStatusChangeError(getApiError(err));
    } finally {
      setStatusChangeSubmitting(false);
    }
  };

  const getOrgName = (id: number) => organizations.find((o) => o.organization_id === id)?.name ?? String(id);

  // ── Onboarding Assistants handlers ───────────────────────────
  const fetchAssistants = useCallback(async (engagementId: number) => {
    setAssistantsLoading(true);
    setAssistantsError(null);
    try {
      const res = await onboardingAssistantsApi.list(engagementId);
      setAssistants(res.data.data);
    } catch (err) {
      setAssistantsError(getApiError(err));
    } finally {
      setAssistantsLoading(false);
    }
  }, []);

  const openAssistantsModal = (row: EngagementListItem) => {
    setAssistantsEngagement(row);
    setAssistants([]);
    setAssistantsError(null);
    setAddAssistantsOpen(false);
    setSelectedEmployeeIds(new Set());
    setEmployeeSearch("");
    setAssistantsModalOpen(true);
    void fetchAssistants(row.engagement_id);
  };

  // Fetches the engagement by ID then opens the Onboarding Assistants panel.
  // Used after new-engagement creation to auto-navigate the user into assistants.
  const openAssistantsModalById = async (engagementId: number) => {
    try {
      const res = await engagementsApi.get(engagementId);
      const e = res.data.data;
      openAssistantsModal({
        engagement_id: e.engagement_id,
        engagement_name: e.engagement_name ?? "",
        engagement_code: e.engagement_code ?? "",
        engagement_type: (e.engagement_type as EngagementKind | undefined) ?? "bio_ai",
        organization_id: e.organization_id ?? 0,
        city: e.city ?? "",
        slot_duration: e.slot_duration ?? null,
        start_date: e.start_date ?? null,
        end_date: e.end_date ?? null,
        status: e.status ?? null,
        participant_count: e.participant_count ?? null,
        readiness: null,
      } as EngagementListItem);
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const closeAssistantsModal = () => {
    setAssistantsModalOpen(false);
    setAssistantsEngagement(null);
    setAddAssistantsOpen(false);
    setSelectedEmployeeIds(new Set());
    setEmployeeSearch("");
  };

  const handleRemoveAssistant = async (employeeId: number) => {
    if (!assistantsEngagement) return;
    setRemovingAssistantId(employeeId);
    setAssistantsError(null);
    try {
      await onboardingAssistantsApi.remove(assistantsEngagement.engagement_id, employeeId);
      await fetchAssistants(assistantsEngagement.engagement_id);
    } catch (err) {
      setAssistantsError(getApiError(err));
    } finally {
      setRemovingAssistantId(null);
    }
  };

  const openAddAssistants = async () => {
    setAddAssistantsOpen(true);
    setSelectedEmployeeIds(new Set());
    setEmployeeSearch("");
    setAllEmployeesLoading(true);
    try {
      const res = await employeesApi.list({ status: "active", limit: 100 });
      setAllEmployees(res.data.data);
    } catch (err) {
      setAssistantsError(getApiError(err));
    } finally {
      setAllEmployeesLoading(false);
    }
  };

  const toggleEmployeeSelection = (id: number) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssignAssistants = async () => {
    if (!assistantsEngagement || selectedEmployeeIds.size === 0) return;
    setAssigningAssistants(true);
    setAssistantsError(null);
    try {
      await onboardingAssistantsApi.assign(
        assistantsEngagement.engagement_id,
        Array.from(selectedEmployeeIds)
      );
      setAddAssistantsOpen(false);
      setSelectedEmployeeIds(new Set());
      await fetchAssistants(assistantsEngagement.engagement_id);
    } catch (err) {
      setAssistantsError(getApiError(err));
    } finally {
      setAssigningAssistants(false);
    }
  };

  // Employees not yet assigned as assistants for this engagement
  const assignedIds = new Set(assistants.map((a) => a.employee_id));
  const assignableRoles = new Set(["admin", "onboarding_assistant", "organization_manager"]);
  const availableEmployees = allEmployees.filter(
    (e) => !assignedIds.has(e.employee_id) && assignableRoles.has((e.role ?? "").toLowerCase())
  );
  const filteredEmployees = employeeSearch.trim()
    ? availableEmployees.filter((e) => {
      const q = employeeSearch.trim().toLowerCase();
      const name = getEmployeeDisplayName(e, {}).toLowerCase();
      return (
        String(e.employee_id).includes(q) ||
        (e.role ?? "").toLowerCase().includes(q) ||
        name.includes(q)
      );
    })
    : availableEmployees;

  const openParticipants = (row: EngagementListItem) => {
    setParticipantsSource({
      kind: "engagement-id",
      engagementId: row.engagement_id,
      name: row.engagement_name ?? row.engagement_code ?? undefined,
    });
  };

  const openOccupiedSlots = (row: EngagementListItem) => {
    if (row.engagement_code) {
      setOccupiedSlotsSource({
        kind: "engagement-code",
        code: row.engagement_code,
        name: row.engagement_name ?? row.engagement_code,
      });
    } else {
      setOccupiedSlotsSource({ kind: "public" });
    }
  };

  const columns: Column<EngagementListItem>[] = useMemo(() => {
    const base: Column<EngagementListItem>[] = [
      { key: "engagement_name", label: "Name", sortable: true, render: (r) => r.engagement_name || r.engagement_code || "—" },
    ];

    if (listTab === "organizations") {
      base.push({
        key: "organization_id",
        label: "Organisation",
        sortable: true,
        render: (r) => getOrgName(r.organization_id ?? 0),
        hideOnMobile: true,
      });
    } else {
      base.push({
        key: "participant_count",
        label: "Participants",
        sortable: false,
        render: (r) => r.participant_count ?? 0,
        hideOnMobile: true,
      });
    }

    base.push(
      { key: "engagement_type", label: "Type", sortable: true, hideOnTablet: true },
      { key: "city", label: "City", sortable: true, hideOnTablet: true },
      { key: "start_date", label: "Start", sortable: true, hideOnMobile: true, render: (r) => formatDate(r.start_date) },
      { key: "end_date", label: "End", sortable: true, hideOnTablet: true, render: (r) => formatDate(r.end_date) },
      {
        key: "readiness",
        label: "Readiness",
        sortable: false,
        hideOnMobile: true,
        render: (r) => {
          const rd = r.readiness;
          const empty = !rd || rd.total === 0;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openChecklistModal(r);
              }}
              className="text-left w-full max-w-[140px] rounded-lg p-1 -m-1 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              {empty ? (
                <span className="text-zinc-500">—</span>
              ) : (
                <>
                  <div className="text-xs font-medium text-zinc-900">
                    {rd.done}/{rd.total}
                  </div>
                  <div className="mt-1 h-1.5 w-full bg-zinc-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded transition-all"
                      style={{ width: `${rd.percent}%` }}
                    />
                  </div>
                  {rd.percent === 100 ? (
                    <span className="inline-flex items-center gap-0.5 mt-1 text-[10px] font-medium bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                      <Check className="w-3 h-3 shrink-0" />
                      Ready
                    </span>
                  ) : null}
                </>
              )}
            </button>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => {
          const normalized = (row.status ?? "").toLowerCase();
          const statusStyles: Record<string, string> = {
            draft: "bg-zinc-100 text-zinc-600",
            scheduled: "bg-blue-50 text-blue-700",
            running: "bg-emerald-50 text-emerald-700",
            completed: "bg-zinc-100 text-zinc-500",
            cancelled: "bg-red-50 text-red-600",
          };
          const cls = statusStyles[normalized] ?? "bg-zinc-100 text-zinc-500";
          return (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openStatusChange(row);
              }}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls} hover:ring-2 hover:ring-zinc-300 transition-shadow`}
              title={`Status: ${formatEngagementStatusLabel(row.status)} — click to change`}
            >
              {formatEngagementStatusLabel(row.status)}
            </button>
          );
        },
      }
    );

    return base;
  }, [listTab, organizations, fetchList, openStatusChange]);

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
    setPage(1);
  };

  return (
    <>
      <div className={asModalForEngagementId ? "hidden" : ""}>
        <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Engagements</h1>
        {listTab === "organizations" ? (
          <button
            onClick={() => void openAdd()}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Engagement</span>
          </button>
        ) : null}
      </div>

      <div className="flex gap-1 mb-5 border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setListTab("organizations")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            listTab === "organizations"
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Organizations
        </button>
        <button
          type="button"
          onClick={() => setListTab("users")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            listTab === "users"
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Users
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
            placeholder="Search by name, code, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <div className="flex flex-row gap-3 flex-wrap sm:flex-nowrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All cities</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <div className="relative flex-1 sm:flex-none sm:w-auto" ref={statusFilterRef}>
            <button
              type="button"
              onClick={() => setStatusFilterOpen((open) => !open)}
              className="w-full sm:w-auto min-w-[10rem] px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white flex items-center justify-between gap-2"
            >
              <span className="truncate">{formatStatusFiltersLabel(statusFilters)}</span>
              <ChevronDown className="w-4 h-4 shrink-0 text-zinc-500" />
            </button>
            {statusFilterOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-zinc-200 bg-white shadow-lg p-2">
                <button
                  type="button"
                  onClick={() => setStatusFilters([])}
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-zinc-50 text-zinc-700"
                >
                  All statuses
                </button>
                <div className="my-1 border-t border-zinc-100" />
                {STATUS_OPTIONS.map((status) => {
                  const checked = statusFilters.includes(status);
                  return (
                    <label
                      key={status}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-zinc-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setStatusFilters((prev) =>
                            prev.includes(status)
                              ? prev.filter((value) => value !== status)
                              : [...prev, status]
                          );
                        }}
                        className="rounded border-zinc-300"
                      />
                      <span>{formatEngagementStatusLabel(status)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
            keyExtractor={(r) => r.engagement_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={openView}
            onEdit={openEdit}
            onParticipants={openParticipants}
            onOccupiedSlots={openOccupiedSlots}
            onAssistants={openAssistantsModal}
            onManageChecklists={(r) => openChecklistModal(r)}
            onDelete={(r) => setDeleteConfirm(r)}
            renderExtraMenuItems={(row, closeMenu) => (
              <button
                type="button"
                onClick={() => {
                  openStatusChange(row);
                  closeMenu();
                }}
                className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
              >
                <ArrowRightLeft className="w-4 h-4" /> Change status
              </button>
            )}
            pagination={{
              page,
              limit,
              total,
              onPageChange: setPage,
            }}
          />
        )}
      </div>
      </div>

      <EngagementFormModal
        open={modalOpen && (modalMode === "add" || modalMode === "edit")}
        mode={modalMode === "edit" ? "edit" : "add"}
        initialData={formData}
        organizations={organizations}
        assessmentPackages={assessmentPackages}
        diagnosticPackages={diagnosticPackages}
        notificationServices={notificationServices}
        submitting={submitting}
        onClose={() => {
          setModalOpen(false);
          if (onCloseModal) onCloseModal();
        }}
        onSubmit={(data) => void handleSubmit(data)}
      />


      <EngagementDrawer
        open={drawerOpen}
        engagementId={drawerEngagementId}
        readiness={drawerReadiness}
        onClose={closeDrawer}
        getOrgName={(organizationId) => getOrgName(organizationId ?? 0)}
        assessmentPackages={assessmentPackages}
        diagnosticPackages={diagnosticPackages}
        notificationServiceLabel={notificationServiceLabel}
        onEdit={(engagement) => {
          closeDrawer();
          void openEdit(engagement);
        }}
        onViewParticipants={(engagement) => {
          setParticipantsSource({
            kind: "engagement-id",
            engagementId: engagement.engagement_id,
            name: engagement.engagement_name ?? engagement.engagement_code ?? undefined,
          });
        }}
      />


      {statusChangeTarget && (
        <Modal
          open={!!statusChangeTarget}
          onClose={() => {
            if (statusChangeSubmitting) return;
            setStatusChangeTarget(null);
            setStatusChangeError(null);
          }}
          title="Change engagement status"
          maxWidthClassName="max-w-md"
        >
          <p className="text-zinc-600 text-sm mb-4">
            Update status for &quot;
            {statusChangeTarget.engagement_name || statusChangeTarget.engagement_code}
            &quot;. Current status:{" "}
            <span className="font-medium text-zinc-800">
              {formatEngagementStatusLabel(statusChangeTarget.status)}
            </span>
            .
          </p>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5" htmlFor="engagement-status-select">
            New status
          </label>
          <select
            id="engagement-status-select"
            value={statusChangeNext}
            onChange={(e) => setStatusChangeNext(e.target.value as EngagementStatus)}
            disabled={statusChangeSubmitting}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatEngagementStatusLabel(status)}
              </option>
            ))}
          </select>
          {statusChangeError ? (
            <p className="mt-3 text-sm text-red-600">{statusChangeError}</p>
          ) : null}
          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-5">
            <button
              type="button"
              onClick={() => void handleStatusChange()}
              disabled={
                statusChangeSubmitting ||
                (statusChangeTarget.status ?? "").toLowerCase() === statusChangeNext
              }
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {statusChangeSubmitting ? "Saving..." : "Save status"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusChangeTarget(null);
                setStatusChangeError(null);
              }}
              disabled={statusChangeSubmitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Engagement"
        >
          <p className="text-zinc-600 text-sm mb-2">
            Permanently delete engagement &quot;{deleteConfirm.engagement_name || deleteConfirm.engagement_code}&quot;?
          </p>
          <p className="text-zinc-500 text-xs mb-4">
            This removes the engagement and all data scoped to it: participants, assessment instances,
            questionnaire responses, reports, checklists, and onboarding assistant assignments. User accounts
            are not deleted.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {addChecklistPromptOpen && (
        <Modal
          open={addChecklistPromptOpen}
          onClose={() => {
            // Backdrop/X close — treat same as "No": open assistants directly.
            const id = pendingAssistantsEngagementId;
            setAddChecklistPromptOpen(false);
            setAddChecklistPromptEngagementId(null);
            setPendingAssistantsEngagementId(null);
            if (id != null) void openAssistantsModalById(id);
          }}
          title="Add a checklist?"
          maxWidthClassName="max-w-md"
        >
          <p className="text-zinc-600 text-sm mb-4">
            Do you want to add a checklist for this engagement?
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => {
                const id = addChecklistPromptEngagementId;
                setAddChecklistPromptOpen(false);
                setAddChecklistPromptEngagementId(null);
                // pendingAssistantsEngagementId intentionally left set here.
                // closeChecklistModal will consume it and open the assistants panel
                // once the user closes the checklist modal.
                if (id != null) void openChecklistForEngagementId(id);
              }}
              disabled={addChecklistPromptBusy || addChecklistPromptEngagementId == null}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {addChecklistPromptBusy ? "Opening..." : "Yes"}
            </button>
            <button
              type="button"
              onClick={() => {
                // "No" — skip checklist and open the Onboarding Assistants panel directly.
                const id = pendingAssistantsEngagementId;
                setAddChecklistPromptOpen(false);
                setAddChecklistPromptEngagementId(null);
                setPendingAssistantsEngagementId(null);
                if (id != null) void openAssistantsModalById(id);
              }}
              disabled={addChecklistPromptBusy}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              No
            </button>
          </div>
        </Modal>
      )}

      {participantsSource && (
        <ParticipantsModal
          open={!!participantsSource}
          onClose={() => setParticipantsSource(null)}
          source={participantsSource}
        />
      )}

      {occupiedSlotsSource && (
        <OccupiedSlotsModal
          open={!!occupiedSlotsSource}
          onClose={() => setOccupiedSlotsSource(null)}
          source={occupiedSlotsSource}
        />
      )}

      <EngagementChecklistModal
        open={checklistModalOpen}
        onClose={closeChecklistModal}
        engagement={checklistEngagement}
        onChanged={() => void fetchList()}
      />

      {/* ── Onboarding Assistants Modal ─────────────────────── */}
      <Modal
        open={assistantsModalOpen}
        onClose={closeAssistantsModal}
        title={
          assistantsEngagement
            ? `Onboarding Assistants — ${assistantsEngagement.engagement_name || assistantsEngagement.engagement_code || "Engagement"}`
            : "Onboarding Assistants"
        }
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-4">
          {assistantsError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {assistantsError}
            </div>
          )}

          {assistantsEngagement &&
            (assistantsEngagement.status ?? "").toLowerCase() === "running" && (
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                <p className="text-xs font-medium text-zinc-600 mb-2">
                  Console URL for assigned assistants
                </p>
                <ConsoleUrlActions engagementId={assistantsEngagement.engagement_id} />
              </div>
            )}

          {/* Assigned assistants list */}
          {!addAssistantsOpen && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700">
                  Assigned ({assistants.length})
                </p>
                <button
                  type="button"
                  onClick={openAddAssistants}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Assistants
                </button>
              </div>

              {assistantsLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              ) : assistants.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  No onboarding assistants assigned yet.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
                  {assistants.map((a) => (
                    <li
                      key={a.employee_id}
                      className="flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-zinc-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                          <UserCog className="w-4 h-4 text-zinc-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            {getEmployeeDisplayName(a, {})}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {a.role ? `Role: ${a.role}` : "No role"}{" "}
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ml-1 ${a.status === "active"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-zinc-100 text-zinc-500"
                                }`}
                            >
                              {a.status ?? "—"}
                            </span>
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAssistant(a.employee_id)}
                        disabled={removingAssistantId === a.employee_id}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 shrink-0"
                        title="Remove assistant"
                        aria-label="Remove assistant"
                      >
                        {removingAssistantId === a.employee_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* Add assistants sub-panel */}
          {addAssistantsOpen && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700">
                  Select employees to assign
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAddAssistantsOpen(false);
                    setSelectedEmployeeIds(new Set());
                    setEmployeeSearch("");
                  }}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="search"
                  placeholder="Search by name, role, or ID…"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                />
              </div>

              {/* Employee list */}
              {allEmployeesLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-500">
                  {availableEmployees.length === 0
                    ? "All active employees are already assigned."
                    : "No employees match your search."}
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  {filteredEmployees.map((e) => {
                    const checked = selectedEmployeeIds.has(e.employee_id);
                    return (
                      <li
                        key={e.employee_id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 ${checked ? "bg-zinc-50" : "bg-white"
                          }`}
                        onClick={() => toggleEmployeeSelection(e.employee_id)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmployeeSelection(e.employee_id)}
                          onClick={(ev) => ev.stopPropagation()}
                          className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            {getEmployeeDisplayName(e, {})}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {e.role ? `Role: ${e.role}` : "No role"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Assign button */}
              <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAssignAssistants}
                  disabled={selectedEmployeeIds.size === 0 || assigningAssistants}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
                >
                  {assigningAssistants
                    ? "Assigning…"
                    : `Assign${selectedEmployeeIds.size > 0 ? ` (${selectedEmployeeIds.size})` : ""}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddAssistantsOpen(false);
                    setSelectedEmployeeIds(new Set());
                    setEmployeeSearch("");
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

    </>
  );
}
