import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Loader2, Users, Download, Trash2, AlertTriangle, Bell, X, Pencil } from "lucide-react";
import { Modal } from "./Modal";
import {
  participantsApi,
  engagementsApi,
  organizationsApi,
  type Participant,
  type Engagement,
  type OrganizationDepartment,
  getApiError,
} from "../../lib/api";
import { EngagementNotificationModal } from "../../features/engagements/EngagementNotificationModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type Source =
  | { kind: "engagement-id"; engagementId: number; name?: string }
  | { kind: "engagement-code"; code: string; name?: string }
  | { kind: "public" }
  | { kind: "organization"; orgId: number; orgName?: string }
  | { kind: "camp"; campNo: number; campName?: string; organizationId: number };

interface ParticipantsModalProps {
  open: boolean;
  onClose: () => void;
  source: Source;
}

type BoolFilter = "all" | "yes" | "no";

interface ColumnFilters {
  engagementDate: string;
  department: string;
  doctorConsultation: BoolFilter;
  nutritionistConsultation: BoolFilter;
  doctorAndNutritionist: BoolFilter;
}

const DEFAULT_COLUMN_FILTERS: ColumnFilters = {
  engagementDate: "",
  department: "",
  doctorConsultation: "all",
  nutritionistConsultation: "all",
  doctorAndNutritionist: "all",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(p: Participant): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
}

function modalTitle(source: Source): string {
  switch (source.kind) {
    case "engagement-id":
      return `Participants — ${source.name || `Engagement #${source.engagementId}`}`;
    case "engagement-code":
      return `Participants — ${source.name || source.code}`;
    case "public":
      return "Participants — Public (B2C)";
    case "organization":
      return `Participants — ${source.orgName || `Org #${source.orgId}`}`;
    case "camp":
      return `Participants — ${source.campName || `Camp #${source.campNo}`}`;
  }
}

