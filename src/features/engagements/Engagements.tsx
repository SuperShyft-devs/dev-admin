import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Loader2,
  RefreshCw,
  Users,
  UserCog,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  ClipboardList,
  Settings,
  CloudCog,
  Send,
  UserPlus,
  Link2,
  Bell,
} from "lucide-react";
import { EngagementNotificationModal } from "./EngagementNotificationModal";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { ParticipantsModal } from "../../shared/ui/ParticipantsModal";
import { AssignParticipantsFromCsv } from "../../shared/ui/AssignParticipantsFromCsv";
import { OccupiedSlotsModal } from "../../shared/ui/OccupiedSlotsModal";
import {
  engagementsApi,
  organizationsApi,
  assessmentPackagesApi,
  diagnosticPackagesApi,
  employeesApi,
  onboardingAssistantsApi,
  engagementQuestionnaireStatusApi,
  type EngagementListItem,
  type Engagement,
  type EngagementCreate,
  type EngagementKind,
  type EngagementQuestionnaireStatusResponse,
  type DiagnosticPackageListItem,
  type OrganizationListItem,
  type AssessmentPackage,
  type EmployeeListItem,
  type OnboardingAssistant,
  engagementChecklistsApi,
  checklistTemplatesApi,
  checklistTasksApi,
  type EngagementChecklist,
  type ChecklistTemplate,
  type ChecklistTask,
  type UserListItem,
  getApiError,
  engagementAssessmentPackagesApi,
  type EngagementAssessmentPackageSummary,
} from "../../lib/api";
import { useLocation } from "react-router-dom";

const ENGAGEMENT_KIND_OPTIONS: EngagementKind[] = ["bio_ai", "diagnostic", "doctor", "nutritionist"];

