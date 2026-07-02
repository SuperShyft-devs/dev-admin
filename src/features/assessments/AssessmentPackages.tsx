import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AlertTriangle, ChevronDown, Droplets, GripVertical, Loader2, ListChecks, Pencil, Plus, RefreshCw, ScrollText, Search } from "lucide-react";
import { IntegrationSyncLogsModal } from "./IntegrationSyncLogsModal";
import { MetsightsSyncConfigModal } from "./questions/MetsightsSyncConfigModal";
import { QuestionDetailDrawer, type QuestionDrawerTab } from "./questions/QuestionDetailDrawer";
import { QuestionForm } from "./questions/QuestionForm";
import {
  BLANK_QUESTION,
  OPTION_SUPPORTED_TYPES,
  Q_STATUS_OPTIONS,
  StatusBadge,
  cap,
} from "./questions/questionUi";
import { useNavigate, useParams } from "react-router-dom";
import { SortableItem } from "../../components/SortableItem";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import {
  assessmentPackagesApi,
  questionnaireCategoriesApi,
  questionnaireQuestionsApi,
  type AssessmentPackage,
  type AssessmentPackageCategory,
  type AssessmentPackageCreate,
  type QuestionnaireCategory,
  type QuestionnaireCategoryCreate,
  type QuestionnaireQuestion,
  type QuestionnaireQuestionCreate,
  type QuestionnaireQuestionUpdate,
  type MetsightsSyncGapsResponse,
  type MetsightsSyncResetResponse,
  type BloodParametersReloadResponse,
  getApiError,
} from "../../lib/api";
import { fetchAllPages } from "../../lib/fetchAllPages";

const PKG_STATUS_OPTIONS = ["active", "inactive", "archived"] as const;
const CAT_STATUS_OPTIONS = ["active", "inactive"] as const;
const QUESTION_TYPES = [
  { value: "text", label: "Text (free answer)" },
  { value: "single_choice", label: "Single Choice" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "scale", label: "Scale" },
] as const;

const CATEGORY_OF_OPTIONS = ["supershyft", "metsights"] as const;

type TabKey = "packages" | "categories" | "questions";
const TAB_KEYS: TabKey[] = ["packages", "categories", "questions"];

const BLANK_CATEGORY: QuestionnaireCategoryCreate = {
  category_key: "",
  display_name: "",
  category_of: "supershyft",
};

