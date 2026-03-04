import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Loader2, ListChecks, X } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  assessmentPackagesApi,
  questionnaireQuestionsApi,
  type AssessmentPackage,
  type AssessmentPackageCreate,
  type PackageQuestion,
  type QuestionnaireQuestion,
  type QuestionnaireQuestionCreate,
  type QuestionnaireQuestionUpdate,
  getApiError,
} from "../../lib/api";

// ── Constants ────────────────────────────────────────────────────────────────
const PKG_STATUS_OPTIONS = ["active", "inactive", "archived"];
const Q_STATUS_OPTIONS = ["active", "inactive"];
const QUESTION_TYPES = [
  { value: "text", label: "Text (free answer)" },
  { value: "single_choice", label: "Single Choice" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "scale", label: "Scale" },
];
const CHOICE_TYPES = new Set(["single_choice", "multiple_choice"]);

// ── Shared helpers ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string | null }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium";
  if (status === "active") return <span className={`${base} bg-green-100 text-green-700`}>Active</span>;
  if (status === "inactive") return <span className={`${base} bg-zinc-100 text-zinc-600`}>Inactive</span>;
  if (status === "archived") return <span className={`${base} bg-amber-100 text-amber-700`}>Archived</span>;
  return <span className={`${base} bg-zinc-100 text-zinc-500`}>{status ?? "—"}</span>;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Empty blank question form default ────────────────────────────────────────
const BLANK_QUESTION: QuestionnaireQuestionCreate = {
  question_text: "",
  question_type: "",
  options: null,
  status: "active",
};

// ── Question Form (shared between add/edit) ───────────────────────────────────
interface QuestionFormProps {
  value: QuestionnaireQuestionCreate;
  onChange: (v: QuestionnaireQuestionCreate) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  mode: "add" | "edit";
  // edit-only: status toggle
  currentStatus?: string | null;
  onToggleStatus?: () => void;
  togglingStatus?: boolean;
}