const STATUS_OPTIONS = ["active", "inactive", "archived"];

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
                                    className={`mt-1 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                      doneTask
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

export function Engagements() {
  const location = useLocation();
  const [data, setData] = useState<EngagementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string>("engagement_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [assessmentPackages, setAssessmentPackages] = useState<AssessmentPackage[]>([]);
  const [diagnosticPackages, setDiagnosticPackages] = useState<DiagnosticPackageListItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "add" | "edit">("view");
  const [selected, setSelected] = useState<Engagement | null>(null);
  const [formData, setFormData] = useState<EngagementCreate>({
    engagement_name: "",
    metsights_engagement_id: "",
    organization_id: 0,
    engagement_type: "doctor",
    engagement_code: "",
    assessment_package_id: 0,
    diagnostic_package_id: undefined,
    city: "",
    address: "",
    pincode: "",
    slot_duration: 60,
    start_date: "",
    end_date: "",
    create_profile_on_metsights: false,
    enroll_for_fitprint_full: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<EngagementListItem | null>(null);

  const [participantsSource, setParticipantsSource] = useState<
    | { kind: "engagement-code"; code: string; name?: string }
    | { kind: "public" }
    | null
  >(null);

  const [occupiedSlotsSource, setOccupiedSlotsSource] = useState<
    | { kind: "engagement-code"; code: string; name?: string }
    | { kind: "public" }
    | null
  >(null);

  // ── Onboarding Assistants state ──────────────────────────────
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

  // ── Questionnaire Status state ──────────────────────────────
  const [qStatusOpen, setQStatusOpen] = useState(false);
  const [qStatusData, setQStatusData] = useState<EngagementQuestionnaireStatusResponse | null>(null);
  const [qStatusLoading, setQStatusLoading] = useState(false);
  const [qStatusError, setQStatusError] = useState<string | null>(null);

  const [notifyModalOpen, setNotifyModalOpen] = useState(false);

  // ── Engagement Assessments modal state ─────────────────────
  const [assessmentsModalOpen, setAssessmentsModalOpen] = useState(false);
  const [assessmentsList, setAssessmentsList] = useState<EngagementAssessmentPackageSummary[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null);
  const [assessmentDeleteConfirm, setAssessmentDeleteConfirm] = useState<EngagementAssessmentPackageSummary | null>(null);
  const [assessmentDeleting, setAssessmentDeleting] = useState(false);
  const [assessmentAssignOpen, setAssessmentAssignOpen] = useState(false);
  const [assessmentAssigning, setAssessmentAssigning] = useState(false);
  const [assessmentAssignResult, setAssessmentAssignResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [assessmentSyncingPackageId, setAssessmentSyncingPackageId] = useState<number | null>(null);
  const [assessmentSyncResult, setAssessmentSyncResult] = useState<{
    package_id: number;
    package_name: string;
    created: number;
    skipped: number;
    errors: number;
  } | null>(null);
  const [assessmentSyncError, setAssessmentSyncError] = useState<string | null>(null);
  const [assessmentConnectingPackageId, setAssessmentConnectingPackageId] = useState<number | null>(null);
  const [assessmentConnectResult, setAssessmentConnectResult] = useState<{
    package_id: number;
    package_name: string;
    connected: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [assessmentConnectError, setAssessmentConnectError] = useState<string | null>(null);
  const [selectedAssignPackageCode, setSelectedAssignPackageCode] = useState("");
  const [allActivePackages, setAllActivePackages] = useState<AssessmentPackage[]>([]);

  // ── Push Questionnaires to Metsights state ────────────────
  const [pushConfirmPkg, setPushConfirmPkg] = useState<EngagementAssessmentPackageSummary | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ pushed: number; skipped: number; errors: number } | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [advSettingsPackages, setAdvSettingsPackages] = useState<EngagementAssessmentPackageSummary[]>([]);
  const [advSettingsLoading, setAdvSettingsLoading] = useState(false);
  const [createProfilesOpen, setCreateProfilesOpen] = useState(false);
  const [creatingProfiles, setCreatingProfiles] = useState(false);
  const [createProfilesResult, setCreateProfilesResult] = useState<{
    created: number;
    skipped: number;
    failed: number;
    total: number;
  } | null>(null);
  const [createProfilesError, setCreateProfilesError] = useState<string | null>(null);

  const openChecklistModal = (row: EngagementListItem) => {
    setChecklistEngagement(row);
    setChecklistModalOpen(true);
  };

  const closeChecklistModal = () => {
    setChecklistModalOpen(false);
    setChecklistEngagement(null);
  };

  const fetchOrgs = useCallback(async () => {
    try {
      const r = await organizationsApi.list({ page: 1, limit: 100 });
      setOrganizations(r.data.data);
    } catch (err) {
      setError(getApiError(err));
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

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await engagementsApi.list({
        page,
        limit,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        engagement_type: typeFilter || undefined,
        city: cityFilter || undefined,
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
  }, [page, limit, statusFilter, search, typeFilter, cityFilter, sortKey, sortDir]);

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
  }, [search, statusFilter, typeFilter, cityFilter]);

  const openView = (row: EngagementListItem) => {
    setQStatusOpen(false);
    setQStatusData(null);
    setQStatusError(null);
    setAssessmentsModalOpen(false);
    setAssessmentsList([]);
    setAssessmentsError(null);
    setPushConfirmPkg(null);
    setAdvSettingsPackages([]);
    engagementsApi.get(row.engagement_id).then((res) => {
      setSelected(res.data.data);
      setModalMode("view");
      setModalOpen(true);
    }).catch((err) => setError(getApiError(err)));
  };

  const loadAssessmentsForEngagement = useCallback(async (engagementId: number) => {
    setAssessmentsLoading(true);
    setAssessmentsError(null);
    try {
      const res = await engagementAssessmentPackagesApi.list(engagementId);
      setAssessmentsList(res.data.data);
    } catch (err) {
      setAssessmentsError(getApiError(err));
    } finally {
      setAssessmentsLoading(false);
    }
  }, []);

  const openAssessmentsModal = useCallback(async (engagementId: number) => {
    setAssessmentsModalOpen(true);
    setAssessmentDeleteConfirm(null);
    setAssessmentAssignOpen(false);
    setAssessmentAssignResult(null);
    setAssessmentSyncResult(null);
    setAssessmentSyncError(null);
    setAssessmentSyncingPackageId(null);
    setSelectedAssignPackageCode("");
    await loadAssessmentsForEngagement(engagementId);
  }, [loadAssessmentsForEngagement]);

  const handleAssessmentDelete = useCallback(async () => {
    if (!assessmentDeleteConfirm || !selected) return;
    setAssessmentDeleting(true);
    try {
      await engagementAssessmentPackagesApi.remove(selected.engagement_id, assessmentDeleteConfirm.package_code);
      setAssessmentDeleteConfirm(null);
      await loadAssessmentsForEngagement(selected.engagement_id);
    } catch (err) {
      setAssessmentsError(getApiError(err));
      setAssessmentDeleteConfirm(null);
    } finally {
      setAssessmentDeleting(false);
    }
  }, [assessmentDeleteConfirm, selected, loadAssessmentsForEngagement]);

  const handleAssessmentAssign = useCallback(async () => {
    if (!selectedAssignPackageCode || !selected) return;
    setAssessmentAssigning(true);
    setAssessmentAssignResult(null);
    try {
      const res = await engagementAssessmentPackagesApi.add(selected.engagement_id, selectedAssignPackageCode);
      const d = res.data.data;
      setAssessmentAssignResult({
        created: d.created.length,
        skipped: d.skipped.length,
        errors: d.errors.length,
      });
      await loadAssessmentsForEngagement(selected.engagement_id);
    } catch (err) {
      setAssessmentsError(getApiError(err));
    } finally {
      setAssessmentAssigning(false);
    }
  }, [selectedAssignPackageCode, selected, loadAssessmentsForEngagement]);

  const handleAssessmentSyncPackage = useCallback(async (pkg: EngagementAssessmentPackageSummary) => {
    if (!selected) return;
    setAssessmentSyncingPackageId(pkg.package_id);
    setAssessmentSyncResult(null);
    setAssessmentSyncError(null);
    try {
      const res = await engagementAssessmentPackagesApi.add(selected.engagement_id, pkg.package_code);
      const d = res.data.data;
      setAssessmentSyncResult({
        package_id: pkg.package_id,
        package_name: pkg.display_name,
        created: d.created.length,
        skipped: d.skipped.length,
        errors: d.errors.length,
      });
      await loadAssessmentsForEngagement(selected.engagement_id);
    } catch (err) {
      setAssessmentSyncError(getApiError(err));
    } finally {
      setAssessmentSyncingPackageId(null);
    }
  }, [selected, loadAssessmentsForEngagement]);

  const handleAssessmentConnectMetsights = useCallback(async (pkg: EngagementAssessmentPackageSummary) => {
    if (!selected) return;
    setAssessmentConnectingPackageId(pkg.package_id);
    setAssessmentConnectResult(null);
    setAssessmentConnectError(null);
    try {
      const res = await engagementAssessmentPackagesApi.connectMetsightsRecords(
        selected.engagement_id,
        pkg.package_id
      );
      const d = res.data.data;
      setAssessmentConnectResult({
        package_id: pkg.package_id,
        package_name: pkg.display_name,
        connected: d.connected,
        skipped: d.skipped,
        failed: d.failed,
      });
      await loadAssessmentsForEngagement(selected.engagement_id);
    } catch (err) {
      setAssessmentConnectError(getApiError(err));
    } finally {
      setAssessmentConnectingPackageId(null);
    }
  }, [selected, loadAssessmentsForEngagement]);

  const handlePushQuestionnaires = useCallback(async () => {
    if (!selected || !pushConfirmPkg) return;
    setPushing(true);
    setPushResult(null);
    setPushError(null);
    try {
      const res = await engagementAssessmentPackagesApi.pushQuestionnaires(
        selected.engagement_id,
        pushConfirmPkg.package_id,
      );
      const d = res.data.data;
      setPushResult({ pushed: d.pushed, skipped: d.skipped, errors: d.errors });
    } catch (err) {
      setPushError(getApiError(err));
    } finally {
      setPushing(false);
    }
  }, [selected, pushConfirmPkg]);

  const loadAdvSettingsPackages = useCallback(async (engagementId: number) => {
    setAdvSettingsLoading(true);
    try {
      const res = await engagementAssessmentPackagesApi.list(engagementId);
      setAdvSettingsPackages(res.data.data);
    } catch {
      setAdvSettingsPackages([]);
    } finally {
      setAdvSettingsLoading(false);
    }
  }, []);

  const handleCreateMetsightsProfiles = useCallback(async () => {
    if (!selected) return;
    setCreatingProfiles(true);
    setCreateProfilesResult(null);
    setCreateProfilesError(null);
    try {
      const res = await engagementsApi.createMetsightsProfiles(selected.engagement_id);
      const d = res.data.data;
      setCreateProfilesResult({
        created: d.created,
        skipped: d.skipped,
        failed: d.failed,
        total: d.total,
      });
    } catch (err) {
      setCreateProfilesError(getApiError(err));
    } finally {
      setCreatingProfiles(false);
    }
  }, [selected]);

  const openAdd = (preset?: Partial<EngagementCreate>) => {
    setSelected(null);
    const today = new Date().toISOString().slice(0, 10);
    const nextOrganizationId =
      preset?.organization_id ?? organizations[0]?.organization_id ?? 0;
    const nextAssessmentPackageId =
      preset?.assessment_package_id ?? assessmentPackages[0]?.package_id ?? 0;
    setFormData({
      engagement_name: preset?.engagement_name ?? "",
      metsights_engagement_id: preset?.metsights_engagement_id ?? "",
      organization_id: nextOrganizationId,
      engagement_type: (preset?.engagement_type as EngagementKind | undefined) ?? "doctor",
      engagement_code: preset?.engagement_code ?? "",
      assessment_package_id: nextAssessmentPackageId,
      diagnostic_package_id: undefined,
      city: preset?.city ?? "",
      address: preset?.address ?? "",
      pincode: preset?.pincode ?? "",
      slot_duration: preset?.slot_duration ?? 60,
      start_date: preset?.start_date ?? today,
      end_date: preset?.end_date ?? today,
      create_profile_on_metsights: preset?.create_profile_on_metsights ?? false,
      enroll_for_fitprint_full: preset?.enroll_for_fitprint_full ?? false,
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
    engagementsApi.get(row.engagement_id).then((res) => {
      const e = res.data.data;
      setSelected(e);
      setFormData({
        engagement_name: e.engagement_name ?? "",
        metsights_engagement_id: e.metsights_engagement_id ?? "",
        organization_id: e.organization_id ?? 0,
        engagement_type: (e.engagement_type as EngagementKind | undefined) ?? "doctor",
        engagement_code: e.engagement_code ?? "",
        assessment_package_id: e.assessment_package_id ?? 0,
        diagnostic_package_id: e.diagnostic_package_id ?? undefined,
        city: e.city ?? "",
        address: e.address ?? "",
        pincode: e.pincode ?? "",
        slot_duration: e.slot_duration ?? 60,
        start_date: (e.start_date ?? "").toString().slice(0, 10),
        end_date: (e.end_date ?? "").toString().slice(0, 10),
        create_profile_on_metsights: Boolean(e.create_profile_on_metsights),
        enroll_for_fitprint_full: Boolean(e.enroll_for_fitprint_full),
      });
      setModalMode("edit");
      setModalOpen(true);
    }).catch((err) => setError(getApiError(err)));
  };

  const handleSubmit = async () => {
    if (!formData.organization_id || !formData.start_date || !formData.end_date) {
      setError("Please fill required fields");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (modalMode === "add") {
        const createPayload: EngagementCreate = {
          ...formData,
          metsights_engagement_id: formData.metsights_engagement_id?.trim() || null,
          assessment_package_id:
            formData.assessment_package_id && formData.assessment_package_id > 0
              ? formData.assessment_package_id
              : null,
          diagnostic_package_id:
            formData.diagnostic_package_id && formData.diagnostic_package_id > 0
              ? formData.diagnostic_package_id
              : null,
          create_profile_on_metsights: Boolean(formData.create_profile_on_metsights),
          enroll_for_fitprint_full: Boolean(formData.enroll_for_fitprint_full),
        };
        const created = await engagementsApi.create(createPayload);
        const engagementId = created.data.data.engagement_id;
        setAddChecklistPromptEngagementId(engagementId);
        setAddChecklistPromptOpen(true);
      } else if (selected) {
        const payload = {
          engagement_name: formData.engagement_name,
          engagement_code: (formData.engagement_code ?? "").trim(),
          metsights_engagement_id: formData.metsights_engagement_id?.trim() || null,
          organization_id: formData.organization_id,
          engagement_type: formData.engagement_type,
          assessment_package_id:
            formData.assessment_package_id && formData.assessment_package_id > 0
              ? formData.assessment_package_id
              : null,
          diagnostic_package_id:
            formData.diagnostic_package_id && formData.diagnostic_package_id > 0
              ? formData.diagnostic_package_id
              : null,
          city: formData.city,
          address: formData.address,
          pincode: formData.pincode,
          slot_duration: formData.slot_duration,
          start_date: formData.start_date,
          end_date: formData.end_date,
          create_profile_on_metsights: Boolean(formData.create_profile_on_metsights),
          enroll_for_fitprint_full: Boolean(formData.enroll_for_fitprint_full),
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
        engagement_type: (e.engagement_type as EngagementKind | undefined) ?? "doctor",
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
  const availableEmployees = allEmployees.filter((e) => !assignedIds.has(e.employee_id));
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
    if (row.engagement_code) {
      setParticipantsSource({
        kind: "engagement-code",
        code: row.engagement_code,
        name: row.engagement_name ?? row.engagement_code,
      });
    } else {
      setParticipantsSource({ kind: "public" });
    }
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

  const columns: Column<EngagementListItem>[] = [
    { key: "engagement_name", label: "Name", sortable: true, render: (r) => r.engagement_name || r.engagement_code || "—" },
    { key: "organization_id", label: "Organisation", sortable: true, render: (r) => getOrgName(r.organization_id ?? 0), hideOnMobile: true },
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
        const isActive = (row.status ?? "").toLowerCase() === "active";
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const nextStatus = isActive ? "inactive" : "active";
              engagementsApi
                .updateStatus(row.engagement_id, nextStatus)
                .then(() => fetchList())
                .catch((err) => setError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition ${
              isActive ? "bg-emerald-500" : "bg-zinc-300"
            }`}
            aria-pressed={isActive}
            aria-label={`Set ${row.engagement_name ?? "engagement"} ${isActive ? "inactive" : "active"}`}
          >
            <span
              className={`h-5 w-5 bg-white rounded-full shadow transform transition ${
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
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Engagements</h1>
        <button
            onClick={() => openAdd()}
          className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Add Engagement</span>
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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
        title={
          modalMode === "add"
            ? "Add Engagement"
            : modalMode === "edit"
            ? "Edit Engagement"
            : "View Engagement"
        }
      >
        {modalMode === "view" && selected ? (
          <div className="space-y-3 text-sm">
            <div><span className="text-zinc-500">Name:</span> {selected.engagement_name ?? "—"}</div>
            <div><span className="text-zinc-500">Metsights Engagement ID:</span> {selected.metsights_engagement_id ?? "—"}</div>
            <div><span className="text-zinc-500">Code:</span> {selected.engagement_code ?? "—"}</div>
            <div><span className="text-zinc-500">Organisation:</span> {getOrgName(selected.organization_id ?? 0)}</div>
            <div><span className="text-zinc-500">Type:</span> {selected.engagement_type ?? "—"}</div>
            <div><span className="text-zinc-500">City:</span> {selected.city ?? "—"}</div>
            <div><span className="text-zinc-500">Address:</span> {selected.address ?? "—"}</div>
            <div><span className="text-zinc-500">Pincode:</span> {selected.pincode ?? "—"}</div>
            <div><span className="text-zinc-500">Start:</span> {String(selected.start_date ?? "—")}</div>
            <div><span className="text-zinc-500">End:</span> {String(selected.end_date ?? "—")}</div>
            <div><span className="text-zinc-500">Status:</span> {selected.status ?? "—"}</div>
            <div><span className="text-zinc-500">Create profile on Metsights:</span> {selected.create_profile_on_metsights ? "Yes" : "No"}</div>
            <div><span className="text-zinc-500">Enroll for FitPrint Full:</span> {selected.enroll_for_fitprint_full ? "Yes" : "No"}</div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-zinc-500">Participants:</span>
              <span>{selected.participant_count ?? 0}</span>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  if (selected.engagement_code) {
                    setParticipantsSource({
                      kind: "engagement-code",
                      code: selected.engagement_code,
                      name: selected.engagement_name ?? selected.engagement_code,
                    });
                  } else {
                    setParticipantsSource({ kind: "public" });
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium"
              >
                <Users className="w-3.5 h-3.5" />
                View Participants
              </button>
              <AssignParticipantsFromCsv
                engagementId={selected.engagement_id}
                engagementName={selected.engagement_name ?? selected.engagement_code}
                onComplete={() => {
                  engagementsApi.get(selected.engagement_id).then((res) => {
                    setSelected(res.data.data);
                  }).catch(() => {});
                }}
              />
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setNotifyModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium"
              >
                <Bell className="w-3.5 h-3.5" />
                Notification
              </button>
            </div>

            {/* ── Questionnaire Status Section ── */}
            <div className="pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={async () => {
                  if (qStatusOpen) {
                    setQStatusOpen(false);
                    return;
                  }
                  setQStatusOpen(true);
                  if (!qStatusData && !qStatusLoading) {
                    setQStatusLoading(true);
                    setQStatusError(null);
                    try {
                      const res = await engagementQuestionnaireStatusApi.get(selected.engagement_id);
                      setQStatusData(res.data.data);
                    } catch (err) {
                      setQStatusError(getApiError(err));
                    } finally {
                      setQStatusLoading(false);
                    }
                  }
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-900"
              >
                {qStatusOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <ClipboardList className="w-4 h-4" />
                Questionnaire Status
              </button>

              {qStatusOpen && (
                <div className="mt-3">
                  {qStatusLoading && (
                    <div className="py-6 flex flex-col items-center gap-2 text-zinc-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-xs">Loading…</span>
                    </div>
                  )}

                  {!qStatusLoading && qStatusError && (
                    <p className="text-sm text-red-600">{qStatusError}</p>
                  )}

                  {!qStatusLoading && !qStatusError && qStatusData && qStatusData.participants.length === 0 && (
                    <p className="text-xs text-zinc-400 italic">
                      No assessment instances found for this engagement.
                    </p>
                  )}

                  {!qStatusLoading && !qStatusError && qStatusData && qStatusData.participants.length > 0 && (
                    <div className="space-y-3">
                      {/* Summary: 3 stat cards */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-center">
                          <div className="text-lg font-semibold text-amber-700">{qStatusData.summary.drafted}</div>
                          <div className="text-[11px] text-amber-600">Drafted</div>
                        </div>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
                          <div className="text-lg font-semibold text-emerald-700">{qStatusData.summary.submitted}</div>
                          <div className="text-[11px] text-emerald-600">Submitted</div>
                        </div>
                        <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-center">
                          <div className="text-lg font-semibold text-zinc-500">{qStatusData.summary.not_started}</div>
                          <div className="text-[11px] text-zinc-500">Not Started</div>
                        </div>
                      </div>

                      {/* Participants table */}
                      <div className="overflow-x-auto rounded-lg border border-zinc-200">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-200 bg-zinc-50">
                              <th className="px-3 py-2 text-left font-medium text-zinc-600">Participant</th>
                              <th className="px-3 py-2 text-center font-medium text-zinc-600">State</th>
                              <th className="px-3 py-2 text-center font-medium text-zinc-600">Responses</th>
                            </tr>
                          </thead>
                          <tbody>
                            {qStatusData.participants.map((row) => {
                              const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || "—";
                              return (
                                <tr
                                  key={row.user_id}
                                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                                >
                                  <td className="px-3 py-2">
                                    <div className="font-medium text-zinc-800">{name}</div>
                                    <div className="text-zinc-400">{row.phone || row.email || ""}</div>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span
                                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                        row.questionnaire_state === "submitted"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : row.questionnaire_state === "drafted"
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-zinc-100 text-zinc-500"
                                      }`}
                                    >
                                      {row.questionnaire_state === "submitted"
                                        ? "Submitted"
                                        : row.questionnaire_state === "drafted"
                                        ? "Drafted"
                                        : "Not Started"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center text-zinc-600">
                                    {row.total_responses || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Advanced Settings Section ── */}
            <div className="pt-2 border-t border-zinc-100">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 mb-2">
                <Settings className="w-4 h-4" />
                Advanced Settings
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAssessmentsModal(selected.engagement_id)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition-colors"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Manage Assessments
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateProfilesOpen(true);
                    setCreateProfilesResult(null);
                    setCreateProfilesError(null);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Create Profiles
                </button>
              </div>

              {/* ── Per-package Push Buttons ── */}
              {advSettingsPackages.length === 0 && !advSettingsLoading && (
                <button
                  type="button"
                  onClick={() => loadAdvSettingsPackages(selected.engagement_id)}
                  className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-700"
                >
                  Load push options…
                </button>
              )}
              {advSettingsLoading && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading assessments…
                </div>
              )}
              {advSettingsPackages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {advSettingsPackages.map((pkg) => (
                    <button
                      key={pkg.package_id}
                      type="button"
                      onClick={() => {
                        setPushConfirmPkg(pkg);
                        setPushResult(null);
                        setPushError(null);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Push {pkg.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.engagement_name ?? ""}
                  onChange={(e) => setFormData({ ...formData, engagement_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Metsights Engagement ID</label>
                <input
                  type="text"
                  value={formData.metsights_engagement_id ?? ""}
                  onChange={(e) => setFormData({ ...formData, metsights_engagement_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="Optional external Metsights ID"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Organisation *</label>
                <select
                  value={formData.organization_id}
                  onChange={(e) => setFormData({ ...formData, organization_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                >
                  <option value={0}>Select organisation</option>
                  {organizations.map((o) => (
                    <option key={o.organization_id} value={o.organization_id}>
                      {o.name ?? o.organization_id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Engagement Code</label>
                <input
                  type="text"
                  value={formData.engagement_code ?? ""}
                  onChange={(e) => setFormData({ ...formData, engagement_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Type *</label>
                <select
                  value={formData.engagement_type}
                  onChange={(e) =>
                    setFormData({ ...formData, engagement_type: e.target.value as EngagementKind })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                >
                  {ENGAGEMENT_KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Assessment package</label>
                <select
                  value={formData.assessment_package_id ?? 0}
                  onChange={(e) => setFormData({ ...formData, assessment_package_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value={0}>None</option>
                  {assessmentPackages.map((p) => (
                    <option key={p.package_id} value={p.package_id}>
                      {p.display_name ?? p.package_code ?? p.package_id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Diagnostic package</label>
                <select
                  value={formData.diagnostic_package_id ?? 0}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setFormData({ ...formData, diagnostic_package_id: next > 0 ? next : undefined });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value={0}>None</option>
                  {diagnosticPackages.map((p) => (
                    <option key={p.diagnostic_package_id} value={p.diagnostic_package_id}>
                      {p.package_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address ?? ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Pincode</label>
                <input
                  type="text"
                  value={formData.pincode ?? ""}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city ?? ""}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Create Profile On Metsights</label>
                <div className="flex gap-5 py-2">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="radio"
                      name="create_profile_on_metsights"
                      checked={Boolean(formData.create_profile_on_metsights)}
                      onChange={() => setFormData({ ...formData, create_profile_on_metsights: true })}
                    />
                    Yes
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="radio"
                      name="create_profile_on_metsights"
                      checked={!formData.create_profile_on_metsights}
                      onChange={() => setFormData({ ...formData, create_profile_on_metsights: false })}
                    />
                    No
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Enroll For FitPrint Full</label>
                <div className="flex gap-5 py-2">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="radio"
                      name="enroll_for_fitprint_full"
                      checked={Boolean(formData.enroll_for_fitprint_full)}
                      onChange={() => setFormData({ ...formData, enroll_for_fitprint_full: true })}
                    />
                    Yes
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="radio"
                      name="enroll_for_fitprint_full"
                      checked={!formData.enroll_for_fitprint_full}
                      onChange={() => setFormData({ ...formData, enroll_for_fitprint_full: false })}
                    />
                    No
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Slot duration (min)</label>
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={formData.slot_duration}
                  onChange={(e) => setFormData({ ...formData, slot_duration: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Start date *</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">End date *</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
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
        )}
      </Modal>

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
            setAddChecklistPromptOpen(false);
            setAddChecklistPromptEngagementId(null);
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
                setAddChecklistPromptOpen(false);
                setAddChecklistPromptEngagementId(null);
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
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ml-1 ${
                                a.status === "active"
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
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 ${
                          checked ? "bg-zinc-50" : "bg-white"
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

      {/* ── Engagement Assessments Modal ── */}
      <Modal
        open={assessmentsModalOpen}
        onClose={() => setAssessmentsModalOpen(false)}
        title={`Assessments — ${selected?.engagement_name ?? ""}`}
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={async () => {
              setAssessmentAssignOpen(true);
              setAssessmentAssignResult(null);
              setSelectedAssignPackageCode("");
              try {
                const res = await assessmentPackagesApi.list({ status: "active" });
                setAllActivePackages(res.data.data);
              } catch (err) {
                setAssessmentsError(getApiError(err));
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Assign Assessment Package
          </button>

          {assessmentsLoading && (
            <div className="py-8 flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Loading…</span>
            </div>
          )}

          {!assessmentsLoading && assessmentsError && (
            <p className="text-sm text-red-600">{assessmentsError}</p>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentSyncError && (
            <p className="text-sm text-red-600">{assessmentSyncError}</p>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentSyncResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-zinc-700">
                Sync result for <span className="font-semibold">{assessmentSyncResult.package_name}</span>
              </div>
              <div className="text-emerald-700">Created: {assessmentSyncResult.created}</div>
              <div className="text-zinc-500">Skipped: {assessmentSyncResult.skipped}</div>
              {assessmentSyncResult.errors > 0 && (
                <div className="text-red-600">Errors: {assessmentSyncResult.errors}</div>
              )}
            </div>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentConnectError && (
            <p className="text-sm text-red-600">{assessmentConnectError}</p>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentConnectResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-zinc-700">
                Connect result for <span className="font-semibold">{assessmentConnectResult.package_name}</span>
              </div>
              <div className="text-emerald-700">Connected: {assessmentConnectResult.connected}</div>
              <div className="text-zinc-500">Skipped: {assessmentConnectResult.skipped}</div>
              {assessmentConnectResult.failed > 0 && (
                <div className="text-red-600">Failed: {assessmentConnectResult.failed}</div>
              )}
            </div>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentsList.length === 0 && (
            <p className="text-xs text-zinc-400 italic py-4">
              No assessment packages assigned to this engagement.
            </p>
          )}

          {!assessmentsLoading && assessmentsList.length > 0 && (
            <div className="space-y-2">
              {assessmentsList.map((pkg) => (
                <div
                  key={pkg.package_id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-900">{pkg.display_name}</span>
                      <span className="text-[11px] text-zinc-400 font-mono">{pkg.package_code}</span>
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          pkg.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {pkg.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Assigned: {pkg.assigned_count}/{pkg.total_participants}
                      </span>
                      <span className="flex items-center gap-1">
                        <CloudCog className="w-3 h-3" />
                        Synced: {pkg.synced_count}/{pkg.assigned_count}
                      </span>
                    </div>
                    <div className="flex gap-1 h-1.5">
                      <div className="flex-1 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-zinc-400 transition-all"
                          style={{ width: pkg.total_participants > 0 ? `${(pkg.assigned_count / pkg.total_participants) * 100}%` : "0%" }}
                        />
                      </div>
                      <div className="flex-1 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all"
                          style={{ width: pkg.assigned_count > 0 ? `${(pkg.synced_count / pkg.assigned_count) * 100}%` : "0%" }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleAssessmentConnectMetsights(pkg)}
                      disabled={
                        assessmentConnectingPackageId !== null ||
                        assessmentSyncingPackageId !== null
                      }
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                      title="Connect Metsights records for assigned participants"
                    >
                      <Link2
                        className={`w-4 h-4 ${assessmentConnectingPackageId === pkg.package_id ? "animate-pulse" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAssessmentSyncPackage(pkg)}
                      disabled={
                        assessmentSyncingPackageId !== null ||
                        assessmentConnectingPackageId !== null
                      }
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50"
                      title="Assign package to missing participants"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${assessmentSyncingPackageId === pkg.package_id ? "animate-spin" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssessmentDeleteConfirm(pkg)}
                      disabled={assessmentConnectingPackageId !== null || assessmentSyncingPackageId !== null}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Remove from engagement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Assessment Delete Confirmation Modal ── */}
      <Modal
        open={assessmentDeleteConfirm !== null}
        onClose={() => setAssessmentDeleteConfirm(null)}
        title="Remove Assessment Package"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            Remove <span className="font-semibold">{assessmentDeleteConfirm?.display_name}</span> from
            all participants of this engagement?
          </p>
          <p className="text-xs text-zinc-500">
            This will delete local assessment data (instances, responses, reports).
            Metsights records will not be affected.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={handleAssessmentDelete}
              disabled={assessmentDeleting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {assessmentDeleting ? "Removing…" : "Remove"}
            </button>
            <button
              type="button"
              onClick={() => setAssessmentDeleteConfirm(null)}
              disabled={assessmentDeleting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Assessment Assign Modal ── */}
      <Modal
        open={assessmentAssignOpen}
        onClose={() => {
          setAssessmentAssignOpen(false);
          setAssessmentAssignResult(null);
          setSelectedAssignPackageCode("");
        }}
        title="Assign Assessment Package"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            Select a package to assign to all participants of{" "}
            <span className="font-semibold">{selected?.engagement_name ?? "this engagement"}</span>.
          </p>
          <select
            value={selectedAssignPackageCode}
            onChange={(e) => {
              setSelectedAssignPackageCode(e.target.value);
              setAssessmentAssignResult(null);
            }}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">Select a package…</option>
            {allActivePackages
              .filter((p) => p.package_code)
              .map((p) => (
                <option key={p.package_id} value={p.package_code!}>
                  {p.display_name ?? p.package_code} ({p.package_code})
                </option>
              ))}
          </select>

          {assessmentAssignResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-emerald-700">Created: {assessmentAssignResult.created}</div>
              <div className="text-zinc-500">Skipped (already exists): {assessmentAssignResult.skipped}</div>
              {assessmentAssignResult.errors > 0 && (
                <div className="text-red-600">Errors: {assessmentAssignResult.errors}</div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={handleAssessmentAssign}
              disabled={!selectedAssignPackageCode || assessmentAssigning}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {assessmentAssigning ? "Assigning…" : "Assign to All Participants"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAssessmentAssignOpen(false);
                setAssessmentAssignResult(null);
                setSelectedAssignPackageCode("");
              }}
              disabled={assessmentAssigning}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Create Metsights Profiles Confirmation Modal ── */}
      <Modal
        open={createProfilesOpen}
        onClose={() => {
          if (!creatingProfiles) {
            setCreateProfilesOpen(false);
            setCreateProfilesResult(null);
            setCreateProfilesError(null);
          }
        }}
        title="Create Profiles"
      >
        <div className="space-y-4">
          {!createProfilesResult && !createProfilesError && !creatingProfiles && (
            <>
              <p className="text-sm text-zinc-700">
                Create regular Metsights profiles for{" "}
                <span className="font-semibold">all participants</span> of{" "}
                <span className="font-semibold">{selected?.engagement_name ?? "this engagement"}</span> who do not
                already have a Metsights profile ID stored locally.
              </p>
              <ul className="text-xs text-zinc-500 space-y-1 list-disc pl-4">
                <li>Uses Metsights <span className="font-mono">POST /profiles/</span> (not engagement registration).</li>
                <li>Participants who already have <span className="font-mono">metsights_profile_id</span> are skipped.</li>
                <li>Users missing required fields (name, phone, gender, DOB/age) are reported as failures.</li>
              </ul>
            </>
          )}

          {creatingProfiles && (
            <div className="py-6 flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Creating Metsights profiles…</span>
            </div>
          )}

          {createProfilesError && <p className="text-sm text-red-600">{createProfilesError}</p>}

          {createProfilesResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-emerald-700">Created: {createProfilesResult.created}</div>
              <div className="text-zinc-500">
                Skipped (already linked): {createProfilesResult.skipped}
              </div>
              {createProfilesResult.failed > 0 && (
                <div className="text-red-600">Failed: {createProfilesResult.failed}</div>
              )}
              <div className="text-zinc-400">Total participants: {createProfilesResult.total}</div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            {!createProfilesResult && !createProfilesError && (
              <button
                type="button"
                onClick={handleCreateMetsightsProfiles}
                disabled={creatingProfiles}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {creatingProfiles ? "Creating…" : "Create Profiles"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCreateProfilesOpen(false);
                setCreateProfilesResult(null);
                setCreateProfilesError(null);
              }}
              disabled={creatingProfiles}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {createProfilesResult || createProfilesError ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </Modal>

      <EngagementNotificationModal
        open={notifyModalOpen}
        onClose={() => setNotifyModalOpen(false)}
        engagement={selected}
        organizationLabel={
          selected?.organization_id
            ? getOrgName(selected.organization_id)
            : undefined
        }
      />

      {/* ── Push Questionnaires Confirmation Modal ── */}
      <Modal
        open={pushConfirmPkg !== null}
        onClose={() => {
          if (!pushing) {
            setPushConfirmPkg(null);
            setPushResult(null);
            setPushError(null);
          }
        }}
        title={`Push ${pushConfirmPkg?.display_name ?? "Answers"} to Metsights`}
      >
        <div className="space-y-4">
          {!pushResult && !pushError && !pushing && (
            <>
              <p className="text-sm text-zinc-700">
                Push <span className="font-semibold">{pushConfirmPkg?.display_name}</span> answers for{" "}
                <span className="font-semibold">all participants</span> of{" "}
                <span className="font-semibold">{selected?.engagement_name ?? "this engagement"}</span> to Metsights.
              </p>
              <ul className="text-xs text-zinc-500 space-y-1 list-disc pl-4">
                <li>Participants who haven't filled any questions will be skipped.</li>
                <li>Partially filled questionnaires will push whatever answers exist.</li>
                <li>Answers from all assessment packages will be merged per participant.</li>
              </ul>
            </>
          )}

          {pushing && (
            <div className="py-6 flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Pushing {pushConfirmPkg?.display_name} to Metsights…</span>
            </div>
          )}

          {pushError && (
            <p className="text-sm text-red-600">{pushError}</p>
          )}

          {pushResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-emerald-700">Pushed: {pushResult.pushed}</div>
              <div className="text-zinc-500">Skipped (no answers / no Metsights record): {pushResult.skipped}</div>
              {pushResult.errors > 0 && (
                <div className="text-red-600">Errors: {pushResult.errors}</div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            {!pushResult && !pushError && (
              <button
                type="button"
                onClick={handlePushQuestionnaires}
                disabled={pushing}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {pushing ? "Pushing…" : "Push Answers"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPushConfirmPkg(null);
                setPushResult(null);
                setPushError(null);
              }}
              disabled={pushing}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {pushResult || pushError ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