function formatBool(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

type ConsultationField =
  | "want_doctor_consultation"
  | "want_nutritionist_consultation"
  | "want_doctor_and_nutritionist_consultation";

const BOOL_SELECT_OPTIONS: { value: string; label: string; bool: boolean | null }[] = [
  { value: "yes", label: "Yes", bool: true },
  { value: "no", label: "No", bool: false },
  { value: "unset", label: "—", bool: null },
];

function boolToSelectValue(value: boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unset";
}

function selectValueToBool(value: string): boolean | null {
  const match = BOOL_SELECT_OPTIONS.find((opt) => opt.value === value);
  return match?.bool ?? null;
}

function normalizeBool(value: boolean | null | undefined): boolean | null {
  return value === undefined ? null : value;
}

function EditableColumnHeader({
  label,
  editable,
  isEditing,
  onToggleEdit,
  editTitle,
}: {
  label: string;
  editable: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  editTitle: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {editable && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onToggleEdit();
          }}
          className={`inline-flex items-center justify-center p-0.5 rounded hover:bg-zinc-200 ${
            isEditing ? "text-zinc-900" : "text-zinc-500"
          }`}
          title={isEditing ? `Done editing ${editTitle}` : `Edit ${editTitle}`}
          aria-label={isEditing ? `Done editing ${editTitle}` : `Edit ${editTitle}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}

function resolveDepartmentDisplay(
  slug: string | null | undefined,
  departments: OrganizationDepartment[]
): string {
  const value = (slug ?? "").trim();
  if (!value) return "—";
  const match = departments.find((d) => d.slug === value);
  return match?.department ?? value;
}

function matchesBoolFilter(value: boolean | null | undefined, filter: BoolFilter): boolean {
  if (filter === "all") return true;
  if (filter === "yes") return value === true;
  return value === false;
}

function applyColumnFilters(rows: Participant[], filters: ColumnFilters): Participant[] {
  return rows.filter((p) => {
    if (filters.engagementDate && (p.engagement_date ?? "") !== filters.engagementDate) {
      return false;
    }
    if (filters.department && (p.participant_department ?? "") !== filters.department) {
      return false;
    }
    if (!matchesBoolFilter(p.want_doctor_consultation, filters.doctorConsultation)) {
      return false;
    }
    if (!matchesBoolFilter(p.want_nutritionist_consultation, filters.nutritionistConsultation)) {
      return false;
    }
    if (
      !matchesBoolFilter(
        p.want_doctor_and_nutritionist_consultation,
        filters.doctorAndNutritionist
      )
    ) {
      return false;
    }
    return true;
  });
}

function applySearch(rows: Participant[], search: string): Participant[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (p) =>
      fullName(p).toLowerCase().includes(q) ||
      (p.phone ?? "").includes(q) ||
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.engagement_name ?? "").toLowerCase().includes(q) ||
      (p.engagement_code ?? "").toLowerCase().includes(q) ||
      (p.city ?? "").toLowerCase().includes(q)
  );
}

function toCsvCell(value: unknown): string {
  if (value == null) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  const needsQuotes =
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r");
  if (!needsQuotes) return text;
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function participantToRecord(participant: Participant): Record<string, unknown> {
  return participant as unknown as Record<string, unknown>;
}

function exportParticipantsToCsv(rows: Participant[], filenamePrefix: string) {
  if (rows.length === 0) return;

  const preferredColumns = [
    "engagement_participant_id",
    "engagement_id",
    "engagement_name",
    "engagement_code",
    "engagement_type",
    "engagement_date",
    "slot_start_time",
    "user_id",
    "first_name",
    "last_name",
    "phone",
    "gender",
    "email",
    "address",
    "pin_code",
    "city",
    "state",
    "country",
    "status",
    "participants_employee_id",
    "participant_department",
    "participant_blood_group",
    "want_doctor_consultation",
    "want_nutritionist_consultation",
    "want_doctor_and_nutritionist_consultation",
    "is_profile_created_on_metsights",
    "is_primary_record_id_synced",
    "is_fitprint_record_id_synced",
    "booked_by_user_id",
    "booking_id",
    "barcode",
  ];

  const discoveredColumns = new Set<string>();
  rows.forEach((participant) => {
    const row = participantToRecord(participant);
    Object.keys(row).forEach((key) => {
      discoveredColumns.add(key);
    });
  });

  const columns = [
    ...preferredColumns.filter((key) => discoveredColumns.has(key)),
    ...Array.from(discoveredColumns).filter((key) => !preferredColumns.includes(key)).sort(),
  ];

  const lines = [
    columns.map((key) => toCsvCell(key)).join(","),
    ...rows.map((participant) => {
      const row = participantToRecord(participant);
      return columns.map((key) => toCsvCell(row[key])).join(",");
    }),
  ];

  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute("download", `${filenamePrefix}-${datePart}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const filterSelectClass =
  "px-2 py-1.5 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-w-0 max-w-full";

// ─── Component ────────────────────────────────────────────────────────────────

export function ParticipantsModal({ open, onClose, source }: ParticipantsModalProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(DEFAULT_COLUMN_FILTERS);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Participant | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [orgDepartments, setOrgDepartments] = useState<OrganizationDepartment[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [departmentEditMode, setDepartmentEditMode] = useState(false);
  const [departmentConfirm, setDepartmentConfirm] = useState<{
    participant: Participant;
    slug: string;
    label: string;
  } | null>(null);
  const [departmentUpdateLoading, setDepartmentUpdateLoading] = useState(false);
  const [departmentUpdateError, setDepartmentUpdateError] = useState<string | null>(null);
  const [consultationEditMode, setConsultationEditMode] = useState<Set<ConsultationField>>(
    () => new Set()
  );
  const [consultationUpdateLoading, setConsultationUpdateLoading] = useState<string | null>(null);
  const [consultationUpdateError, setConsultationUpdateError] = useState<string | null>(null);

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (source.kind === "organization") {
        const res = await participantsApi.byOrganization(source.orgId);
        setParticipants(res.data.data ?? []);
      } else if (source.kind === "camp") {
        const limit = 100;
        let page = 1;
        let total = 0;
        const all: Participant[] = [];

        do {
          const res = await participantsApi.byCamp(source.campNo, { page, limit });
          const chunk = res.data.data ?? [];
          total = Number(res.data.meta?.total ?? chunk.length);
          all.push(...chunk);
          page += 1;
          if (chunk.length === 0) break;
        } while (all.length < total);

        setParticipants(all);
      } else {
        const limit = 100;
        let page = 1;
        let total = 0;
        const all: Participant[] = [];

        do {
          const res =
            source.kind === "engagement-id"
              ? await participantsApi.byEngagementId(source.engagementId, { page, limit })
              : source.kind === "engagement-code"
              ? await participantsApi.byEngagementCode(source.code, { page, limit })
              : await participantsApi.public({ page, limit });
          const chunk = res.data.data ?? [];
          total = Number(res.data.meta?.total ?? chunk.length);
          all.push(...chunk);
          page += 1;
          if (chunk.length === 0) break;
        } while (all.length < total);

        setParticipants(all);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [source]);

  const fetchOrganizationDepartments = useCallback(async () => {
    if (source.kind === "camp") {
      try {
        const orgRes = await organizationsApi.get(source.organizationId);
        setOrganizationId(source.organizationId);
        setOrgDepartments(orgRes.data.data.departments ?? []);
      } catch {
        setOrgDepartments([]);
        setOrganizationId(source.organizationId);
      }
      return;
    }

    if (source.kind !== "engagement-id") {
      setOrgDepartments([]);
      setOrganizationId(null);
      return;
    }
    try {
      const engagementRes = await engagementsApi.get(source.engagementId);
      const orgId = engagementRes.data.data.organization_id ?? null;
      setOrganizationId(orgId);
      if (orgId) {
        const orgRes = await organizationsApi.get(orgId);
        setOrgDepartments(orgRes.data.data.departments ?? []);
      } else {
        setOrgDepartments([]);
      }
    } catch {
      setOrgDepartments([]);
      setOrganizationId(null);
    }
  }, [source]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setColumnFilters(DEFAULT_COLUMN_FILTERS);
      setSelectedUserIds(new Set());
      setDeleteSelectedOpen(false);
      setDeleteError(null);
      setDeleteProgress(null);
      setDepartmentEditMode(false);
      setDepartmentConfirm(null);
      setDepartmentUpdateError(null);
      setConsultationEditMode(new Set());
      setConsultationUpdateLoading(null);
      setConsultationUpdateError(null);
      fetchParticipants();
      void fetchOrganizationDepartments();
    }
  }, [open, fetchParticipants, fetchOrganizationDepartments]);

  useEffect(() => {
    setSelectedUserIds(new Set());
  }, [search, columnFilters]);

  const hasEngagementFields = useMemo(
    () =>
      participants.some(
        (p) =>
          p.engagement_date != null ||
          p.participant_department != null ||
          p.want_doctor_consultation != null
      ),
    [participants]
  );

  const dateOptions = useMemo(() => {
    const dates = new Set<string>();
    for (const p of participants) {
      if (p.engagement_date) dates.add(p.engagement_date);
    }
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [participants]);

  const departmentOptions = useMemo(() => {
    if (orgDepartments.length > 0) {
      return orgDepartments.map((d) => ({ slug: d.slug, label: d.department }));
    }
    const deps = new Set<string>();
    for (const p of participants) {
      if (p.participant_department?.trim()) deps.add(p.participant_department.trim());
    }
    return Array.from(deps)
      .sort((a, b) => a.localeCompare(b))
      .map((slug) => ({ slug, label: slug }));
  }, [participants, orgDepartments]);

  const canEditDepartment =
    source.kind === "engagement-id" && organizationId != null && orgDepartments.length > 0;

  const canEditConsultation = source.kind === "engagement-id";

  const afterColumnFilters = useMemo(
    () => applyColumnFilters(participants, columnFilters),
    [participants, columnFilters]
  );

  const visibleRows = useMemo(
    () => applySearch(afterColumnFilters, search),
    [afterColumnFilters, search]
  );

  const selectedCount = selectedUserIds.size;

  const visibleUserIds = useMemo(
    () => visibleRows.map((p) => p.user_id).filter((id) => id != null),
    [visibleRows]
  );

  const allVisibleSelected =
    visibleUserIds.length > 0 && visibleUserIds.every((id) => selectedUserIds.has(id));

  const someVisibleSelected = visibleUserIds.some((id) => selectedUserIds.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  const selectedParticipants = useMemo(
    () => participants.filter((p) => selectedUserIds.has(p.user_id)),
    [participants, selectedUserIds]
  );

  const canDeleteRows = source.kind === "engagement-code" || source.kind === "engagement-id";
  const canNotify = source.kind === "engagement-id";

  const engagementIdForDepartment =
    source.kind === "engagement-id" ? source.engagementId : undefined;

  const handleConfirmDepartmentUpdate = async () => {
    if (!departmentConfirm || !engagementIdForDepartment) return;
    const { participant, slug } = departmentConfirm;
    if (!participant.user_id) return;

    try {
      setDepartmentUpdateLoading(true);
      setDepartmentUpdateError(null);
      await participantsApi.updateDepartment(engagementIdForDepartment, participant.user_id, slug);
      setParticipants((prev) =>
        prev.map((row) =>
          row.user_id === participant.user_id ? { ...row, participant_department: slug } : row
        )
      );
      setDepartmentConfirm(null);
    } catch (err) {
      setDepartmentUpdateError(getApiError(err));
    } finally {
      setDepartmentUpdateLoading(false);
    }
  };

  const toggleConsultationEditMode = (field: ConsultationField) => {
    setConsultationEditMode((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const handleConsultationUpdate = async (
    participant: Participant,
    field: ConsultationField,
    value: boolean | null
  ) => {
    if (!engagementIdForDepartment || !participant.user_id) return;

    const loadingKey = `${participant.user_id}:${field}`;
    try {
      setConsultationUpdateLoading(loadingKey);
      setConsultationUpdateError(null);
      await participantsApi.updateParticipant(engagementIdForDepartment, participant.user_id, {
        [field]: value,
      });
      setParticipants((prev) =>
        prev.map((row) => (row.user_id === participant.user_id ? { ...row, [field]: value } : row))
      );
    } catch (err) {
      setConsultationUpdateError(getApiError(err));
    } finally {
      setConsultationUpdateLoading(null);
    }
  };

  const renderConsultationCell = (p: Participant, field: ConsultationField) => {
    const isEditing = consultationEditMode.has(field);

    if (isEditing && canEditConsultation) {
      const loadingKey = `${p.user_id}:${field}`;
      const isLoading = consultationUpdateLoading === loadingKey;

      return (
        <select
          value={boolToSelectValue(p[field])}
          disabled={isLoading}
          onChange={(e) => {
            const nextValue = selectValueToBool(e.target.value);
            if (normalizeBool(p[field]) === nextValue) return;
            void handleConsultationUpdate(p, field, nextValue);
          }}
          className="max-w-[100px] px-2 py-1 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
        >
          {BOOL_SELECT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return formatBool(p[field]);
  };

  const engagementIdForDelete =
    source.kind === "engagement-id"
      ? source.engagementId
      : canDeleteRows && participants.length > 0
      ? participants[0].engagement_id
      : undefined;

  const engagementForNotify: Engagement | null =
    source.kind === "engagement-id"
      ? {
          engagement_id: source.engagementId,
          engagement_name: source.name ?? null,
        }
      : null;

  const hasActiveColumnFilters =
    columnFilters.engagementDate !== "" ||
    columnFilters.department !== "" ||
    columnFilters.doctorConsultation !== "all" ||
    columnFilters.nutritionistConsultation !== "all" ||
    columnFilters.doctorAndNutritionist !== "all";

  const toggleRowSelection = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        for (const id of visibleUserIds) next.delete(id);
        return next;
      });
    } else {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        for (const id of visibleUserIds) next.add(id);
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedUserIds(new Set());

  const handleExportSelected = () => {
    if (selectedParticipants.length === 0) return;
    const codePart =
      source.kind === "engagement-id"
        ? `engagement-${source.engagementId}-selected`
        : source.kind === "engagement-code"
        ? `${source.code}-selected`
        : source.kind === "camp"
        ? `camp-${source.campNo}-selected`
        : `${source.kind}-selected`;
    exportParticipantsToCsv(selectedParticipants, `participants-${codePart}`);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.engagement_id || !deleteTarget.user_id) {
      setDeleteError("Participant identifiers are missing.");
      return;
    }
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await participantsApi.removeFromEngagement(deleteTarget.engagement_id, deleteTarget.user_id);
      setDeleteTarget(null);
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.user_id);
        return next;
      });
      await fetchParticipants();
    } catch (err) {
      setDeleteError(getApiError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDeleteSelected = async () => {
    if (!engagementIdForDelete) {
      setDeleteError("Engagement id is missing.");
      return;
    }
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return;

    try {
      setDeleteLoading(true);
      setDeleteError(null);
      setDeleteProgress({ done: 0, total: ids.length });

      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < ids.length; i++) {
        const userId = ids[i];
        try {
          await participantsApi.removeFromEngagement(engagementIdForDelete, userId);
          succeeded += 1;
        } catch {
          failed += 1;
        }
        setDeleteProgress({ done: i + 1, total: ids.length });
      }

      setDeleteSelectedOpen(false);
      clearSelection();
      await fetchParticipants();

      if (failed > 0) {
        setDeleteError(
          `Deleted ${succeeded} participant${succeeded === 1 ? "" : "s"}, ${failed} failed.`
        );
      }
    } catch (err) {
      setDeleteError(getApiError(err));
    } finally {
      setDeleteLoading(false);
      setDeleteProgress(null);
    }
  };

  const emptyMessage = () => {
    if (participants.length === 0) return "No participants found.";
    if (search.trim() || hasActiveColumnFilters) {
      return "No results match your filters or search.";
    }
    return "No participants found.";
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={modalTitle(source)}
        maxWidthClassName="max-w-5xl"
      >
        {/* Search */}
        <div className="mb-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              placeholder="Search by name, phone, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {canDeleteRows && (
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteSelectedOpen(true);
                }}
                disabled={selectedCount === 0 || loading || deleteLoading || !engagementIdForDelete}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </button>
            )}
            <button
              type="button"
              onClick={handleExportSelected}
              disabled={selectedCount === 0 || loading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title={selectedCount === 0 ? "Select rows to export" : undefined}
            >
              <Download className="w-4 h-4" />
              Export selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
            {canNotify && (
              <button
                type="button"
                onClick={() => setNotifyOpen(true)}
                disabled={selectedCount === 0 || loading}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title={selectedCount === 0 ? "Select rows to send notification" : undefined}
              >
                <Bell className="w-4 h-4" />
                Send notification{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </button>
            )}
          </div>
        </div>

        {/* Column filters */}
        {hasEngagementFields && !loading && !error && participants.length > 0 && (
          <div className="mb-4 flex flex-wrap items-end gap-2 sm:gap-3">
            <div className="flex flex-col gap-0.5 min-w-[140px]">
              <label className="text-xs font-medium text-zinc-500">Engagement date</label>
              <select
                value={columnFilters.engagementDate}
                onChange={(e) =>
                  setColumnFilters((f) => ({ ...f, engagementDate: e.target.value }))
                }
                className={filterSelectClass}
              >
                <option value="">All dates</option>
                {dateOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-0.5 min-w-[140px]">
              <label className="text-xs font-medium text-zinc-500">Department</label>
              <select
                value={columnFilters.department}
                onChange={(e) =>
                  setColumnFilters((f) => ({ ...f, department: e.target.value }))
                }
                className={filterSelectClass}
              >
                <option value="">All departments</option>
                {departmentOptions.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-0.5 min-w-[120px]">
              <label className="text-xs font-medium text-zinc-500">Doctor consultation</label>
              <select
                value={columnFilters.doctorConsultation}
                onChange={(e) =>
                  setColumnFilters((f) => ({
                    ...f,
                    doctorConsultation: e.target.value as BoolFilter,
                  }))
                }
                className={filterSelectClass}
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="flex flex-col gap-0.5 min-w-[120px]">
              <label className="text-xs font-medium text-zinc-500">Nutritionist</label>
              <select
                value={columnFilters.nutritionistConsultation}
                onChange={(e) =>
                  setColumnFilters((f) => ({
                    ...f,
                    nutritionistConsultation: e.target.value as BoolFilter,
                  }))
                }
                className={filterSelectClass}
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="flex flex-col gap-0.5 min-w-[120px]">
              <label className="text-xs font-medium text-zinc-500">Doctor + Nutritionist</label>
              <select
                value={columnFilters.doctorAndNutritionist}
                onChange={(e) =>
                  setColumnFilters((f) => ({
                    ...f,
                    doctorAndNutritionist: e.target.value as BoolFilter,
                  }))
                }
                className={filterSelectClass}
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            {hasActiveColumnFilters && (
              <button
                type="button"
                onClick={() => setColumnFilters(DEFAULT_COLUMN_FILTERS)}
                className="text-xs text-zinc-600 hover:text-zinc-900 underline pb-1.5"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {selectedCount > 0 && !loading && !error && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <span>
              <span className="font-medium">{selectedCount}</span> selected
            </span>
            <span className="text-zinc-400">·</span>
            <span>
              {visibleRows.length} shown · {participants.length} total
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              <X className="w-3.5 h-3.5" />
              Clear selection
            </button>
          </div>
        )}

        {/* State: loading */}
        {loading && (
          <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm">Loading participants…</span>
          </div>
        )}

        {/* State: error */}
        {!loading && error && (
          <div className="py-6 text-center">
            <p className="text-red-600 text-sm mb-3">{error}</p>
            <button
              onClick={fetchParticipants}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
            >
              Retry
            </button>
          </div>
        )}

        {/* State: empty */}
        {!loading && !error && visibleRows.length === 0 && (
          <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
            <Users className="w-10 h-10" />
            <p className="text-sm">{emptyMessage()}</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && visibleRows.length > 0 && (
          <>
            {consultationUpdateError && (
              <p className="text-sm text-red-600 mb-3">{consultationUpdateError}</p>
            )}
            {selectedCount === 0 && (
              <p className="text-xs text-zinc-500 mb-3">
                {visibleRows.length === participants.length
                  ? `${participants.length} participant${participants.length !== 1 ? "s" : ""}`
                  : `${visibleRows.length} shown · ${participants.length} total`}
                <span className="text-zinc-400"> — select rows for bulk actions</span>
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm min-w-[1500px]">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="w-10 px-2 py-3 text-left">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        aria-label="Select all visible participants"
                        title="Select all visible"
                      />
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Name
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Phone
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Gender
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Email
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Engagement ID
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Engagement Date
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Slot Start Time
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        Department
                        {canEditDepartment && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setDepartmentEditMode((v) => !v);
                            }}
                            className={`inline-flex items-center justify-center p-0.5 rounded hover:bg-zinc-200 ${
                              departmentEditMode ? "text-zinc-900" : "text-zinc-500"
                            }`}
                            title={departmentEditMode ? "Done editing departments" : "Edit departments"}
                            aria-label={departmentEditMode ? "Done editing departments" : "Edit departments"}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Blood Group
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      <EditableColumnHeader
                        label="Doctor Consultation"
                        editable={canEditConsultation}
                        isEditing={consultationEditMode.has("want_doctor_consultation")}
                        onToggleEdit={() => toggleConsultationEditMode("want_doctor_consultation")}
                        editTitle="doctor consultation"
                      />
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      <EditableColumnHeader
                        label="Nutritionist Consultation"
                        editable={canEditConsultation}
                        isEditing={consultationEditMode.has("want_nutritionist_consultation")}
                        onToggleEdit={() => toggleConsultationEditMode("want_nutritionist_consultation")}
                        editTitle="nutritionist consultation"
                      />
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      <EditableColumnHeader
                        label="Doctor + Nutritionist"
                        editable={canEditConsultation}
                        isEditing={consultationEditMode.has(
                          "want_doctor_and_nutritionist_consultation"
                        )}
                        onToggleEdit={() =>
                          toggleConsultationEditMode("want_doctor_and_nutritionist_consultation")
                        }
                        editTitle="doctor + nutritionist consultation"
                      />
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Profile Created On Metsights
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      Primary Record Synced
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      FitPrint Record Synced
                    </th>
                    {canDeleteRows && (
                      <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((p, idx) => {
                    const checked = selectedUserIds.has(p.user_id);
                    return (
                      <tr
                        key={`${p.engagement_participant_id ?? p.user_id}-${idx}`}
                        className={`border-b border-zinc-100 last:border-0 cursor-pointer hover:bg-zinc-50 ${
                          checked ? "bg-zinc-50" : ""
                        }`}
                        onClick={() => toggleRowSelection(p.user_id)}
                      >
                        <td
                          className="w-10 px-2 py-2.5 sm:py-3"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRowSelection(p.user_id)}
                            className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                            aria-label={`Select ${fullName(p)}`}
                          />
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-800">
                          <div className="font-medium leading-tight whitespace-nowrap">
                            {fullName(p)}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {p.phone || "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {p.gender || "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {p.email || "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {p.engagement_id ?? "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {p.engagement_date || "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {p.slot_start_time || "—"}
                        </td>
                        <td
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (departmentEditMode && canEditDepartment) ev.stopPropagation();
                          }}
                        >
                          {departmentEditMode && canEditDepartment ? (
                            <select
                              key={`${p.user_id}-${p.participant_department ?? ""}`}
                              value={p.participant_department ?? ""}
                              onChange={(e) => {
                                const slug = e.target.value;
                                if (!slug || slug === (p.participant_department ?? "")) return;
                                const dept = orgDepartments.find((d) => d.slug === slug);
                                if (dept) {
                                  setDepartmentUpdateError(null);
                                  setDepartmentConfirm({
                                    participant: p,
                                    slug: dept.slug,
                                    label: dept.department,
                                  });
                                }
                              }}
                              className="max-w-[160px] px-2 py-1 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            >
                              <option value="">
                                {resolveDepartmentDisplay(p.participant_department, orgDepartments) === "—"
                                  ? "—"
                                  : resolveDepartmentDisplay(p.participant_department, orgDepartments)}
                              </option>
                              {orgDepartments.map((d) => (
                                <option key={d.slug} value={d.slug}>
                                  {d.department}
                                </option>
                              ))}
                            </select>
                          ) : (
                            resolveDepartmentDisplay(p.participant_department, orgDepartments)
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {p.participant_blood_group || "—"}
                        </td>
                        <td
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (
                              consultationEditMode.has("want_doctor_consultation") &&
                              canEditConsultation
                            ) {
                              ev.stopPropagation();
                            }
                          }}
                        >
                          {renderConsultationCell(p, "want_doctor_consultation")}
                        </td>
                        <td
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (
                              consultationEditMode.has("want_nutritionist_consultation") &&
                              canEditConsultation
                            ) {
                              ev.stopPropagation();
                            }
                          }}
                        >
                          {renderConsultationCell(p, "want_nutritionist_consultation")}
                        </td>
                        <td
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (
                              consultationEditMode.has(
                                "want_doctor_and_nutritionist_consultation"
                              ) &&
                              canEditConsultation
                            ) {
                              ev.stopPropagation();
                            }
                          }}
                        >
                          {renderConsultationCell(p, "want_doctor_and_nutritionist_consultation")}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {formatBool(p.is_profile_created_on_metsights)}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {formatBool(p.is_primary_record_id_synced)}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap">
                          {formatBool(p.is_fitprint_record_id_synced)}
                        </td>
                        {canDeleteRows && (
                          <td
                            className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(p);
                              }}
                              className="inline-flex items-center justify-center p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete participant from this engagement"
                              aria-label="Delete participant from this engagement"
                              disabled={deleteLoading}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      {canNotify && engagementForNotify && (
        <EngagementNotificationModal
          open={notifyOpen}
          onClose={() => setNotifyOpen(false)}
          engagement={engagementForNotify}
          scopedRecipients={selectedParticipants}
        />
      )}

      {canDeleteRows && deleteTarget && (
        <Modal
          open={!!deleteTarget}
          onClose={() => (deleteLoading ? undefined : setDeleteTarget(null))}
          title="Delete Participant Engagement Data"
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-sm text-red-700">
                This will permanently remove this participant from the selected engagement and delete
                linked assessments, questionnaire responses, and generated reports for this engagement
                only.
              </p>
            </div>
            <p className="text-sm text-zinc-700">
              Are you sure you want to continue for{" "}
              <span className="font-semibold">{fullName(deleteTarget)}</span>?
            </p>
            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                disabled={deleteLoading}
              >
                {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes, Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {departmentConfirm && (
        <Modal
          open={!!departmentConfirm}
          onClose={() => (departmentUpdateLoading ? undefined : setDepartmentConfirm(null))}
          title="Update Department"
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-700">
              Assign <span className="font-semibold">{fullName(departmentConfirm.participant)}</span> to{" "}
              <span className="font-semibold">{departmentConfirm.label}</span>?
            </p>
            {departmentUpdateError && (
              <p className="text-sm text-red-600">{departmentUpdateError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDepartmentConfirm(null)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
                disabled={departmentUpdateLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDepartmentUpdate()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
                disabled={departmentUpdateLoading}
              >
                {departmentUpdateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}

      {canDeleteRows && deleteSelectedOpen && (
        <Modal
          open={deleteSelectedOpen}
          onClose={() => (deleteLoading ? undefined : setDeleteSelectedOpen(false))}
          title="Delete Selected Participants"
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-sm text-red-700">
                This will permanently remove the selected participants from this engagement and delete
                their linked assessments, questionnaire responses, and generated reports for this
                engagement only. This cannot be undone.
              </p>
            </div>
            <p className="text-sm text-zinc-700">
              Are you sure you want to delete{" "}
              <span className="font-semibold">{selectedCount}</span> selected participant
              {selectedCount !== 1 ? "s" : ""}?
            </p>
            <ul className="text-sm text-zinc-600 list-disc list-inside max-h-32 overflow-y-auto">
              {selectedParticipants.slice(0, 10).map((p) => (
                <li key={p.user_id}>{fullName(p)}</li>
              ))}
              {selectedCount > 10 && (
                <li className="list-none text-zinc-500">
                  …and {selectedCount - 10} more
                </li>
              )}
            </ul>
            {deleteProgress && (
              <p className="text-xs text-zinc-500">
                Deleting… {deleteProgress.done}/{deleteProgress.total}
              </p>
            )}
            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteSelectedOpen(false)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSelected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                disabled={deleteLoading}
              >
                {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes, Delete Selected
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