function QuestionForm({
  value,
  onChange,
  error,
  submitting,
  onSubmit,
  onCancel,
  mode,
  currentStatus,
  onToggleStatus,
  togglingStatus,
}: QuestionFormProps) {
  const showOptions = CHOICE_TYPES.has(value.question_type);
  const options: string[] = value.options ?? [];

  const setField = (patch: Partial<QuestionnaireQuestionCreate>) =>
    onChange({ ...value, ...patch });

  const addOption = () => setField({ options: [...options, ""] });
  const removeOption = (i: number) =>
    setField({ options: options.filter((_, idx) => idx !== i) });
  const updateOption = (i: number, text: string) => {
    const next = [...options];
    next[i] = text;
    setField({ options: next });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          Question Text <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={3}
          value={value.question_text}
          onChange={(e) => setField({ question_text: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
          placeholder="Enter the question…"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          Question Type <span className="text-red-500">*</span>
        </label>
        <select
          value={value.question_type}
          onChange={(e) => setField({ question_type: e.target.value, options: CHOICE_TYPES.has(e.target.value) ? (options.length ? options : [""]) : null })}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
          required
        >
          <option value="">Select type…</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {showOptions && (
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Options <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder={`Option ${i + 1}`}
                  required
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50"
                  aria-label="Remove option"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
            >
              <Plus className="w-3.5 h-3.5" /> Add option
            </button>
          </div>
        </div>
      )}

      {mode === "add" && (
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
          <select
            value={value.status ?? "active"}
            onChange={(e) => setField({ status: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
          >
            {Q_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{cap(s)}</option>
            ))}
          </select>
        </div>
      )}

      {mode === "edit" && onToggleStatus && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 border border-zinc-200">
          <div>
            <p className="text-sm font-medium text-zinc-700">Status</p>
            <StatusBadge status={currentStatus} />
          </div>
          <button
            type="button"
            onClick={onToggleStatus}
            disabled={togglingStatus}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 transition-colors"
          >
            {togglingStatus ? "Updating…" : currentStatus === "active" ? "Deactivate" : "Activate"}
          </button>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Saving…" : mode === "add" ? "Create Question" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export function AssessmentPackages() {
  const [activeTab, setActiveTab] = useState<"packages" | "questions">("packages");

  // ── Packages list state ──────────────────────────────────────
  const [pkgData, setPkgData] = useState<AssessmentPackage[]>([]);
  const [pkgTotal, setPkgTotal] = useState(0);
  const [pkgPage, setPkgPage] = useState(1);
  const [pkgLimit] = useState(10);
  const [pkgSearch, setPkgSearch] = useState("");
  const [pkgStatusFilter, setPkgStatusFilter] = useState("");
  const [pkgSortKey, setPkgSortKey] = useState("display_name");
  const [pkgSortDir, setPkgSortDir] = useState<"asc" | "desc">("asc");
  const [pkgLoading, setPkgLoading] = useState(true);
  const [pkgError, setPkgError] = useState<string | null>(null);

  // ── Package modal state ──────────────────────────────────────
  const [pkgModalOpen, setPkgModalOpen] = useState(false);
  const [pkgModalMode, setPkgModalMode] = useState<"view" | "add" | "edit">("add");
  const [selectedPkg, setSelectedPkg] = useState<AssessmentPackage | null>(null);
  const [pkgForm, setPkgForm] = useState<AssessmentPackageCreate>({ package_code: "", display_name: "", status: "active" });
  const [pkgSubmitting, setPkgSubmitting] = useState(false);
  const [pkgFormError, setPkgFormError] = useState<string | null>(null);

  // ── Package questions modal state ────────────────────────────
  const [pkgQModalOpen, setPkgQModalOpen] = useState(false);
  const [pkgQuestions, setPkgQuestions] = useState<PackageQuestion[]>([]);
  const [pkgQLoading, setPkgQLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  // ── Add-to-package modal state ───────────────────────────────
  const [addQModalOpen, setAddQModalOpen] = useState(false);
  const [allActiveQ, setAllActiveQ] = useState<QuestionnaireQuestion[]>([]);
  const [allActiveQLoading, setAllActiveQLoading] = useState(false);
  const [selectedQIds, setSelectedQIds] = useState<Set<number>>(new Set());
  const [addQSubmitting, setAddQSubmitting] = useState(false);
  const [addQSearch, setAddQSearch] = useState("");

  // ── Quick-create question inside add-to-package modal ────────
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickForm, setQuickForm] = useState<QuestionnaireQuestionCreate>({ ...BLANK_QUESTION });
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  // ── Questions tab state ──────────────────────────────────────
  const [qData, setQData] = useState<QuestionnaireQuestion[]>([]);
  const [qTotal, setQTotal] = useState(0);
  const [qPage, setQPage] = useState(1);
  const [qLimit] = useState(10);
  const [qSearch, setQSearch] = useState("");
  const [qStatusFilter, setQStatusFilter] = useState("");
  const [qTypeFilter, setQTypeFilter] = useState("");
  const [qSortKey, setQSortKey] = useState("question_text");
  const [qSortDir, setQSortDir] = useState<"asc" | "desc">("asc");
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState<string | null>(null);

  // ── Question modal state ─────────────────────────────────────
  const [qModalOpen, setQModalOpen] = useState(false);
  const [qModalMode, setQModalMode] = useState<"view" | "add" | "edit">("add");
  const [selectedQ, setSelectedQ] = useState<QuestionnaireQuestion | null>(null);
  const [qForm, setQForm] = useState<QuestionnaireQuestionCreate>({ ...BLANK_QUESTION });
  const [qSubmitting, setQSubmitting] = useState(false);
  const [qFormError, setQFormError] = useState<string | null>(null);
  const [qTogglingStatus, setQTogglingStatus] = useState(false);

  // ── Packages: fetch ──────────────────────────────────────────
  const fetchPkgs = useCallback(async () => {
    setPkgLoading(true);
    setPkgError(null);
    try {
      const res = await assessmentPackagesApi.list({ page: pkgPage, limit: pkgLimit, status: pkgStatusFilter || undefined });
      let items = res.data.data;
      if (pkgSearch.trim()) {
        const q = pkgSearch.trim().toLowerCase();
        items = items.filter(
          (p) => (p.display_name ?? "").toLowerCase().includes(q) || (p.package_code ?? "").toLowerCase().includes(q)
        );
      }
      const sorted = [...items].sort((a, b) => {
        const aV = String(a[pkgSortKey as keyof AssessmentPackage] ?? "");
        const bV = String(b[pkgSortKey as keyof AssessmentPackage] ?? "");
        const c = aV.localeCompare(bV, undefined, { numeric: true });
        return pkgSortDir === "asc" ? c : -c;
      });
      setPkgData(sorted);
      setPkgTotal(res.data.meta.total);
    } catch (err) { setPkgError(getApiError(err)); }
    finally { setPkgLoading(false); }
  }, [pkgPage, pkgLimit, pkgStatusFilter, pkgSearch, pkgSortKey, pkgSortDir]);

  useEffect(() => { fetchPkgs(); }, [fetchPkgs]);
  useEffect(() => { setPkgPage(1); }, [pkgSearch, pkgStatusFilter]);

  // ── Packages: modal handlers ─────────────────────────────────
  const openAddPkg = () => {
    setSelectedPkg(null);
    setPkgForm({ package_code: "", display_name: "", status: "active" });
    setPkgFormError(null);
    setPkgModalMode("add");
    setPkgModalOpen(true);
  };
  const openViewPkg = (row: AssessmentPackage) => {
    assessmentPackagesApi.get(row.package_id)
      .then((r) => { setSelectedPkg(r.data.data); setPkgModalMode("view"); setPkgModalOpen(true); })
      .catch((err) => setPkgError(getApiError(err)));
  };
  const openEditPkg = (row: AssessmentPackage) => {
    assessmentPackagesApi.get(row.package_id).then((r) => {
      const p = r.data.data;
      setSelectedPkg(p);
      setPkgForm({ package_code: p.package_code ?? "", display_name: p.display_name ?? "", status: p.status ?? "active" });
      setPkgFormError(null);
      setPkgModalMode("edit");
      setPkgModalOpen(true);
    }).catch((err) => setPkgError(getApiError(err)));
  };
  const handlePkgSubmit = async () => {
    if (!pkgForm.package_code.trim() || !pkgForm.display_name.trim()) { setPkgFormError("Code and Name are required."); return; }
    setPkgSubmitting(true); setPkgFormError(null);
    try {
      if (pkgModalMode === "add") await assessmentPackagesApi.create(pkgForm);
      else if (selectedPkg) await assessmentPackagesApi.update(selectedPkg.package_id, { package_code: pkgForm.package_code, display_name: pkgForm.display_name });
      setPkgModalOpen(false); fetchPkgs();
    } catch (err) { setPkgFormError(getApiError(err)); }
    finally { setPkgSubmitting(false); }
  };

  // ── Package questions handlers ───────────────────────────────
  const fetchPkgQuestions = useCallback(async (pkgId: number) => {
    setPkgQLoading(true);
    try {
      const r = await assessmentPackagesApi.listQuestions(pkgId);
      setPkgQuestions(r.data.data);
    } catch (err) { setPkgError(getApiError(err)); }
    finally { setPkgQLoading(false); }
  }, []);

  const openPkgQModal = (pkg: AssessmentPackage) => {
    setSelectedPkg(pkg); setPkgQModalOpen(true); fetchPkgQuestions(pkg.package_id);
  };

  const handleRemoveQ = async (questionId: number) => {
    if (!selectedPkg) return;
    setRemovingId(questionId);
    try {
      await assessmentPackagesApi.removeQuestion(selectedPkg.package_id, questionId);
      await fetchPkgQuestions(selectedPkg.package_id);
    } catch (err) { setPkgError(getApiError(err)); }
    finally { setRemovingId(null); }
  };

  // ── Add-to-package handlers ──────────────────────────────────
  const openAddQModal = () => {
    setAddQModalOpen(true);
    setAllActiveQLoading(true);
    setSelectedQIds(new Set());
    setAddQSearch("");
    setQuickCreateOpen(false);
    questionnaireQuestionsApi.list({ status: "active" })
      .then((r) => setAllActiveQ(r.data.data))
      .catch((err) => setPkgError(getApiError(err)))
      .finally(() => setAllActiveQLoading(false));
  };

  const refreshAllActiveQ = async () => {
    setAllActiveQLoading(true);
    try {
      const r = await questionnaireQuestionsApi.list({ status: "active" });
      setAllActiveQ(r.data.data);
    } finally { setAllActiveQLoading(false); }
  };

  const toggleQId = (id: number) => setSelectedQIds((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const handleAddQToPackage = async () => {
    if (!selectedPkg || selectedQIds.size === 0) return;
    setAddQSubmitting(true);
    try {
      await assessmentPackagesApi.addQuestions(selectedPkg.package_id, Array.from(selectedQIds));
      setAddQModalOpen(false);
      fetchPkgQuestions(selectedPkg.package_id);
    } catch (err) { setPkgError(getApiError(err)); }
    finally { setAddQSubmitting(false); }
  };

  // ── Quick-create question ────────────────────────────────────
  const handleQuickCreate = async () => {
    if (!quickForm.question_text.trim() || !quickForm.question_type) { setQuickError("Question text and type are required."); return; }
    setQuickSubmitting(true); setQuickError(null);
    try {
      const r = await questionnaireQuestionsApi.create(quickForm);
      const newId = r.data.data.question_id;
      await refreshAllActiveQ();
      setSelectedQIds((prev) => { const next = new Set(prev); next.add(newId); return next; });
      setQuickCreateOpen(false);
      setQuickForm({ ...BLANK_QUESTION });
    } catch (err) { setQuickError(getApiError(err)); }
    finally { setQuickSubmitting(false); }
  };

  // ── Questions tab: fetch ─────────────────────────────────────
  const fetchQuestions = useCallback(async () => {
    setQLoading(true); setQError(null);
    try {
      const res = await questionnaireQuestionsApi.list({
        page: qPage, limit: qLimit,
        status: qStatusFilter || undefined,
        question_type: qTypeFilter || undefined,
      });
      let items = res.data.data;
      if (qSearch.trim()) {
        const q = qSearch.trim().toLowerCase();
        items = items.filter((i) => (i.question_text ?? "").toLowerCase().includes(q));
      }
      const sorted = [...items].sort((a, b) => {
        const aV = String(a[qSortKey as keyof QuestionnaireQuestion] ?? "");
        const bV = String(b[qSortKey as keyof QuestionnaireQuestion] ?? "");
        const c = aV.localeCompare(bV, undefined, { numeric: true });
        return qSortDir === "asc" ? c : -c;
      });
      setQData(sorted);
      setQTotal(res.data.meta.total);
    } catch (err) { setQError(getApiError(err)); }
    finally { setQLoading(false); }
  }, [qPage, qLimit, qStatusFilter, qTypeFilter, qSearch, qSortKey, qSortDir]);

  useEffect(() => { if (activeTab === "questions") fetchQuestions(); }, [fetchQuestions, activeTab]);
  useEffect(() => { setQPage(1); }, [qSearch, qStatusFilter, qTypeFilter]);

  // ── Questions tab: modal handlers ───────────────────────────
  const openAddQ = () => {
    setSelectedQ(null); setQForm({ ...BLANK_QUESTION }); setQFormError(null); setQModalMode("add"); setQModalOpen(true);
  };
  const openViewQ = (row: QuestionnaireQuestion) => {
    questionnaireQuestionsApi.get(row.question_id)
      .then((r) => { setSelectedQ(r.data.data); setQModalMode("view"); setQModalOpen(true); })
      .catch((err) => setQError(getApiError(err)));
  };
  const openEditQ = (row: QuestionnaireQuestion) => {
    questionnaireQuestionsApi.get(row.question_id).then((r) => {
      const q = r.data.data;
      setSelectedQ(q);
      setQForm({ question_text: q.question_text ?? "", question_type: q.question_type ?? "", options: q.options ?? null });
      setQFormError(null); setQModalMode("edit"); setQModalOpen(true);
    }).catch((err) => setQError(getApiError(err)));
  };
  const handleQSubmit = async () => {
    if (!qForm.question_text.trim() || !qForm.question_type) { setQFormError("Question text and type are required."); return; }
    setQSubmitting(true); setQFormError(null);
    try {
      const payload: QuestionnaireQuestionUpdate = {
        question_text: qForm.question_text,
        question_type: qForm.question_type,
        options: CHOICE_TYPES.has(qForm.question_type) ? (qForm.options ?? null) : null,
      };
      if (qModalMode === "add") {
        await questionnaireQuestionsApi.create({ ...payload, status: qForm.status ?? "active" });
      } else if (selectedQ) {
        await questionnaireQuestionsApi.update(selectedQ.question_id, payload);
      }
      setQModalOpen(false); fetchQuestions();
    } catch (err) { setQFormError(getApiError(err)); }
    finally { setQSubmitting(false); }
  };
  const handleToggleQStatus = async () => {
    if (!selectedQ) return;
    const next = selectedQ.status === "active" ? "inactive" : "active";
    setQTogglingStatus(true);
    try {
      await questionnaireQuestionsApi.updateStatus(selectedQ.question_id, next);
      setSelectedQ({ ...selectedQ, status: next });
      fetchQuestions();
    } catch (err) { setQFormError(getApiError(err)); }
    finally { setQTogglingStatus(false); }
  };

  // ── Derived values ───────────────────────────────────────────
  const existingPkgQIds = new Set(pkgQuestions.map((q) => q.question_id));
  const availableToAdd = allActiveQ.filter((q) => !existingPkgQIds.has(q.question_id));
  const filteredAvailable = addQSearch.trim()
    ? availableToAdd.filter((q) => (q.question_text ?? "").toLowerCase().includes(addQSearch.trim().toLowerCase()))
    : availableToAdd;

  // ── Table columns ────────────────────────────────────────────
  const pkgColumns: Column<AssessmentPackage>[] = [
    { key: "display_name", label: "Name", sortable: true, render: (r) => <span className="font-medium text-zinc-900">{r.display_name || r.package_code || "—"}</span> },
    { key: "package_code", label: "Code", sortable: true, hideOnMobile: true, render: (r) => <span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">{r.package_code ?? "—"}</span> },
    {
      key: "status", label: "Status", sortable: true,
      render: (r) => {
        const isActive = r.status === "active";
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const next = isActive ? "inactive" : "active";
              assessmentPackagesApi.updateStatus(r.package_id, next)
                .then(() => fetchPkgs())
                .catch((err) => setPkgError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition-colors ${isActive ? "bg-emerald-500" : "bg-zinc-300"}`}
            aria-pressed={isActive}
            aria-label={`Set ${r.display_name ?? "package"} ${isActive ? "inactive" : "active"}`}
          >
            <span className={`h-5 w-5 bg-white rounded-full shadow transform transition-transform ${isActive ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        );
      },
    },
  ];

  const qColumns: Column<QuestionnaireQuestion>[] = [
    { key: "question_text", label: "Question", sortable: true, render: (r) => <span className="font-medium text-zinc-900 line-clamp-2">{r.question_text || "—"}</span> },
    { key: "question_type", label: "Type", sortable: true, hideOnMobile: true, render: (r) => <span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">{r.question_type ?? "—"}</span> },
    {
      key: "status", label: "Status", sortable: true,
      render: (r) => {
        const isActive = r.status === "active";
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const next = isActive ? "inactive" : "active";
              questionnaireQuestionsApi.updateStatus(r.question_id, next)
                .then(() => fetchQuestions())
                .catch((err) => setQError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition-colors ${isActive ? "bg-emerald-500" : "bg-zinc-300"}`}
            aria-pressed={isActive}
            aria-label={`Set question ${isActive ? "inactive" : "active"}`}
          >
            <span className={`h-5 w-5 bg-white rounded-full shadow transform transition-transform ${isActive ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        );
      },
    },
  ];

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      {/* Page header — always one row: title left, icon-only button right */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Assessments</h1>
        {activeTab === "packages" ? (
          <button onClick={openAddPkg} className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shrink-0">
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Package</span>
          </button>
        ) : (
          <button onClick={openAddQ} className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shrink-0">
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Question</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-zinc-200">
        {(["packages", "questions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab === "packages" ? "Packages" : "Questions"}
          </button>
        ))}
      </div>

      {/* ── PACKAGES TAB ── */}
      {activeTab === "packages" && (
        <div>
          {pkgError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start justify-between gap-2">
              <span>{pkgError}</span>
              <button onClick={() => setPkgError(null)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
            </div>
          )}
          {/* Search row */}
          <div className="mb-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input type="search" placeholder="Search by name or code…" value={pkgSearch} onChange={(e) => setPkgSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" />
          </div>
          {/* Filter row — always horizontal */}
          <div className="mb-4 flex flex-row gap-2">
            <select value={pkgStatusFilter} onChange={(e) => setPkgStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white">
              <option value="">All statuses</option>
              {PKG_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            {pkgLoading ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-zinc-400" /></div>
            ) : (
              <DataTable
                columns={pkgColumns} data={pkgData} keyExtractor={(r) => r.package_id}
                sortKey={pkgSortKey} sortDir={pkgSortDir}
                onSort={(k) => { setPkgSortDir((d) => pkgSortKey === k ? (d === "asc" ? "desc" : "asc") : "asc"); setPkgSortKey(k); }}
                onView={openViewPkg} onEdit={openEditPkg} onQuestions={openPkgQModal}
                firstColumnClickableView
                pagination={{ page: pkgPage, limit: pkgLimit, total: pkgTotal, onPageChange: setPkgPage }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── QUESTIONS TAB ── */}
      {activeTab === "questions" && (
        <div>
          {qError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start justify-between gap-2">
              <span>{qError}</span>
              <button onClick={() => setQError(null)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
            </div>
          )}
          {/* Search row */}
          <div className="mb-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input type="search" placeholder="Search questions…" value={qSearch} onChange={(e) => setQSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" />
          </div>
          {/* Filter row — always horizontal, wraps gracefully on very small screens */}
          <div className="mb-4 flex flex-row flex-wrap gap-2">
            <select value={qStatusFilter} onChange={(e) => setQStatusFilter(e.target.value)}
              className="flex-1 min-w-[120px] sm:flex-none sm:w-36 px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white">
              <option value="">All statuses</option>
              {Q_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
            </select>
            <select value={qTypeFilter} onChange={(e) => setQTypeFilter(e.target.value)}
              className="flex-1 min-w-[140px] sm:flex-none sm:w-44 px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white">
              <option value="">All types</option>
              {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            {qLoading ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-zinc-400" /></div>
            ) : (
              <DataTable
                columns={qColumns} data={qData} keyExtractor={(r) => r.question_id}
                sortKey={qSortKey} sortDir={qSortDir}
                onSort={(k) => { setQSortDir((d) => qSortKey === k ? (d === "asc" ? "desc" : "asc") : "asc"); setQSortKey(k); }}
                onView={openViewQ} onEdit={openEditQ}
                firstColumnClickableView
                pagination={{ page: qPage, limit: qLimit, total: qTotal, onPageChange: setQPage }}
              />
            )}
          </div>
        </div>
      )}

      {/* ══ PACKAGE MODALS ══ */}

      {/* Create / Edit / View Package */}
      <Modal open={pkgModalOpen} onClose={() => setPkgModalOpen(false)}
        title={pkgModalMode === "add" ? "Add Package" : pkgModalMode === "edit" ? "Edit Package" : "Package Details"}
        maxWidthClassName="max-w-lg">
        {pkgModalMode === "view" && selectedPkg ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><dt className="text-zinc-500 mb-0.5">Name</dt><dd className="font-medium text-zinc-900">{selectedPkg.display_name ?? "—"}</dd></div>
              <div><dt className="text-zinc-500 mb-0.5">Code</dt><dd><span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">{selectedPkg.package_code ?? "—"}</span></dd></div>
              <div><dt className="text-zinc-500 mb-0.5">Status</dt><dd><StatusBadge status={selectedPkg.status} /></dd></div>
            </dl>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button onClick={() => { setPkgModalOpen(false); openPkgQModal(selectedPkg); }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors">
                <ListChecks className="w-4 h-4" /> Manage Questions
              </button>
              <button onClick={() => openEditPkg(selectedPkg)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors">
                Edit Package
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handlePkgSubmit(); }} className="space-y-4">
            {pkgFormError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{pkgFormError}</div>}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Code <span className="text-red-500">*</span></label>
              <input type="text" value={pkgForm.package_code} onChange={(e) => setPkgForm({ ...pkgForm, package_code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
                placeholder="e.g. PKG_01" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Name <span className="text-red-500">*</span></label>
              <input type="text" value={pkgForm.display_name} onChange={(e) => setPkgForm({ ...pkgForm, display_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="e.g. Leadership Assessment" required />
            </div>
            {pkgModalMode === "add" && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
                <select value={pkgForm.status} onChange={(e) => setPkgForm({ ...pkgForm, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white">
                  {PKG_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button type="submit" disabled={pkgSubmitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors">
                {pkgSubmitting ? "Saving…" : pkgModalMode === "add" ? "Create Package" : "Save Changes"}
              </button>
              <button type="button" onClick={() => setPkgModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Package Questions */}
      <Modal open={pkgQModalOpen} onClose={() => setPkgQModalOpen(false)}
        title={selectedPkg ? `Questions — ${selectedPkg.display_name ?? selectedPkg.package_code}` : "Package Questions"}
        maxWidthClassName="max-w-2xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">{pkgQLoading ? "Loading…" : `${pkgQuestions.length} question${pkgQuestions.length !== 1 ? "s" : ""}`}</p>
            <button onClick={openAddQModal}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Questions
            </button>
          </div>
          {pkgQLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
          ) : pkgQuestions.length === 0 ? (
            <div className="py-10 text-center text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-lg">
              No questions in this package yet.<br />
              <button onClick={openAddQModal} className="mt-2 text-zinc-600 underline hover:text-zinc-900">Add questions</button>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
              {pkgQuestions.map((q) => (
                <li key={q.question_id} className="flex items-start sm:items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-900 leading-snug">{q.question_text ?? "—"}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      ID: {q.question_id}{q.question_type && <> · <span className="font-mono">{q.question_type}</span></>}
                      {q.status && <> · <StatusBadge status={q.status} /></>}
                    </p>
                  </div>
                  <button onClick={() => handleRemoveQ(q.question_id)} disabled={removingId === q.question_id}
                    className="shrink-0 text-xs text-red-500 hover:text-red-700 disabled:opacity-40 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                    {removingId === q.question_id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* Add Questions to Package */}
      <Modal open={addQModalOpen} onClose={() => { setAddQModalOpen(false); setQuickCreateOpen(false); }}
        title="Add Questions to Package" maxWidthClassName="max-w-2xl">
        <div className="space-y-4">
          {/* Quick-create toggle */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">Select from active questions or create a new one.</p>
            <button onClick={() => { setQuickCreateOpen((o) => !o); setQuickForm({ ...BLANK_QUESTION }); setQuickError(null); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shrink-0">
              <Plus className="w-3.5 h-3.5" /> New Question
            </button>
          </div>

          {/* Inline quick-create form */}
          {quickCreateOpen && (
            <div className="border border-zinc-200 rounded-lg p-4 bg-zinc-50 space-y-3">
              <p className="text-sm font-medium text-zinc-800">Create &amp; auto-select a new question</p>
              <QuestionForm
                value={quickForm} onChange={setQuickForm}
                error={quickError} submitting={quickSubmitting}
                onSubmit={handleQuickCreate} onCancel={() => { setQuickCreateOpen(false); setQuickError(null); }}
                mode="add"
              />
            </div>
          )}

          {!quickCreateOpen && (
            <>
              {allActiveQLoading ? (
                <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    <input type="search" placeholder="Search questions…" value={addQSearch} onChange={(e) => setAddQSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900" />
                  </div>
                  {filteredAvailable.length === 0 ? (
                    <div className="py-8 text-center text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-lg">
                      {availableToAdd.length === 0 ? "All active questions are already in this package." : "No questions match your search."}
                    </div>
                  ) : (
                    <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                      {filteredAvailable.map((q) => {
                        const checked = selectedQIds.has(q.question_id);
                        return (
                          <li key={q.question_id} onClick={() => toggleQId(q.question_id)}
                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? "bg-zinc-50" : "hover:bg-zinc-50"}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleQId(q.question_id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 h-4 w-4 rounded border-zinc-300 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-900 leading-snug">{q.question_text ?? "—"}</p>
                              <p className="text-xs text-zinc-400 mt-0.5">
                                ID: {q.question_id}{q.question_type && <> · <span className="font-mono">{q.question_type}</span></>}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-1">
                    <span className="text-sm text-zinc-500">{selectedQIds.size > 0 ? `${selectedQIds.size} selected` : "Select questions to add"}</span>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button onClick={handleAddQToPackage} disabled={selectedQIds.size === 0 || addQSubmitting}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors">
                        {addQSubmitting ? "Adding…" : `Add${selectedQIds.size > 0 ? ` ${selectedQIds.size}` : ""} Question${selectedQIds.size !== 1 ? "s" : ""}`}
                      </button>
                      <button onClick={() => setAddQModalOpen(false)}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* ══ QUESTION MODALS ══ */}

      {/* View / Add / Edit Question */}
      <Modal open={qModalOpen} onClose={() => setQModalOpen(false)}
        title={qModalMode === "add" ? "Add Question" : qModalMode === "edit" ? "Edit Question" : "Question Details"}
        maxWidthClassName="max-w-lg">
        {qModalMode === "view" && selectedQ ? (
          <div className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500 mb-1">Question Text</dt>
                <dd className="text-zinc-900 font-medium leading-relaxed">{selectedQ.question_text ?? "—"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-zinc-500 mb-1">Type</dt>
                  <dd><span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">{selectedQ.question_type ?? "—"}</span></dd>
                </div>
                <div>
                  <dt className="text-zinc-500 mb-1">Status</dt>
                  <dd><StatusBadge status={selectedQ.status} /></dd>
                </div>
              </div>
              {selectedQ.options && selectedQ.options.length > 0 && (
                <div>
                  <dt className="text-zinc-500 mb-1">Options</dt>
                  <dd>
                    <ul className="space-y-1">
                      {selectedQ.options.map((o, i) => (
                        <li key={i} className="flex items-center gap-2 text-zinc-700">
                          <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-xs flex items-center justify-center shrink-0">{i + 1}</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button onClick={() => openEditQ(selectedQ)}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors">
                Edit Question
              </button>
              <button
                onClick={async () => {
                  const next = selectedQ.status === "active" ? "inactive" : "active";
                  setQTogglingStatus(true);
                  try {
                    await questionnaireQuestionsApi.updateStatus(selectedQ.question_id, next);
                    setSelectedQ({ ...selectedQ, status: next });
                    fetchQuestions();
                  } catch (err) { setQError(getApiError(err)); }
                  finally { setQTogglingStatus(false); }
                }}
                disabled={qTogglingStatus}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 transition-colors">
                {qTogglingStatus ? "Updating…" : selectedQ.status === "active" ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ) : (
          <QuestionForm
            value={qForm} onChange={setQForm}
            error={qFormError} submitting={qSubmitting}
            onSubmit={handleQSubmit} onCancel={() => setQModalOpen(false)}
            mode={qModalMode as "add" | "edit"}
            currentStatus={selectedQ?.status}
            onToggleStatus={handleToggleQStatus}
            togglingStatus={qTogglingStatus}
          />
        )}
      </Modal>
    </div>
  );
}