export function AssessmentPackages() {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const activeTab: TabKey = TAB_KEYS.includes((tabParam ?? "") as TabKey)
    ? (tabParam as TabKey)
    : "packages";

  useEffect(() => {
    if (tabParam !== activeTab) {
      navigate(`/assessments/${activeTab}`, { replace: true });
    }
  }, [activeTab, navigate, tabParam]);

  // Packages tab
  const [pkgData, setPkgData] = useState<AssessmentPackage[]>([]);
  const [pkgTotal, setPkgTotal] = useState(0);
  const [pkgPage, setPkgPage] = useState(1);
  const [pkgLimit] = useState(10);
  const [pkgSearch, setPkgSearch] = useState("");
  const [pkgStatusFilter, setPkgStatusFilter] = useState("");
  const [pkgSortKey, setPkgSortKey] = useState("package_id");
  const [pkgSortDir, setPkgSortDir] = useState<"asc" | "desc">("desc");
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [pkgCategoryCounts, setPkgCategoryCounts] = useState<Record<number, number>>({});

  // Package form modal
  const [pkgModalOpen, setPkgModalOpen] = useState(false);
  const [pkgModalMode, setPkgModalMode] = useState<"view" | "add" | "edit">("add");
  const [selectedPkg, setSelectedPkg] = useState<AssessmentPackage | null>(null);
  const [pkgForm, setPkgForm] = useState<AssessmentPackageCreate>({
    package_code: "",
    display_name: "",
    assessment_type_code: "",
    status: "active",
  });
  const [pkgSubmitting, setPkgSubmitting] = useState(false);
  const [pkgFormError, setPkgFormError] = useState<string | null>(null);

  // Package categories modal
  const [pkgCatsModalOpen, setPkgCatsModalOpen] = useState(false);
  const [pkgCategories, setPkgCategories] = useState<AssessmentPackageCategory[]>([]);
  const [pkgCatsLoading, setPkgCatsLoading] = useState(false);
  const [pkgReorderingCategories, setPkgReorderingCategories] = useState(false);
  const [pkgRemovingCategoryId, setPkgRemovingCategoryId] = useState<number | null>(null);
  const [pkgAddCatsModalOpen, setPkgAddCatsModalOpen] = useState(false);
  const [pkgAddCatsSubmitting, setPkgAddCatsSubmitting] = useState(false);
  const [pkgAddCatsSearch, setPkgAddCatsSearch] = useState("");
  const [allCategoriesForPackage, setAllCategoriesForPackage] = useState<QuestionnaireCategory[]>([]);
  const [allCategoriesForPackageLoading, setAllCategoriesForPackageLoading] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());

  // Categories tab
  const [catData, setCatData] = useState<QuestionnaireCategory[]>([]);
  const [catTotal, setCatTotal] = useState(0);
  const [catPage, setCatPage] = useState(1);
  const [catLimit] = useState(12);
  const [catSearch, setCatSearch] = useState("");
  const [catStatusFilter, setCatStatusFilter] = useState("");
  const [catCategoryOfFilter, setCatCategoryOfFilter] = useState("");
  const [catSortKey, setCatSortKey] = useState<"display_name" | "category_key" | "category_id">("category_id");
  const [catSortDir, setCatSortDir] = useState<"asc" | "desc">("desc");
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Category create/edit/view
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalMode, setCatModalMode] = useState<"view" | "add" | "edit">("add");
  const [selectedCat, setSelectedCat] = useState<QuestionnaireCategory | null>(null);
  const [catForm, setCatForm] = useState<QuestionnaireCategoryCreate>({ ...BLANK_CATEGORY });
  const [catSubmitting, setCatSubmitting] = useState(false);
  const [catFormError, setCatFormError] = useState<string | null>(null);

  // Category details modal (click card)
  const [catDetailsOpen, setCatDetailsOpen] = useState(false);
  const [catDetailsCategory, setCatDetailsCategory] = useState<QuestionnaireCategory | null>(null);
  const [catDetailsQuestions, setCatDetailsQuestions] = useState<QuestionnaireQuestion[]>([]);
  const [catDetailsLoading, setCatDetailsLoading] = useState(false);

  // Category manage questions
  const [catManageQOpen, setCatManageQOpen] = useState(false);
  const [catManageQuestions, setCatManageQuestions] = useState<QuestionnaireQuestion[]>([]);
  const [catManageQLoading, setCatManageQLoading] = useState(false);
  const [catReorderingQuestions, setCatReorderingQuestions] = useState(false);
  const [catRemovingQuestionId, setCatRemovingQuestionId] = useState<number | null>(null);
  const [catAddQOpen, setCatAddQOpen] = useState(false);
  const [catAddQSearch, setCatAddQSearch] = useState("");
  const [catAddQSubmitting, setCatAddQSubmitting] = useState(false);
  const [allActiveQuestions, setAllActiveQuestions] = useState<QuestionnaireQuestion[]>([]);
  const [allActiveQuestionsLoading, setAllActiveQuestionsLoading] = useState(false);
  const [selectedQuestionIdsForCategory, setSelectedQuestionIdsForCategory] = useState<Set<number>>(new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Questions tab
  const [qData, setQData] = useState<QuestionnaireQuestion[]>([]);
  const [qTotal, setQTotal] = useState(0);
  const [qPage, setQPage] = useState(1);
  const [qLimit] = useState(10);
  const [qSearch, setQSearch] = useState("");
  const [qStatusFilter, setQStatusFilter] = useState("");
  const [qTypeFilter, setQTypeFilter] = useState("");
  const [qSortKey, setQSortKey] = useState("question_id");
  const [qSortDir, setQSortDir] = useState<"asc" | "desc">("desc");
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState<string | null>(null);

  // Question add/edit modal + view drawer
  const [qModalOpen, setQModalOpen] = useState(false);
  const [qModalMode, setQModalMode] = useState<"add" | "edit">("add");
  const [qDrawerOpen, setQDrawerOpen] = useState(false);
  const [qDrawerQuestionId, setQDrawerQuestionId] = useState<number | null>(null);
  const [qDrawerTab, setQDrawerTab] = useState<QuestionDrawerTab>("overview");
  const [selectedQ, setSelectedQ] = useState<QuestionnaireQuestion | null>(null);
  const [qForm, setQForm] = useState<QuestionnaireQuestionCreate>({ ...BLANK_QUESTION });
  const [qSubmitting, setQSubmitting] = useState(false);
  const [qFormError, setQFormError] = useState<string | null>(null);
  const [qTogglingStatus, setQTogglingStatus] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  // Unsync'd questions warning state
  const [unsyncWarning, setUnsyncWarning] = useState<MetsightsSyncGapsResponse>({
    count: 0,
    summary: { not_configured: 0, pull_disabled: 0, push_disabled: 0 },
    questions: [],
  });
  const [unsyncWarningExpanded, setUnsyncWarningExpanded] = useState(false);
  const [unsyncWarningLoading, setUnsyncWarningLoading] = useState(false);
  const [syncLogsOpen, setSyncLogsOpen] = useState(false);
  const [resetSyncOpen, setResetSyncOpen] = useState(false);
  const [resetSyncLoading, setResetSyncLoading] = useState(false);
  const [resetSyncError, setResetSyncError] = useState<string | null>(null);
  const [resetSyncResult, setResetSyncResult] = useState<MetsightsSyncResetResponse | null>(null);
  const [reloadBloodOpen, setReloadBloodOpen] = useState(false);
  const [reloadBloodLoading, setReloadBloodLoading] = useState(false);
  const [reloadBloodError, setReloadBloodError] = useState<string | null>(null);
  const [reloadBloodResult, setReloadBloodResult] = useState<BloodParametersReloadResponse | null>(null);
  const unsyncDropdownRef = useRef<HTMLDivElement>(null);

  const closeQuestionModal = useCallback(() => {
    setQModalOpen(false);
  }, []);

  const closeQuestionDrawer = useCallback(() => {
    setQDrawerOpen(false);
    setQDrawerQuestionId(null);
    setQDrawerTab("overview");
  }, []);

  const fetchPackages = useCallback(async () => {
    setPkgLoading(true);
    setPkgError(null);
    try {
      let rows = await fetchAllPages<AssessmentPackage>((page, limit) =>
        assessmentPackagesApi.list({
          page,
          limit,
          status: pkgStatusFilter || undefined,
        })
      );
      if (pkgSearch.trim()) {
        const search = pkgSearch.trim().toLowerCase();
        rows = rows.filter((row) =>
          (row.display_name ?? "").toLowerCase().includes(search) ||
          (row.package_code ?? "").toLowerCase().includes(search)
        );
      }

      const sorted = [...rows].sort((a, b) => {
        const aValue = String(a[pkgSortKey as keyof AssessmentPackage] ?? "");
        const bValue = String(b[pkgSortKey as keyof AssessmentPackage] ?? "");
        const cmp = aValue.localeCompare(bValue, undefined, { numeric: true });
        return pkgSortDir === "asc" ? cmp : -cmp;
      });
      setPkgTotal(sorted.length);
      const pagedRows = sorted.slice((pkgPage - 1) * pkgLimit, pkgPage * pkgLimit);
      setPkgData(pagedRows);

      const counts = await Promise.all(
        pagedRows.map(async (pkg) => {
          try {
            const mapped = await assessmentPackagesApi.listCategories(pkg.package_id);
            return [pkg.package_id, mapped.data.data.length] as const;
          } catch {
            return [pkg.package_id, 0] as const;
          }
        })
      );
      setPkgCategoryCounts(Object.fromEntries(counts));
    } catch (error) {
      setPkgError(getApiError(error));
    } finally {
      setPkgLoading(false);
    }
  }, [pkgLimit, pkgPage, pkgSearch, pkgSortDir, pkgSortKey, pkgStatusFilter]);

  useEffect(() => {
    if (activeTab === "packages") {
      fetchPackages();
    }
  }, [activeTab, fetchPackages]);

  useEffect(() => {
    setPkgPage(1);
  }, [pkgSearch, pkgStatusFilter]);

  const fetchCategories = useCallback(async () => {
    setCatLoading(true);
    setCatError(null);
    try {
      let rows = await fetchAllPages<QuestionnaireCategory>((page, limit) =>
        questionnaireCategoriesApi.list({
          page,
          limit,
          category_of: catCategoryOfFilter || undefined,
        })
      );
      if (catSearch.trim()) {
        const search = catSearch.trim().toLowerCase();
        rows = rows.filter((row) =>
          row.display_name.toLowerCase().includes(search) ||
          row.category_key.toLowerCase().includes(search)
        );
      }
      if (catStatusFilter) {
        rows = rows.filter((row) => (row.status ?? "").toLowerCase() === catStatusFilter);
      }
      const sorted = [...rows].sort((a, b) => {
        const aValue = String(a[catSortKey] ?? "");
        const bValue = String(b[catSortKey] ?? "");
        const cmp = aValue.localeCompare(bValue, undefined, { numeric: true });
        return catSortDir === "asc" ? cmp : -cmp;
      });
      setCatTotal(sorted.length);
      setCatData(sorted.slice((catPage - 1) * catLimit, catPage * catLimit));
    } catch (error) {
      setCatError(getApiError(error));
    } finally {
      setCatLoading(false);
    }
  }, [catCategoryOfFilter, catLimit, catPage, catSearch, catSortDir, catSortKey, catStatusFilter]);

  useEffect(() => {
    if (activeTab === "categories") {
      fetchCategories();
    }
  }, [activeTab, fetchCategories]);

  useEffect(() => {
    setCatPage(1);
  }, [catSearch, catStatusFilter, catCategoryOfFilter]);

  const fetchQuestions = useCallback(async () => {
    setQLoading(true);
    setQError(null);
    try {
      let rows = await fetchAllPages<QuestionnaireQuestion>((page, limit) =>
        questionnaireQuestionsApi.list({
          page,
          limit,
          status: qStatusFilter || undefined,
          type: qTypeFilter || undefined,
        })
      );
      if (qSearch.trim()) {
        const search = qSearch.trim().toLowerCase();
        rows = rows.filter((row) => (row.question_text ?? "").toLowerCase().includes(search));
      }
      const sorted = [...rows].sort((a, b) => {
        const aValue = String(a[qSortKey as keyof QuestionnaireQuestion] ?? "");
        const bValue = String(b[qSortKey as keyof QuestionnaireQuestion] ?? "");
        const cmp = aValue.localeCompare(bValue, undefined, { numeric: true });
        return qSortDir === "asc" ? cmp : -cmp;
      });
      setQTotal(sorted.length);
      setQData(sorted.slice((qPage - 1) * qLimit, qPage * qLimit));
    } catch (error) {
      setQError(getApiError(error));
    } finally {
      setQLoading(false);
    }
  }, [qLimit, qPage, qSearch, qSortDir, qSortKey, qStatusFilter, qTypeFilter]);

  useEffect(() => {
    if (activeTab === "questions") {
      fetchQuestions();
    }
  }, [activeTab, fetchQuestions]);

  useEffect(() => {
    setQPage(1);
  }, [qSearch, qStatusFilter, qTypeFilter]);

  const openAddPackage = () => {
    setPkgModalMode("add");
    setSelectedPkg(null);
    setPkgForm({ package_code: "", display_name: "", assessment_type_code: "", status: "active" });
    setPkgFormError(null);
    setPkgModalOpen(true);
  };

  const openViewPackage = (row: AssessmentPackage) => {
    assessmentPackagesApi.get(row.package_id)
      .then((res) => {
        setSelectedPkg(res.data.data);
        setPkgModalMode("view");
        setPkgModalOpen(true);
      })
      .catch((error) => setPkgError(getApiError(error)));
  };

  const openEditPackage = (row: AssessmentPackage) => {
    assessmentPackagesApi.get(row.package_id)
      .then((res) => {
        const item = res.data.data;
        setSelectedPkg(item);
        setPkgForm({
          package_code: item.package_code ?? "",
          display_name: item.display_name ?? "",
          assessment_type_code: item.assessment_type_code ?? "",
          status: item.status ?? "active",
        });
        setPkgFormError(null);
        setPkgModalMode("edit");
        setPkgModalOpen(true);
      })
      .catch((error) => setPkgError(getApiError(error)));
  };

  const handlePackageSubmit = async () => {
    if (!pkgForm.package_code.trim() || !pkgForm.display_name.trim() || !pkgForm.assessment_type_code.trim()) {
      setPkgFormError("Code, Name and Assessment Type Code are required.");
      return;
    }
    setPkgSubmitting(true);
    setPkgFormError(null);
    try {
      if (pkgModalMode === "add") {
        await assessmentPackagesApi.create(pkgForm);
      } else if (selectedPkg) {
        await assessmentPackagesApi.update(selectedPkg.package_id, {
          package_code: pkgForm.package_code,
          display_name: pkgForm.display_name,
          assessment_type_code: pkgForm.assessment_type_code,
        });
      }
      setPkgModalOpen(false);
      fetchPackages();
    } catch (error) {
      setPkgFormError(getApiError(error));
    } finally {
      setPkgSubmitting(false);
    }
  };

  const fetchPackageCategories = useCallback(async (packageId: number) => {
    setPkgCatsLoading(true);
    try {
      const res = await assessmentPackagesApi.listCategories(packageId);
      setPkgCategories(res.data.data);
    } catch (error) {
      setPkgError(getApiError(error));
    } finally {
      setPkgCatsLoading(false);
    }
  }, []);

  const openPackageCategoriesModal = (pkg: AssessmentPackage) => {
    setSelectedPkg(pkg);
    setPkgCatsModalOpen(true);
    fetchPackageCategories(pkg.package_id);
  };

  const handleRemoveCategoryFromPackage = async (categoryId: number) => {
    if (!selectedPkg) return;
    setPkgRemovingCategoryId(categoryId);
    try {
      await assessmentPackagesApi.removeCategory(selectedPkg.package_id, categoryId);
      await fetchPackageCategories(selectedPkg.package_id);
      fetchPackages();
    } catch (error) {
      setPkgError(getApiError(error));
    } finally {
      setPkgRemovingCategoryId(null);
    }
  };

  const openAddCategoryToPackageModal = () => {
    setPkgAddCatsModalOpen(true);
    setSelectedCategoryIds(new Set());
    setPkgAddCatsSearch("");
    setAllCategoriesForPackageLoading(true);
    questionnaireCategoriesApi
      .list({ page: 1, limit: 100 })
      .then((res) => setAllCategoriesForPackage(res.data.data))
      .catch((error) => setPkgError(getApiError(error)))
      .finally(() => setAllCategoriesForPackageLoading(false));
  };

  const handleAddCategoriesToPackage = async () => {
    if (!selectedPkg || selectedCategoryIds.size === 0) return;
    setPkgAddCatsSubmitting(true);
    try {
      const selectedIds = Array.from(selectedCategoryIds);
      await assessmentPackagesApi.addCategories(selectedPkg.package_id, selectedIds);
      const latestRes = await assessmentPackagesApi.listCategories(selectedPkg.package_id);
      const latestAssignedIds = (latestRes.data.data ?? []).map((item) => item.category_id);
      const orderedIds = [
        ...selectedIds,
        ...latestAssignedIds.filter((categoryId) => !selectedIds.includes(categoryId)),
      ];
      await assessmentPackagesApi.reorderCategories(selectedPkg.package_id, { category_ids: orderedIds });
      setPkgAddCatsModalOpen(false);
      await fetchPackageCategories(selectedPkg.package_id);
      fetchPackages();
    } catch (error) {
      setPkgError(getApiError(error));
    } finally {
      setPkgAddCatsSubmitting(false);
    }
  };

  const openAddCategory = () => {
    setCatModalMode("add");
    setSelectedCat(null);
    setCatForm({ ...BLANK_CATEGORY });
    setCatFormError(null);
    setCatModalOpen(true);
  };

  const openEditCategory = (category: QuestionnaireCategory) => {
    setCatModalMode("edit");
    setSelectedCat(category);
    setCatForm({
      category_key: category.category_key,
      display_name: category.display_name,
      category_of: category.category_of ?? "supershyft",
    });
    setCatFormError(null);
    setCatModalOpen(true);
  };

  const handleCategorySubmit = async () => {
    if (!catForm.category_key.trim() || !catForm.display_name.trim()) {
      setCatFormError("Category key and display name are required.");
      return;
    }
    setCatSubmitting(true);
    setCatFormError(null);
    try {
      if (catModalMode === "add") {
        await questionnaireCategoriesApi.create({
          category_key: catForm.category_key,
          display_name: catForm.display_name,
          category_of: catForm.category_of || "supershyft",
        });
      } else if (catModalMode === "edit" && selectedCat) {
        await questionnaireCategoriesApi.update(selectedCat.category_id, {
          category_key: catForm.category_key,
          display_name: catForm.display_name,
          category_of: catForm.category_of || "supershyft",
        });
      }
      setCatModalOpen(false);
      fetchCategories();
      fetchPackages();
    } catch (error) {
      setCatFormError(getApiError(error));
    } finally {
      setCatSubmitting(false);
    }
  };

  const toggleCategoryStatus = async (category: QuestionnaireCategory) => {
    const next = category.status === "active" ? "inactive" : "active";
    try {
      await questionnaireCategoriesApi.updateStatus(category.category_id, next);
      fetchCategories();
      fetchPackages();
    } catch (error) {
      setCatError(getApiError(error));
    }
  };

  const openCategoryDetails = async (category: QuestionnaireCategory) => {
    setCatDetailsCategory(category);
    setCatDetailsOpen(true);
    setCatDetailsLoading(true);
    try {
      const res = await questionnaireCategoriesApi.listQuestions(category.category_id);
      setCatDetailsQuestions(res.data.data);
    } catch (error) {
      setCatError(getApiError(error));
      setCatDetailsQuestions([]);
    } finally {
      setCatDetailsLoading(false);
    }
  };

  const fetchCategoryQuestions = useCallback(async (categoryId: number) => {
    setCatManageQLoading(true);
    try {
      const res = await questionnaireCategoriesApi.listQuestions(categoryId);
      setCatManageQuestions(res.data.data);
    } catch (error) {
      setCatError(getApiError(error));
    } finally {
      setCatManageQLoading(false);
    }
  }, []);

  const openManageCategoryQuestions = (category: QuestionnaireCategory) => {
    setSelectedCat(category);
    setCatManageQOpen(true);
    fetchCategoryQuestions(category.category_id);
  };

  const handleRemoveQuestionFromCategory = async (questionId: number) => {
    if (!selectedCat) return;
    setCatRemovingQuestionId(questionId);
    try {
      await questionnaireCategoriesApi.removeQuestion(selectedCat.category_id, questionId);
      await fetchCategoryQuestions(selectedCat.category_id);
      if (catDetailsCategory?.category_id === selectedCat.category_id) {
        const detailsRes = await questionnaireCategoriesApi.listQuestions(selectedCat.category_id);
        setCatDetailsQuestions(detailsRes.data.data);
      }
    } catch (error) {
      setCatError(getApiError(error));
    } finally {
      setCatRemovingQuestionId(null);
    }
  };

  const openAddQuestionToCategoryModal = () => {
    setCatAddQOpen(true);
    setSelectedQuestionIdsForCategory(new Set());
    setCatAddQSearch("");
    setAllActiveQuestionsLoading(true);
    questionnaireQuestionsApi
      .list({ page: 1, limit: 100, status: "active" })
      .then((res) => setAllActiveQuestions(res.data.data))
      .catch((error) => setCatError(getApiError(error)))
      .finally(() => setAllActiveQuestionsLoading(false));
  };

  const handleAddQuestionsToCategory = async () => {
    if (!selectedCat || selectedQuestionIdsForCategory.size === 0) return;
    setCatAddQSubmitting(true);
    try {
      const selectedIds = Array.from(selectedQuestionIdsForCategory);
      await questionnaireCategoriesApi.assignQuestions(selectedCat.category_id, selectedIds);
      const latestRes = await questionnaireCategoriesApi.listQuestions(selectedCat.category_id);
      const latestAssignedIds = (latestRes.data.data ?? []).map((item) => item.question_id);
      const orderedIds = [
        ...selectedIds,
        ...latestAssignedIds.filter((questionId) => !selectedIds.includes(questionId)),
      ];
      await questionnaireCategoriesApi.reorderQuestions(selectedCat.category_id, { question_ids: orderedIds });
      setCatAddQOpen(false);
      await fetchCategoryQuestions(selectedCat.category_id);
      if (catDetailsCategory?.category_id === selectedCat.category_id) {
        const detailsRes = await questionnaireCategoriesApi.listQuestions(selectedCat.category_id);
        setCatDetailsQuestions(detailsRes.data.data);
      }
    } catch (error) {
      setCatError(getApiError(error));
    } finally {
      setCatAddQSubmitting(false);
    }
  };

  const openAddQuestion = () => {
    setSelectedQ(null);
    setQForm({ ...BLANK_QUESTION });
    setQFormError(null);
    setQModalMode("add");
    setQModalOpen(true);
  };

  const openQuestionDrawer = (questionId: number, tab: QuestionDrawerTab = "overview") => {
    setQDrawerQuestionId(questionId);
    setQDrawerTab(tab);
    setQDrawerOpen(true);
  };

  const openViewQuestion = (question: QuestionnaireQuestion) => {
    openQuestionDrawer(question.question_id);
  };

  const openEditQuestion = (question: QuestionnaireQuestion) => {
    setQDrawerOpen(false);
    questionnaireQuestionsApi.get(question.question_id)
      .then((res) => {
        const item = res.data.data;
        setSelectedQ(item);
        setQForm({
          question_key: item.question_key ?? "",
          question_text: item.question_text ?? "",
          question_type: item.question_type ?? "",
          is_required: !!item.is_required,
          is_read_only: !!item.is_read_only,
          help_text: item.help_text ?? "",
          options: item.options ?? null,
          visibility_rules: item.visibility_rules ?? null,
          prefill_from: item.prefill_from ?? null,
          status: item.status ?? "active",
        });
        setQFormError(null);
        setQModalMode("edit");
        setQModalOpen(true);
      })
      .catch((error) => setQError(getApiError(error)));
  };

  const normalizeQuestionPayload = (form: QuestionnaireQuestionCreate): QuestionnaireQuestionUpdate => {
    const options =
      OPTION_SUPPORTED_TYPES.has(form.question_type)
        ? (form.options ?? []).map((option) => ({
            option_value: option.option_value.trim(),
            display_name: option.display_name.trim(),
            tooltip_text: (option.tooltip_text ?? "").trim() || null,
          }))
        : null;
    return {
      question_key: form.question_key.trim(),
      question_text: form.question_text.trim(),
      question_type: form.question_type,
      is_required: !!form.is_required,
      is_read_only: !!form.is_read_only,
      help_text: (form.help_text ?? "").trim() || null,
      options,
      visibility_rules: form.visibility_rules ?? null,
      prefill_from: form.prefill_from ?? null,
    };
  };

  const validateQuestionForm = (form: QuestionnaireQuestionCreate): string | null => {
    if (!form.question_key.trim()) return "Question key is required.";
    if (!form.question_text.trim()) return "Question text is required.";
    if (!form.question_type) return "Question type is required.";
    if (OPTION_SUPPORTED_TYPES.has(form.question_type)) {
      const options = form.options ?? [];
      if (options.length === 0) {
        return form.question_type === "scale"
          ? "At least one accepted unit is required."
          : "At least one option is required.";
      }
      for (const option of options) {
        if (!option.option_value.trim() || !option.display_name.trim()) {
          return form.question_type === "scale"
            ? "Unit key and unit label are required."
            : "Option value and display name are required.";
        }
      }
    }
    const conditions = form.visibility_rules?.conditions ?? [];
    for (const condition of conditions) {
      if (condition.type === "question_answer") {
        const value = condition.value;
        const isEmptyArray = Array.isArray(value) && value.length === 0;
        if (!condition.question_key || (String(value ?? "").trim() === "" && !Array.isArray(value)) || isEmptyArray) {
          return "Question dependency rule is incomplete.";
        }
      }
      if (condition.type === "user_preference") {
        const value = condition.value;
        const isEmptyArray = Array.isArray(value) && value.length === 0;
        if (!condition.preference_key || (String(value ?? "").trim() === "" && !Array.isArray(value)) || isEmptyArray) {
          return "Preference dependency rule is incomplete.";
        }
      }
    }
    return null;
  };

  const handleQuestionSubmit = async () => {
    const validationError = validateQuestionForm(qForm);
    if (validationError) {
      setQFormError(validationError);
      return;
    }
    setQSubmitting(true);
    setQFormError(null);
    try {
      const payload = normalizeQuestionPayload(qForm);
      if (qModalMode === "add") {
        await questionnaireQuestionsApi.create({
          ...payload,
          status: qForm.status ?? "active",
        });
      } else if (selectedQ) {
        await questionnaireQuestionsApi.update(selectedQ.question_id, payload);
      }
      closeQuestionModal();
      fetchQuestions();
      void fetchUnsyncWarning();
      if (selectedQ && qDrawerQuestionId === selectedQ.question_id) {
        const refreshed = await questionnaireQuestionsApi.get(selectedQ.question_id);
        setSelectedQ(refreshed.data.data);
      }
    } catch (error) {
      setQFormError(getApiError(error));
    } finally {
      setQSubmitting(false);
    }
  };

  const handleToggleQuestionStatus = async () => {
    if (!selectedQ) return;
    const next = selectedQ.status === "active" ? "inactive" : "active";
    setQTogglingStatus(true);
    try {
      await questionnaireQuestionsApi.updateStatus(selectedQ.question_id, next);
      setSelectedQ({ ...selectedQ, status: next });
      fetchQuestions();
    } catch (error) {
      setQFormError(getApiError(error));
    } finally {
      setQTogglingStatus(false);
    }
  };

  const openSyncModal = (question: QuestionnaireQuestion) => {
    setSelectedQ(question);
    setSyncModalOpen(true);
  };

  const openSyncModalFromGap = async (questionId: number) => {
    try {
      const res = await questionnaireQuestionsApi.get(questionId);
      const question = res.data.data;
      setSelectedQ(question);
      openQuestionDrawer(questionId, "sync");
      setSyncModalOpen(true);
    } catch (error) {
      setQError(getApiError(error));
    }
  };

  const handleSyncSaved = (updated: QuestionnaireQuestion) => {
    setSelectedQ(updated);
    fetchQuestions();
    void fetchUnsyncWarning();
  };

  const handleResetMetsightsSync = async () => {
    setResetSyncLoading(true);
    setResetSyncError(null);
    setResetSyncResult(null);
    try {
      const res = await questionnaireQuestionsApi.resetMetsightsSync();
      setResetSyncResult(res.data.data);
      await fetchQuestions();
      await fetchUnsyncWarning();
    } catch (error) {
      setResetSyncError(getApiError(error));
    } finally {
      setResetSyncLoading(false);
    }
  };

  const handleReloadBloodParameters = async () => {
    setReloadBloodLoading(true);
    setReloadBloodError(null);
    setReloadBloodResult(null);
    try {
      const res = await questionnaireQuestionsApi.reloadBloodParameters();
      setReloadBloodResult(res.data.data);
      await fetchQuestions();
      await fetchUnsyncWarning();
    } catch (error) {
      setReloadBloodError(getApiError(error));
    } finally {
      setReloadBloodLoading(false);
    }
  };

  // Unsync'd questions warning
  const fetchUnsyncWarning = useCallback(async () => {
    setUnsyncWarningLoading(true);
    try {
      const res = await questionnaireQuestionsApi.listMetsightsSyncGaps();
      setUnsyncWarning(res.data.data);
    } catch {
      setUnsyncWarning({
        count: 0,
        summary: { not_configured: 0, pull_disabled: 0, push_disabled: 0 },
        questions: [],
      });
    } finally {
      setUnsyncWarningLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "questions") {
      fetchUnsyncWarning();
    } else {
      setUnsyncWarningExpanded(false);
    }
  }, [activeTab, fetchUnsyncWarning]);

  useEffect(() => {
    if (!unsyncWarningExpanded) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (unsyncDropdownRef.current && !unsyncDropdownRef.current.contains(event.target as Node)) {
        setUnsyncWarningExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [unsyncWarningExpanded]);

  const availableCategoriesForPackage = useMemo(() => {
    const mappedIds = new Set(pkgCategories.map((category) => category.category_id));
    const filtered = allCategoriesForPackage.filter((category) => !mappedIds.has(category.category_id));
    if (!pkgAddCatsSearch.trim()) return filtered;
    const search = pkgAddCatsSearch.trim().toLowerCase();
    return filtered.filter((category) =>
      category.display_name.toLowerCase().includes(search) ||
      category.category_key.toLowerCase().includes(search)
    );
  }, [allCategoriesForPackage, pkgAddCatsSearch, pkgCategories]);

  const availableQuestionsForCategory = useMemo(() => {
    const mappedIds = new Set(catManageQuestions.map((question) => question.question_id));
    const filtered = allActiveQuestions.filter((question) => !mappedIds.has(question.question_id));
    if (!catAddQSearch.trim()) return filtered;
    const search = catAddQSearch.trim().toLowerCase();
    return filtered.filter((question) =>
      (question.question_text ?? "").toLowerCase().includes(search) ||
      (question.question_key ?? "").toLowerCase().includes(search)
    );
  }, [allActiveQuestions, catAddQSearch, catManageQuestions]);

  const onCategoryQuestionsDragEnd = async (event: DragEndEvent) => {
    if (!selectedCat || catManageQLoading || catReorderingQuestions || catManageQuestions.length < 2) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = catManageQuestions.findIndex((item) => item.question_id === Number(active.id));
    const newIndex = catManageQuestions.findIndex((item) => item.question_id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = [...catManageQuestions];
    const next = arrayMove(catManageQuestions, oldIndex, newIndex);
    setCatManageQuestions(next);
    if (catDetailsCategory?.category_id === selectedCat.category_id) {
      setCatDetailsQuestions(next);
    }
    setCatReorderingQuestions(true);
    try {
      await questionnaireCategoriesApi.reorderQuestions(selectedCat.category_id, {
        question_ids: next.map((item) => item.question_id),
      });
      await fetchCategoryQuestions(selectedCat.category_id);
      if (catDetailsCategory?.category_id === selectedCat.category_id) {
        const detailsRes = await questionnaireCategoriesApi.listQuestions(selectedCat.category_id);
        setCatDetailsQuestions(detailsRes.data.data);
      }
    } catch (error) {
      setCatManageQuestions(previous);
      if (catDetailsCategory?.category_id === selectedCat.category_id) {
        setCatDetailsQuestions(previous);
      }
      setCatError(getApiError(error));
    } finally {
      setCatReorderingQuestions(false);
    }
  };

  const onPackageCategoriesDragEnd = async (event: DragEndEvent) => {
    if (!selectedPkg || pkgCatsLoading || pkgReorderingCategories || pkgCategories.length < 2) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pkgCategories.findIndex((item) => item.category_id === Number(active.id));
    const newIndex = pkgCategories.findIndex((item) => item.category_id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = [...pkgCategories];
    const next = arrayMove(pkgCategories, oldIndex, newIndex);
    setPkgCategories(next);
    setPkgReorderingCategories(true);
    try {
      await assessmentPackagesApi.reorderCategories(selectedPkg.package_id, {
        category_ids: next.map((item) => item.category_id),
      });
      await fetchPackageCategories(selectedPkg.package_id);
      fetchPackages();
    } catch (error) {
      setPkgCategories(previous);
      setPkgError(getApiError(error));
    } finally {
      setPkgReorderingCategories(false);
    }
  };

  const pkgColumns: Column<AssessmentPackage>[] = [
    {
      key: "display_name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <span className="font-medium text-zinc-900">{row.display_name || row.package_code || "—"}</span>
      ),
    },
    {
      key: "category_count",
      label: "Categories",
      render: (row) => (
        <span className="text-zinc-700">{pkgCategoryCounts[row.package_id] ?? "—"}</span>
      ),
    },
    {
      key: "assessment_type_code",
      label: "Assessment Type",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">
          {row.assessment_type_code ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => {
        const isActive = row.status === "active";
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const next = isActive ? "inactive" : "active";
              assessmentPackagesApi
                .updateStatus(row.package_id, next)
                .then(() => fetchPackages())
                .catch((error) => setPkgError(getApiError(error)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition-colors ${isActive ? "bg-emerald-500" : "bg-zinc-300"}`}
            aria-pressed={isActive}
            aria-label={`Set ${row.display_name ?? "package"} ${isActive ? "inactive" : "active"}`}
          >
            <span className={`h-5 w-5 bg-white rounded-full shadow transform transition-transform ${isActive ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        );
      },
    },
  ];

  const qColumns: Column<QuestionnaireQuestion>[] = [
    {
      key: "question_text",
      label: "Question",
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-zinc-900 line-clamp-2">{row.question_text || "—"}</p>
          <p className="text-xs text-zinc-500 font-mono">{row.question_key || "—"}</p>
        </div>
      ),
    },
    {
      key: "question_type",
      label: "Type",
      sortable: true,
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">
          {row.question_type ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => {
        const isActive = row.status === "active";
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const next = isActive ? "inactive" : "active";
              questionnaireQuestionsApi
                .updateStatus(row.question_id, next)
                .then(() => fetchQuestions())
                .catch((error) => setQError(getApiError(error)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition-colors ${isActive ? "bg-zinc-900" : "bg-zinc-300"}`}
            aria-pressed={isActive}
            aria-label={`Set question ${isActive ? "inactive" : "active"}`}
          >
            <span className={`h-5 w-5 bg-white rounded-full shadow transform transition-transform ${isActive ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Assessments</h1>
        <div className="flex items-center gap-2 shrink-0">
          {activeTab === "questions" && unsyncWarningLoading && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </span>
          )}
          {activeTab === "questions" && !unsyncWarningLoading && unsyncWarning.count > 0 && (
            <div ref={unsyncDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setUnsyncWarningExpanded((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100 transition-colors"
                title="Questions in Metsights categories with incomplete sync config"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">{unsyncWarning.count}</span>
                  <span className="hidden sm:inline"> unsynced</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${unsyncWarningExpanded ? "rotate-180" : ""}`} />
              </button>
              {unsyncWarningExpanded && (
                <div className="absolute right-0 top-full mt-1.5 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-amber-200 bg-white shadow-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-amber-100 bg-amber-50">
                    <p className="text-xs font-medium text-amber-900">
                      {unsyncWarning.count} question{unsyncWarning.count !== 1 ? "s" : ""} need Metsights sync
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {unsyncWarning.summary.not_configured > 0 && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">
                          {unsyncWarning.summary.not_configured} not configured
                        </span>
                      )}
                      {unsyncWarning.summary.pull_disabled > 0 && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">
                          {unsyncWarning.summary.pull_disabled} pull off
                        </span>
                      )}
                      {unsyncWarning.summary.push_disabled > 0 && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">
                          {unsyncWarning.summary.push_disabled} push off
                        </span>
                      )}
                    </div>
                  </div>
                  <ul className="max-h-64 overflow-y-auto divide-y divide-zinc-100">
                    {unsyncWarning.questions.map((q) => (
                      <li key={q.question_id} className="px-3 py-2 hover:bg-zinc-50">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setUnsyncWarningExpanded(false);
                              openQuestionDrawer(q.question_id);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="font-mono text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded">
                              {q.question_key ?? `#${q.question_id}`}
                            </span>
                            <p className="text-xs text-zinc-700 line-clamp-2 mt-0.5">{q.question_text ?? "—"}</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUnsyncWarningExpanded(false);
                              void openSyncModalFromGap(q.question_id);
                            }}
                            className="shrink-0 text-[10px] font-medium text-zinc-700 hover:text-zinc-900"
                          >
                            Configure
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {q.metsights_categories.map((cat) => (
                            <span
                              key={cat.category_id}
                              className="inline-flex px-1 py-0.5 rounded text-[10px] bg-zinc-100 text-zinc-700"
                            >
                              {cat.category_key ?? cat.display_name}
                            </span>
                          ))}
                          <span className={`inline-flex px-1 py-0.5 rounded text-[10px] ${q.sync_gaps.pull_disabled ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-700"}`}>
                            Pull {q.sync_gaps.pull_disabled ? "OFF" : "ON"}
                          </span>
                          <span className={`inline-flex px-1 py-0.5 rounded text-[10px] ${q.sync_gaps.push_disabled ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-700"}`}>
                            Push {q.sync_gaps.push_disabled ? "OFF" : "ON"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {activeTab === "questions" && (
            <button
              type="button"
              onClick={() => {
                setReloadBloodError(null);
                setReloadBloodResult(null);
                setReloadBloodOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
              title="Reload blood parameter questions from Metsights OPTIONS schema"
            >
              <Droplets className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Reload Blood Parameters</span>
            </button>
          )}
          {activeTab === "questions" && (
            <button
              type="button"
              onClick={() => {
                setResetSyncError(null);
                setResetSyncResult(null);
                setResetSyncOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
              title="Reset Metsights sync categories, assignments, and configs from codebase registry"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Reset Metsights Sync</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSyncLogsOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
            title="View Metsights push/pull sync logs"
          >
            <ScrollText className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Sync Logs</span>
          </button>
        {activeTab === "packages" && (
          <button
            onClick={openAddPackage}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Package</span>
          </button>
        )}
        {activeTab === "categories" && (
          <button
            onClick={openAddCategory}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Category</span>
          </button>
        )}
        {activeTab === "questions" && (
          <button
            onClick={openAddQuestion}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Question</span>
          </button>
        )}
        </div>
      </div>

      <IntegrationSyncLogsModal open={syncLogsOpen} onClose={() => setSyncLogsOpen(false)} />

      <Modal
        open={resetSyncOpen}
        onClose={() => {
          if (!resetSyncLoading) setResetSyncOpen(false);
        }}
        title="Reset Metsights Sync"
      >
        <div className="space-y-4">
          {!resetSyncResult ? (
            <>
              <p className="text-sm text-zinc-600">
                This will create or update the four Metsights API categories (
                <span className="font-medium text-zinc-800">physical-measurement</span>,{" "}
                <span className="font-medium text-zinc-800">vitals</span>,{" "}
                <span className="font-medium text-zinc-800">diet-lifestyle-parameters</span>,{" "}
                <span className="font-medium text-zinc-800">fitness-parameters</span>
                ), assign questions by <code className="text-xs bg-zinc-100 px-1 rounded">question_key</code>, and
                overwrite <code className="text-xs bg-zinc-100 px-1 rounded">metsights_sync</code> from the codebase
                registry.
              </p>
              <p className="text-sm text-zinc-500">
                Existing SuperShyft UX categories and question definitions are not changed.
              </p>
              {resetSyncError && (
                <p className="text-sm text-red-600">{resetSyncError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetSyncOpen(false)}
                  disabled={resetSyncLoading}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetMetsightsSync()}
                  disabled={resetSyncLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
                >
                  {resetSyncLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Reset
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-700 font-medium">Metsights sync reset complete.</p>
              <ul className="text-sm text-zinc-600 space-y-1.5">
                <li>
                  <span className="font-medium text-zinc-800">{resetSyncResult.categories_total}</span> Metsights categories configured
                  {(resetSyncResult.categories_created > 0 || resetSyncResult.categories_updated > 0) && (
                    <span className="text-zinc-500">
                      {" "}
                      ({resetSyncResult.categories_created > 0 && `${resetSyncResult.categories_created} created`}
                      {resetSyncResult.categories_created > 0 && resetSyncResult.categories_updated > 0 && ", "}
                      {resetSyncResult.categories_updated > 0 && `${resetSyncResult.categories_updated} updated`})
                    </span>
                  )}
                </li>
                <li>
                  <span className="font-medium text-zinc-800">{resetSyncResult.question_links_total}</span> question-to-category links assigned
                  {resetSyncResult.links_added > 0 && (
                    <span className="text-zinc-500"> ({resetSyncResult.links_added} new)</span>
                  )}
                </li>
                <li>
                  <span className="font-medium text-zinc-800">{resetSyncResult.questions_sync_updated}</span> sync configs applied
                </li>
                <li>
                  <span className="font-medium text-zinc-800">{resetSyncResult.package_links_total}</span> package links configured
                  {resetSyncResult.package_links_added > 0 && (
                    <span className="text-zinc-500"> ({resetSyncResult.package_links_added} new)</span>
                  )}
                </li>
              </ul>
              {resetSyncResult.schema_upgraded && (
                <p className="text-sm text-zinc-500">Database schema upgraded for Metsights category keys.</p>
              )}
              {resetSyncResult.missing_question_keys.length > 0 && (
                <p className="text-sm text-amber-700">
                  Missing questions: {resetSyncResult.missing_question_keys.join(", ")}
                </p>
              )}
              {resetSyncResult.missing_package_codes.length > 0 && (
                <p className="text-sm text-amber-700">
                  Missing packages: {resetSyncResult.missing_package_codes.join(", ")}
                </p>
              )}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setResetSyncOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={reloadBloodOpen}
        onClose={() => {
          if (!reloadBloodLoading) setReloadBloodOpen(false);
        }}
        title="Reload Blood Parameters"
      >
        <div className="space-y-4">
          {!reloadBloodResult ? (
            <>
              <p className="text-sm text-zinc-600">
                This will <span className="font-medium text-red-700">delete all existing blood-parameter questions</span>{" "}
                and any saved responses for those keys, then recreate ~49 scale questions from the Metsights OPTIONS
                schema (e.g. <code className="text-xs bg-zinc-100 px-1 rounded">haemoglobin</code> with unit{" "}
                <code className="text-xs bg-zinc-100 px-1 rounded">g/dL</code>).
              </p>
              <p className="text-sm text-zinc-500">
                Metsights categories <span className="font-medium text-zinc-800">blood-parameters</span> and{" "}
                <span className="font-medium text-zinc-800">advanced-blood-parameters</span> will be configured with
                push/pull sync to the corresponding Metsights API endpoints.
              </p>
              {reloadBloodError && (
                <p className="text-sm text-red-600">{reloadBloodError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReloadBloodOpen(false)}
                  disabled={reloadBloodLoading}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleReloadBloodParameters()}
                  disabled={reloadBloodLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
                >
                  {reloadBloodLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Reload
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-700 font-medium">Blood parameters reload complete.</p>
              <ul className="text-sm text-zinc-600 space-y-1.5">
                <li>
                  <span className="font-medium text-zinc-800">{reloadBloodResult.questions_deleted}</span> questions deleted
                  {reloadBloodResult.responses_deleted > 0 && (
                    <span className="text-zinc-500"> ({reloadBloodResult.responses_deleted} responses removed)</span>
                  )}
                </li>
                <li>
                  <span className="font-medium text-zinc-800">{reloadBloodResult.questions_created}</span> questions created
                </li>
                <li>
                  <span className="font-medium text-zinc-800">{reloadBloodResult.question_links_total}</span> category links assigned
                  {reloadBloodResult.links_added > 0 && (
                    <span className="text-zinc-500"> ({reloadBloodResult.links_added} new)</span>
                  )}
                </li>
                <li>
                  <span className="font-medium text-zinc-800">{reloadBloodResult.package_links_total}</span> package links configured
                  {reloadBloodResult.package_links_added > 0 && (
                    <span className="text-zinc-500"> ({reloadBloodResult.package_links_added} new)</span>
                  )}
                </li>
              </ul>
              {reloadBloodResult.missing_package_codes.length > 0 && (
                <p className="text-sm text-amber-700">
                  Missing packages: {reloadBloodResult.missing_package_codes.join(", ")}
                </p>
              )}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setReloadBloodOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <div className="flex gap-1 mb-5 border-b border-zinc-200">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            onClick={() => navigate(`/assessments/${tab}`)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === tab
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab === "packages" ? "Packages" : tab === "categories" ? "Categories" : "Questions"}
          </button>
        ))}
      </div>

      {activeTab === "packages" && (
        <div>
          {pkgError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start justify-between gap-2">
              <span>{pkgError}</span>
              <button onClick={() => setPkgError(null)} className="shrink-0 text-red-400 hover:text-red-600">
                ✕
              </button>
            </div>
          )}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Search by package name or code..."
                value={pkgSearch}
                onChange={(e) => setPkgSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <select
              value={pkgStatusFilter}
              onChange={(e) => setPkgStatusFilter(e.target.value)}
              className="sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
            >
              <option value="">All statuses</option>
              {PKG_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {cap(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            {pkgLoading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
              </div>
            ) : (
              <DataTable
                columns={pkgColumns}
                data={pkgData}
                keyExtractor={(row) => row.package_id}
                sortKey={pkgSortKey}
                sortDir={pkgSortDir}
                onSort={(key) => {
                  setPkgSortDir((dir) => (pkgSortKey === key ? (dir === "asc" ? "desc" : "asc") : "asc"));
                  setPkgSortKey(key);
                }}
                onView={openViewPackage}
                onEdit={openEditPackage}
                onQuestions={openPackageCategoriesModal}
                onQuestionsLabel="Manage Categories"
                firstColumnClickableView
                pagination={{ page: pkgPage, limit: pkgLimit, total: pkgTotal, onPageChange: setPkgPage }}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === "categories" && (
        <div>
          {catError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start justify-between gap-2">
              <span>{catError}</span>
              <button onClick={() => setCatError(null)} className="shrink-0 text-red-400 hover:text-red-600">
                ✕
              </button>
            </div>
          )}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Search categories..."
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="flex flex-row gap-2 flex-wrap sm:flex-nowrap">
              <select
                value={catCategoryOfFilter}
                onChange={(e) => setCatCategoryOfFilter(e.target.value)}
                className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="">All sources</option>
                <option value="supershyft">SuperShyft</option>
                <option value="metsights">Metsights</option>
              </select>
              <select
                value={catStatusFilter}
                onChange={(e) => setCatStatusFilter(e.target.value)}
                className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="">All statuses</option>
                {CAT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {cap(status)}
                  </option>
                ))}
              </select>
              <select
                value={catSortKey}
                onChange={(e) => setCatSortKey(e.target.value as "display_name" | "category_key" | "category_id")}
                className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="display_name">Sort by Name</option>
                <option value="category_key">Sort by Key</option>
                <option value="category_id">Sort by Latest</option>
              </select>
              <button
                onClick={() => setCatSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
                className="px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {catSortDir === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
          </div>

          {catLoading ? (
            <div className="py-16 flex justify-center bg-white rounded-xl border border-zinc-200">
              <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
            </div>
          ) : catData.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 border border-dashed border-zinc-300 rounded-xl">
              No categories found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {catData.map((category) => (
                <button
                  key={category.category_id}
                  type="button"
                  onClick={() => openCategoryDetails(category)}
                  className="text-left p-4 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-zinc-900 truncate">{category.display_name}</p>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">{category.category_key}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={category.status} />
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${category.category_of === "metsights" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                        {category.category_of === "metsights" ? "Metsights" : "SuperShyft"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditCategory(category);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openManageCategoryQuestions(category);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs hover:bg-zinc-800"
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                      Manage Questions
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Active / Inactive</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleCategoryStatus(category);
                      }}
                      className={`inline-flex items-center w-11 h-6 rounded-full transition-colors ${category.status === "active" ? "bg-emerald-500" : "bg-zinc-300"}`}
                      aria-pressed={category.status === "active"}
                      aria-label={`Set ${category.display_name} ${category.status === "active" ? "inactive" : "active"}`}
                    >
                      <span className={`h-5 w-5 bg-white rounded-full shadow transform transition-transform ${category.status === "active" ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}

          {catTotal > catLimit && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setCatPage((page) => Math.max(1, page - 1))}
                disabled={catPage === 1}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm text-zinc-700 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-zinc-600">Page {catPage}</span>
              <button
                onClick={() => setCatPage((page) => page + 1)}
                disabled={catPage * catLimit >= catTotal}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm text-zinc-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "questions" && (
        <div>
          {qError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start justify-between gap-2">
              <span>{qError}</span>
              <button onClick={() => setQError(null)} className="shrink-0 text-red-400 hover:text-red-600">
                ✕
              </button>
            </div>
          )}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Search questions..."
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="flex flex-row gap-2 flex-wrap sm:flex-nowrap">
              <select
                value={qStatusFilter}
                onChange={(e) => setQStatusFilter(e.target.value)}
                className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="">All statuses</option>
                {Q_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {cap(status)}
                  </option>
                ))}
              </select>
              <select
                value={qTypeFilter}
                onChange={(e) => setQTypeFilter(e.target.value)}
                className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="">All types</option>
                {QUESTION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            {qLoading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
              </div>
            ) : (
              <DataTable
                columns={qColumns}
                data={qData}
                keyExtractor={(row) => row.question_id}
                sortKey={qSortKey}
                sortDir={qSortDir}
                onSort={(key) => {
                  setQSortDir((dir) => (qSortKey === key ? (dir === "asc" ? "desc" : "asc") : "asc"));
                  setQSortKey(key);
                }}
                onView={openViewQuestion}
                onEdit={openEditQuestion}
                firstColumnClickableView
                pagination={{ page: qPage, limit: qLimit, total: qTotal, onPageChange: setQPage }}
              />
            )}
          </div>
        </div>
      )}

      <Modal
        open={pkgModalOpen}
        onClose={() => setPkgModalOpen(false)}
        title={pkgModalMode === "add" ? "Add Package" : pkgModalMode === "edit" ? "Edit Package" : "Package Details"}
        maxWidthClassName="max-w-lg"
      >
        {pkgModalMode === "view" && selectedPkg ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-zinc-500 mb-0.5">Name</dt>
                <dd className="font-medium text-zinc-900">{selectedPkg.display_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500 mb-0.5">Code</dt>
                <dd>
                  <span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">
                    {selectedPkg.package_code ?? "—"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 mb-0.5">Status</dt>
                <dd>
                  <StatusBadge status={selectedPkg.status} />
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 mb-0.5">Assessment Type Code</dt>
                <dd className="font-medium text-zinc-900">{selectedPkg.assessment_type_code ?? "—"}</dd>
              </div>
            </dl>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={() => {
                  setPkgModalOpen(false);
                  openPackageCategoriesModal(selectedPkg);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
              >
                <ListChecks className="w-4 h-4" /> Manage Categories
              </button>
              <button
                onClick={() => openEditPackage(selectedPkg)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
              >
                Edit Package
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handlePackageSubmit();
            }}
            className="space-y-4"
          >
            {pkgFormError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {pkgFormError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pkgForm.package_code}
                onChange={(e) => setPkgForm({ ...pkgForm, package_code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
                placeholder="e.g. basic_health"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pkgForm.display_name}
                onChange={(e) => setPkgForm({ ...pkgForm, display_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="e.g. Basic Health"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Assessment Type Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pkgForm.assessment_type_code}
                onChange={(e) => setPkgForm({ ...pkgForm, assessment_type_code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="e.g. 1, 2, 7"
                required
              />
            </div>
            {pkgModalMode === "add" && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
                <select
                  value={pkgForm.status}
                  onChange={(e) => setPkgForm({ ...pkgForm, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  {PKG_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {cap(status)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                type="submit"
                disabled={pkgSubmitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {pkgSubmitting ? "Saving..." : pkgModalMode === "add" ? "Create Package" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setPkgModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={pkgCatsModalOpen}
        onClose={() => setPkgCatsModalOpen(false)}
        title={selectedPkg ? `Categories — ${selectedPkg.display_name ?? selectedPkg.package_code}` : "Package Categories"}
        maxWidthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {pkgCatsLoading
                ? "Loading..."
                : `${pkgCategories.length} categories${pkgCategories.length > 1 ? " · Drag to reorder" : ""}`}
            </p>
            <button
              onClick={openAddCategoryToPackageModal}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Categories
            </button>
          </div>
          {pkgCatsLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : pkgCategories.length === 0 ? (
            <div className="py-10 text-center text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-lg">
              No categories in this package yet.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => void onPackageCategoriesDragEnd(event)}
            >
              <SortableContext
                items={pkgCategories.map((category) => category.category_id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 border border-zinc-200 rounded-lg max-h-[50vh] overflow-y-auto p-2">
                  {pkgCategories.map((category) => (
                    <SortableItem
                      key={category.category_id}
                      id={category.category_id}
                      handle={<GripVertical className="w-4 h-4" />}
                      className="border border-zinc-200 rounded-lg px-3 py-3 bg-white hover:bg-zinc-50"
                    >
                      <div className="flex items-start sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-900 leading-snug">{category.display_name ?? "—"}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            <span className="font-mono">{category.category_key ?? "—"}</span>
                            {category.category_of && (
                              <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${category.category_of === "metsights" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                                {category.category_of === "metsights" ? "Metsights" : "SuperShyft"}
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveCategoryFromPackage(category.category_id)}
                          disabled={pkgRemovingCategoryId === category.category_id || pkgReorderingCategories}
                          className="shrink-0 text-xs text-red-500 hover:text-red-700 disabled:opacity-40 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          {pkgRemovingCategoryId === category.category_id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </Modal>

      <Modal
        open={pkgAddCatsModalOpen}
        onClose={() => setPkgAddCatsModalOpen(false)}
        title="Add Categories to Package"
        maxWidthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          {allCategoriesForPackageLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search categories..."
                  value={pkgAddCatsSearch}
                  onChange={(e) => setPkgAddCatsSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              {availableCategoriesForPackage.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-lg">
                  All categories are already mapped to this package.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                  {availableCategoriesForPackage.map((category) => {
                    const checked = selectedCategoryIds.has(category.category_id);
                    return (
                      <li
                        key={category.category_id}
                        onClick={() => {
                          setSelectedCategoryIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(category.category_id)) next.delete(category.category_id);
                            else next.add(category.category_id);
                            return next;
                          });
                        }}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? "bg-zinc-50" : "hover:bg-zinc-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => undefined}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-0.5 h-4 w-4 rounded border-zinc-300 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-900 leading-snug">{category.display_name}</p>
                          <p className="text-xs text-zinc-400 mt-0.5 font-mono">{category.category_key}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-1">
                <span className="text-sm text-zinc-500">
                  {selectedCategoryIds.size > 0 ? `${selectedCategoryIds.size} selected` : "Select categories to add"}
                </span>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleAddCategoriesToPackage}
                    disabled={selectedCategoryIds.size === 0 || pkgAddCatsSubmitting}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    {pkgAddCatsSubmitting ? "Adding..." : `Add ${selectedCategoryIds.size || ""} Categories`}
                  </button>
                  <button
                    onClick={() => setPkgAddCatsModalOpen(false)}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={catModalMode === "add" ? "Add Category" : catModalMode === "edit" ? "Edit Category" : "Category Details"}
        maxWidthClassName="max-w-lg"
      >
        {catModalMode === "view" && selectedCat ? (
          <div className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500 mb-1">Display Name</dt>
                <dd className="text-zinc-900 font-medium">{selectedCat.display_name}</dd>
              </div>
              <div>
                <dt className="text-zinc-500 mb-1">Category Key</dt>
                <dd className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded inline-block">
                  {selectedCat.category_key}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 mb-1">Status</dt>
                <dd>
                  <StatusBadge status={selectedCat.status} />
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 mb-1">Category Of</dt>
                <dd>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${selectedCat.category_of === "metsights" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                    {selectedCat.category_of === "metsights" ? "Metsights" : "SuperShyft"}
                  </span>
                </dd>
              </div>
            </dl>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={() => openEditCategory(selectedCat)}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
              >
                Edit Category
              </button>
              <button
                onClick={() => openManageCategoryQuestions(selectedCat)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
              >
                Manage Questions
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleCategorySubmit();
            }}
            className="space-y-4"
          >
            {catFormError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {catFormError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Category Key <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={catForm.category_key}
                onChange={(e) => setCatForm({ ...catForm, category_key: e.target.value.toLowerCase() })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
                placeholder="e.g. vitals"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={catForm.display_name}
                onChange={(e) => setCatForm({ ...catForm, display_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="e.g. Diet & Lifestyle"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Category Of</label>
              <select
                value={catForm.category_of ?? "supershyft"}
                onChange={(e) => setCatForm({ ...catForm, category_of: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                {CATEGORY_OF_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{cap(opt)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                type="submit"
                disabled={catSubmitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {catSubmitting ? "Saving..." : catModalMode === "add" ? "Create Category" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={catDetailsOpen}
        onClose={() => setCatDetailsOpen(false)}
        title={catDetailsCategory ? catDetailsCategory.display_name : "Category"}
        maxWidthClassName="max-w-3xl"
      >
        <div className="space-y-4">
          {catDetailsCategory && (
            <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm text-zinc-500">Category Key</p>
                  <p className="text-sm font-mono text-zinc-800">{catDetailsCategory.category_key}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${catDetailsCategory.category_of === "metsights" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                    {catDetailsCategory.category_of === "metsights" ? "Metsights" : "SuperShyft"}
                  </span>
                  <StatusBadge status={catDetailsCategory.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => openEditCategory(catDetailsCategory)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-100"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => openManageCategoryQuestions(catDetailsCategory)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-sm hover:bg-zinc-800"
                >
                  <ListChecks className="w-4 h-4" />
                  Manage Questions
                </button>
              </div>
            </div>
          )}

          {catDetailsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
            </div>
          ) : catDetailsQuestions.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 border border-dashed border-zinc-300 rounded-lg">
              No questions assigned to this category.
            </div>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {catDetailsQuestions.map((question) => (
                <div key={question.question_id} className="border border-zinc-200 rounded-lg">
                  <div className="p-3">
                    <p className="text-sm font-medium text-zinc-900">{question.question_text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">{question.question_type}</span>
                      <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">{question.question_key}</span>
                      <StatusBadge status={question.status} />
                    </div>
                    {question.help_text && <p className="text-xs text-zinc-500 mt-2">{question.help_text}</p>}
                  </div>
                  {OPTION_SUPPORTED_TYPES.has(question.question_type ?? "") && (question.options?.length ?? 0) > 0 && (
                    <details className="border-t border-zinc-200">
                      <summary className="cursor-pointer list-none px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                        {question.question_type === "scale" ? "View accepted units" : "View options"}
                      </summary>
                      <div className="px-3 pb-3 space-y-2">
                        {question.options?.map((option, index) => (
                          <div key={`${option.option_value}-${index}`} className="p-2 rounded border border-zinc-200 bg-zinc-50">
                            <p className="text-sm text-zinc-900">
                              <span className="font-mono">{option.option_value}</span> - {option.display_name}
                            </p>
                            {option.tooltip_text && <p className="text-xs text-zinc-500 mt-0.5">{option.tooltip_text}</p>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={catManageQOpen}
        onClose={() => setCatManageQOpen(false)}
        title={selectedCat ? `Questions — ${selectedCat.display_name}` : "Category Questions"}
        maxWidthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {catManageQLoading
                ? "Loading..."
                : `${catManageQuestions.length} questions${catManageQuestions.length > 1 ? " · Drag to reorder" : ""}`}
            </p>
            <button
              onClick={openAddQuestionToCategoryModal}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Questions
            </button>
          </div>
          {catManageQLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : catManageQuestions.length === 0 ? (
            <div className="py-10 text-center text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-lg">
              No questions in this category yet.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => void onCategoryQuestionsDragEnd(event)}
            >
              <SortableContext
                items={catManageQuestions.map((question) => question.question_id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 border border-zinc-200 rounded-lg max-h-[50vh] overflow-y-auto p-2">
                  {catManageQuestions.map((question) => (
                    <SortableItem
                      key={question.question_id}
                      id={question.question_id}
                      handle={<GripVertical className="w-4 h-4" />}
                      className="border border-zinc-200 rounded-lg px-3 py-3 bg-white hover:bg-zinc-50"
                    >
                      <div className="flex items-start sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-900 leading-snug">{question.question_text ?? "—"}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {question.question_key && <span className="font-mono">{question.question_key}</span>}
                            {question.question_type && (
                              <>
                                {" "}
                                · <span className="font-mono">{question.question_type}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveQuestionFromCategory(question.question_id)}
                          disabled={catRemovingQuestionId === question.question_id || catReorderingQuestions}
                          className="shrink-0 text-xs text-red-500 hover:text-red-700 disabled:opacity-40 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          {catRemovingQuestionId === question.question_id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </Modal>

      <Modal
        open={catAddQOpen}
        onClose={() => setCatAddQOpen(false)}
        title="Add Questions to Category"
        maxWidthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          {allActiveQuestionsLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search questions..."
                  value={catAddQSearch}
                  onChange={(e) => setCatAddQSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              {availableQuestionsForCategory.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-lg">
                  All active questions are already mapped to this category.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                  {availableQuestionsForCategory.map((question) => {
                    const checked = selectedQuestionIdsForCategory.has(question.question_id);
                    return (
                      <li
                        key={question.question_id}
                        onClick={() =>
                          setSelectedQuestionIdsForCategory((prev) => {
                            const next = new Set(prev);
                            if (next.has(question.question_id)) next.delete(question.question_id);
                            else next.add(question.question_id);
                            return next;
                          })
                        }
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? "bg-zinc-50" : "hover:bg-zinc-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => undefined}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-0.5 h-4 w-4 rounded border-zinc-300 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-900 leading-snug">{question.question_text ?? "—"}</p>
                          <p className="text-xs text-zinc-400 mt-0.5 font-mono">{question.question_key ?? "—"}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-1">
                <span className="text-sm text-zinc-500">
                  {selectedQuestionIdsForCategory.size > 0
                    ? `${selectedQuestionIdsForCategory.size} selected`
                    : "Select questions to add"}
                </span>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleAddQuestionsToCategory}
                    disabled={selectedQuestionIdsForCategory.size === 0 || catAddQSubmitting}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    {catAddQSubmitting ? "Adding..." : `Add ${selectedQuestionIdsForCategory.size || ""} Questions`}
                  </button>
                  <button
                    onClick={() => setCatAddQOpen(false)}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <QuestionDetailDrawer
        open={qDrawerOpen}
        questionId={qDrawerQuestionId}
        initialTab={qDrawerTab}
        onClose={closeQuestionDrawer}
        onEdit={(question) => openEditQuestion(question)}
        onConfigureSync={(question) => openSyncModal(question)}
        onUpdated={(question) => {
          setSelectedQ(question);
          fetchQuestions();
        }}
      />

      <Modal
        open={qModalOpen}
        onClose={closeQuestionModal}
        title={qModalMode === "add" ? "Add Question" : "Edit Question"}
        maxWidthClassName="max-w-2xl"
      >
        <QuestionForm
          value={qForm}
          onChange={setQForm}
          availableQuestionKeys={qData
            .map((question) => question.question_key ?? "")
            .filter((item) => item.length > 0)}
          mode={qModalMode}
          error={qFormError}
          submitting={qSubmitting}
          currentStatus={selectedQ?.status}
          togglingStatus={qTogglingStatus}
          onToggleStatus={handleToggleQuestionStatus}
          onSubmit={handleQuestionSubmit}
          onCancel={closeQuestionModal}
        />
      </Modal>

      <MetsightsSyncConfigModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        question={selectedQ}
        onSaved={handleSyncSaved}
      />

    </div>
  );
}
