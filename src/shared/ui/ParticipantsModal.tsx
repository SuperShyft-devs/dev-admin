import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Loader2, Users, Download, Trash2, AlertTriangle, Bell, X, Pencil } from "lucide-react";
import * as XLSX from "xlsx";
import { Modal } from "./Modal";
import {
  participantsApi,
  engagementsApi,
  organizationsApi,
  expertTypesApi,
  type Participant,
  type Engagement,
  type OrganizationDepartment,
  type ExpertTypeItem,
  type ConsultationPreference,
  type PublicSlotDetail,
  type EngagementParticipantStats,
  type ParticipantListQueryParams,
  getApiError,
} from "../../lib/api";
import { EngagementNotificationModal } from "../../features/engagements/EngagementNotificationModal";
import {
  getAvailableCabins,
  getAvailableDates,
  getAvailableSlots,
  hasConfiguredBloodCollectionSchedule,
  isScheduleCombinationAvailable,
  normalizeSlotToHhmm,
} from "../../features/engagements/bloodCollectionScheduleUtils";

type ScheduleDraft = {
  engagement_date: string;
  blood_collection_cabin: string;
  slot_start_time: string;
};

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
  bookingDate: string;
  department: string;
  bookingId: BoolFilter;
  consultationFilters: Record<string, BoolFilter>;
}

const DEFAULT_COLUMN_FILTERS: ColumnFilters = {
  engagementDate: "",
  bookingDate: "",
  department: "",
  bookingId: "all",
  consultationFilters: {},
};

const PARTICIPANTS_PAGE_SIZE = 50;

function buildParticipantQueryParams(
  page: number,
  search: string,
  columnFilters: ColumnFilters
): ParticipantListQueryParams {
  const params: ParticipantListQueryParams = {
    page,
    limit: PARTICIPANTS_PAGE_SIZE,
  };
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.search = trimmedSearch;
  if (columnFilters.engagementDate) params.engagement_date = columnFilters.engagementDate;
  if (columnFilters.bookingDate) params.booking_date = columnFilters.bookingDate;
  if (columnFilters.department) params.department = columnFilters.department;
  if (columnFilters.bookingId !== "all") params.has_booking_id = columnFilters.bookingId;
  for (const [key, filter] of Object.entries(columnFilters.consultationFilters)) {
    if (filter !== "all") params[`consultation_${key}`] = filter;
  }
  return params;
}

function buildParticipantStatsParams(
  search: string,
  columnFilters: ColumnFilters
): Omit<ParticipantListQueryParams, "page" | "limit"> {
  const { page: _page, limit: _limit, ...params } = buildParticipantQueryParams(
    1,
    search,
    columnFilters
  );
  return params;
}

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

type ConsultationField = string;

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

function normalizeConsultationPref(
  value: ConsultationPreference | boolean | null | undefined
): ConsultationPreference {
  if (value == null) {
    return { want: false, date: null, cabin: null, slot: null, expert_id: null, done: false };
  }
  if (typeof value === "boolean") {
    return { want: value, date: null, cabin: null, slot: null, expert_id: null, done: false };
  }
  return {
    want: Boolean(value.want),
    date: value.date ?? null,
    cabin: value.cabin ?? null,
    slot: value.slot ?? null,
    expert_id: value.expert_id ?? null,
    done: Boolean(value.done),
  };
}

function consultationWant(value: ConsultationPreference | boolean | null | undefined): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  return Boolean(value.want);
}

function consultationFieldValue(
  participant: Participant,
  field: ConsultationField
): ConsultationPreference | boolean | null {
  const consultations = participant.consultations;
  if (consultations == null) return null;
  if (typeof consultations === "boolean") return consultations;
  return consultations[field] ?? null;
}

function participantConsultationsRecord(
  participant: Participant
): Record<string, ConsultationPreference | boolean | null> {
  const consultations = participant.consultations;
  if (consultations == null || typeof consultations === "boolean") return {};
  return consultations;
}

function enabledConsultationKeys(
  consultations: Record<string, boolean> | null | undefined
): Set<string> {
  return new Set(
    Object.entries(consultations ?? {})
      .filter(([, enabled]) => enabled === true)
      .map(([key]) => key)
  );
}

function formatConsultationCell(value: ConsultationPreference | boolean | null | undefined): string {
  const pref = normalizeConsultationPref(value);
  if (!pref.want) return "No";
  if (pref.done) {
    const when = pref.date && pref.slot ? ` · ${pref.date} ${pref.slot}` : "";
    return `Done${when}`;
  }
  if (pref.expert_id != null) {
    const when = pref.date && pref.slot ? ` · ${pref.date} ${pref.slot}` : "";
    return `Assigned (#${pref.expert_id})${when}`;
  }
  if (pref.date && pref.slot) return `Slot held · ${pref.date} ${pref.slot}`;
  return "Requested";
}

function isParticipantBooked(p: Participant): boolean {
  return Boolean(p.booking_id?.trim());
}

function isBloodTestComplete(p: Participant): boolean {
  return p.blood_test_complete === true;
}

const BLOOD_TEST_TOOLTIP_NAME_LIMIT = 80;

function BloodTestCompleteCount({
  complete,
  total,
  notReadyParticipants,
  notReadyNames,
}: {
  complete: number;
  total: number;
  notReadyParticipants?: Participant[];
  notReadyNames?: string[];
}) {
  const resolvedNames =
    notReadyNames ?? notReadyParticipants?.map((participant) => fullName(participant)) ?? [];
  const shownNames = resolvedNames.slice(0, BLOOD_TEST_TOOLTIP_NAME_LIMIT);
  const remainingCount = resolvedNames.length - shownNames.length;

  return (
    <span className="inline-flex items-baseline">
      <span className="relative group inline-flex">
        <span className="font-medium text-zinc-700 underline decoration-dotted decoration-zinc-400 cursor-help">
          {complete}
        </span>
        {resolvedNames.length > 0 && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2 text-left text-xs font-normal text-zinc-700 shadow-lg group-hover:block"
          >
            <span className="mb-1 block font-medium text-zinc-500">Not ready</span>
            {shownNames.map((name, index) => (
              <span key={`${name}-${index}`} className="block truncate">
                {name}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className="block text-zinc-500">+{remainingCount} more</span>
            )}
          </span>
        )}
      </span>
      <span>
        {" / "}
        {total} complete blood test
      </span>
    </span>
  );
}

function applyColumnFilters(
  rows: Participant[],
  filters: ColumnFilters,
  bookingDateUserIds: Set<number> | null
): Participant[] {
  return rows.filter((p) => {
    if (filters.bookingDate) {
      if (!bookingDateUserIds?.has(p.user_id)) {
        return false;
      }
    }
    if (filters.engagementDate && (p.engagement_date ?? "") !== filters.engagementDate) {
      return false;
    }
    if (filters.department && (p.participant_department ?? "") !== filters.department) {
      return false;
    }
    if (filters.bookingId !== "all") {
      const booked = isParticipantBooked(p);
      if (!matchesBoolFilter(booked, filters.bookingId)) return false;
    }
    for (const [key, filter] of Object.entries(filters.consultationFilters)) {
      if (filter !== "all") {
        const val = consultationWant(consultationFieldValue(p, key));
        if (!matchesBoolFilter(val, filter)) return false;
      }
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
      (p.city ?? "").toLowerCase().includes(q) ||
      (p.booking_id ?? "").toLowerCase().includes(q)
  );
}

type ExportFormat = "csv" | "excel";

function cellToText(value: unknown): string {
  if (value == null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function toCsvCell(value: unknown): string {
  const text = cellToText(value);
  const needsQuotes =
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r");
  if (!needsQuotes) return text;
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function consultationWantToYesNo(
  participant: Participant,
  field: ConsultationField
): string {
  return consultationWant(consultationFieldValue(participant, field)) === true ? "Yes" : "No";
}

type ExportColumn = {
  header: string;
  value: (participant: Participant) => unknown;
};

const EXPORT_CONSULTATION_COLUMNS: Array<{
  key: ConsultationField;
  header: string;
}> = [
  { key: "doctor", header: "Doctor Consultation" },
  { key: "nutritionist", header: "Nutritionist Consultation" },
  { key: "eye", header: "Eye Consultation" },
];

const ALL_EXPORT_CONSULTATION_KEYS = new Set(
  EXPORT_CONSULTATION_COLUMNS.map((column) => column.key)
);

function buildExportColumns(options: {
  offeredKeys: Set<string> | null;
  withAddress: boolean;
}): ExportColumn[] {
  const columns: ExportColumn[] = [
    { header: "blood_test_date", value: (p) => p.engagement_date },
    { header: "slot_start_time", value: (p) => p.slot_start_time },
    { header: "blood_collection_cabin", value: (p) => p.blood_collection_cabin },
    { header: "first_name", value: (p) => p.first_name },
    { header: "last_name", value: (p) => p.last_name },
    { header: "phone", value: (p) => p.phone },
    { header: "email", value: (p) => p.email },
    { header: "participants_employee_id", value: (p) => p.participants_employee_id },
  ];

  if (options.withAddress) {
    columns.push(
      { header: "address", value: (p) => p.address },
      { header: "pin_code", value: (p) => p.pin_code },
      { header: "city", value: (p) => p.city },
      { header: "state", value: (p) => p.state },
      { header: "country", value: (p) => p.country }
    );
  }

  columns.push(
    { header: "participant_department", value: (p) => p.participant_department },
    { header: "participant_blood_group", value: (p) => p.participant_blood_group }
  );

  const consultationKeys = options.offeredKeys ?? ALL_EXPORT_CONSULTATION_KEYS;
  for (const column of EXPORT_CONSULTATION_COLUMNS) {
    if (consultationKeys.has(column.key)) {
      columns.push({
        header: column.header,
        value: (p) => consultationWantToYesNo(p, column.key),
      });
    }
  }

  columns.push({ header: "age", value: (p) => p.age });
  return columns;
}

function buildExportTable(
  rows: Participant[],
  exportColumns: ExportColumn[]
): { columns: string[]; matrix: string[][] } {
  const columns = exportColumns.map((column) => column.header);
  const matrix = rows.map((participant) =>
    exportColumns.map((column) => cellToText(column.value(participant)))
  );
  return { columns, matrix };
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportFilename(filenamePrefix: string, extension: "csv" | "xlsx"): string {
  const datePart = new Date().toISOString().slice(0, 10);
  return `${filenamePrefix}-${datePart}.${extension}`;
}

function exportParticipantsToCsv(
  rows: Participant[],
  filenamePrefix: string,
  exportColumns: ExportColumn[]
) {
  if (rows.length === 0) return;

  const { columns, matrix } = buildExportTable(rows, exportColumns);
  const lines = [
    columns.map((key) => toCsvCell(key)).join(","),
    ...matrix.map((cells) => cells.map((cell) => toCsvCell(cell)).join(",")),
  ];

  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, exportFilename(filenamePrefix, "csv"));
}

function exportParticipantsToExcel(
  rows: Participant[],
  filenamePrefix: string,
  exportColumns: ExportColumn[]
) {
  if (rows.length === 0) return;

  const { columns, matrix } = buildExportTable(rows, exportColumns);
  const sheetData = [columns, ...matrix];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Participants");

  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerBlobDownload(blob, exportFilename(filenamePrefix, "xlsx"));
}

const filterSelectClass =
  "px-2 py-1.5 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-w-0 max-w-full";

// ─── Component ────────────────────────────────────────────────────────────────

export function ParticipantsModal({ open, onClose, source }: ParticipantsModalProps) {
  const useServerPagination = source.kind === "engagement-id";
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [participantStats, setParticipantStats] = useState<EngagementParticipantStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(DEFAULT_COLUMN_FILTERS);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [exportFormatOpen, setExportFormatOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [exportWithAddress, setExportWithAddress] = useState(false);
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
  const [expertTypes, setExpertTypes] = useState<ExpertTypeItem[]>([]);
  const [consultationUpdateLoading, setConsultationUpdateLoading] = useState<string | null>(null);
  const [consultationUpdateError, setConsultationUpdateError] = useState<string | null>(null);
  const [bookingIdEditMode, setBookingIdEditMode] = useState(false);
  const [bookingIdUpdateLoading, setBookingIdUpdateLoading] = useState<number | null>(null);
  const [bookingIdUpdateError, setBookingIdUpdateError] = useState<string | null>(null);
  const [engagementDateEditMode, setEngagementDateEditMode] = useState(false);
  const [slotStartTimeEditMode, setSlotStartTimeEditMode] = useState(false);
  const [bloodCollectionCabinEditMode, setBloodCollectionCabinEditMode] = useState(false);
  const [scheduleUpdateLoading, setScheduleUpdateLoading] = useState<number | null>(null);
  const [scheduleUpdateError, setScheduleUpdateError] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, ScheduleDraft>>({});
  const [engagementPublicSlotDetail, setEngagementPublicSlotDetail] = useState<PublicSlotDetail | null>(
    null
  );
  const [engagementBloodCollectionType, setEngagementBloodCollectionType] = useState<string | null>(null);
  const [engagementConsultations, setEngagementConsultations] = useState<Record<string, boolean> | null>(
    null
  );
  const [consultationConfigLoaded, setConsultationConfigLoaded] = useState(false);
  const [bookingDateOptions, setBookingDateOptions] = useState<string[]>([]);
  const [bookingDateUserIdsByDate, setBookingDateUserIdsByDate] = useState<Record<string, number[]>>(
    {}
  );
  const [bookingDatesLoading, setBookingDatesLoading] = useState(false);
  const [engagementDateOptions, setEngagementDateOptions] = useState<string[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const buildListParams = useCallback(
    () => buildParticipantQueryParams(page, debouncedSearch, columnFilters),
    [page, debouncedSearch, columnFilters]
  );

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (source.kind === "organization") {
        const res = await participantsApi.byOrganization(source.orgId, {
          page,
          limit: PARTICIPANTS_PAGE_SIZE,
        });
        const chunk = res.data.data ?? [];
        setParticipants(chunk);
        setTotal(Number(res.data.meta?.total ?? chunk.length));
      } else if (source.kind === "camp") {
        const res = await participantsApi.byCamp(source.campNo, {
          page,
          limit: PARTICIPANTS_PAGE_SIZE,
        });
        const chunk = res.data.data ?? [];
        setParticipants(chunk);
        setTotal(Number(res.data.meta?.total ?? chunk.length));
      } else if (source.kind === "engagement-id") {
        const res = await participantsApi.byEngagementId(
          source.engagementId,
          buildListParams()
        );
        const chunk = res.data.data ?? [];
        setParticipants(chunk);
        setTotal(Number(res.data.meta?.total ?? chunk.length));
      } else {
        const res =
          source.kind === "engagement-code"
            ? await participantsApi.byEngagementCode(source.code, {
                page,
                limit: PARTICIPANTS_PAGE_SIZE,
              })
            : await participantsApi.public({ page, limit: PARTICIPANTS_PAGE_SIZE });
        const chunk = res.data.data ?? [];
        setParticipants(chunk);
        setTotal(Number(res.data.meta?.total ?? chunk.length));
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [source, page, buildListParams]);

  const fetchParticipantStats = useCallback(async () => {
    if (source.kind !== "engagement-id") {
      setParticipantStats(null);
      return;
    }

    setStatsLoading(true);
    try {
      const res = await participantsApi.stats(
        source.engagementId,
        buildParticipantStatsParams(debouncedSearch, columnFilters)
      );
      setParticipantStats(res.data.data);
    } catch {
      setParticipantStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [source, debouncedSearch, columnFilters]);

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
      setEngagementConsultations(null);
      setEngagementPublicSlotDetail(null);
      setEngagementBloodCollectionType(null);
      setConsultationConfigLoaded(true);
      return;
    }
    try {
      const engagementRes = await engagementsApi.get(source.engagementId);
      const orgId = engagementRes.data.data.organization_id ?? null;
      setEngagementConsultations(engagementRes.data.data.consultations ?? null);
      setEngagementPublicSlotDetail(engagementRes.data.data.public_slot_detail ?? null);
      setEngagementBloodCollectionType(engagementRes.data.data.blood_collection_type ?? null);
      setConsultationConfigLoaded(true);
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
      setEngagementConsultations(null);
      setEngagementPublicSlotDetail(null);
      setEngagementBloodCollectionType(null);
      setConsultationConfigLoaded(true);
    }
  }, [source]);

  const fetchBookingDates = useCallback(async () => {
    if (source.kind !== "engagement-id") {
      setBookingDateOptions([]);
      setBookingDateUserIdsByDate({});
      setEngagementDateOptions([]);
      return;
    }

    setBookingDatesLoading(true);
    try {
      const [bookingDatesRes, filterOptionsRes] = await Promise.all([
        participantsApi.bookingDates(source.engagementId),
        participantsApi.filterOptions(source.engagementId),
      ]);
      const data = bookingDatesRes.data.data;
      setBookingDateOptions(data.dates ?? []);
      setBookingDateUserIdsByDate(data.user_ids_by_date ?? {});
      setEngagementDateOptions(filterOptionsRes.data.data.engagement_dates ?? []);
    } catch {
      setBookingDateOptions([]);
      setBookingDateUserIdsByDate({});
      setEngagementDateOptions([]);
    } finally {
      setBookingDatesLoading(false);
    }
  }, [source]);

  useEffect(() => {
    expertTypesApi.list().then((res) => setExpertTypes(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [debouncedSearch, columnFilters]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
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
      setBookingIdEditMode(false);
      setBookingIdUpdateLoading(null);
      setBookingIdUpdateError(null);
      setEngagementDateEditMode(false);
      setSlotStartTimeEditMode(false);
      setBloodCollectionCabinEditMode(false);
      setScheduleUpdateLoading(null);
      setScheduleUpdateError(null);
      setScheduleDrafts({});
      setEngagementPublicSlotDetail(null);
      setEngagementBloodCollectionType(null);
      setEngagementConsultations(null);
      setConsultationConfigLoaded(source.kind !== "engagement-id");
      setBookingDateOptions([]);
      setBookingDateUserIdsByDate({});
      setEngagementDateOptions([]);
      setParticipantStats(null);
      setPage(1);
      setTotal(0);
      void fetchOrganizationDepartments();
      void fetchBookingDates();
    }
  }, [open, fetchOrganizationDepartments, fetchBookingDates, source]);

  useEffect(() => {
    if (!open) return;
    void fetchParticipants();
  }, [open, fetchParticipants]);

  useEffect(() => {
    if (!open) return;
    void fetchParticipantStats();
  }, [open, fetchParticipantStats]);

  useEffect(() => {
    setSelectedUserIds(new Set());
  }, [search, columnFilters, page]);

  const hasEngagementFields = useMemo(
    () =>
      participants.some(
        (p) =>
          p.engagement_date != null ||
          p.participant_department != null ||
          p.consultations != null
      ),
    [participants]
  );

  const dateOptions = useMemo(() => {
    if (useServerPagination) return engagementDateOptions;
    const dates = new Set<string>();
    for (const p of participants) {
      if (p.engagement_date) dates.add(p.engagement_date);
    }
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [useServerPagination, engagementDateOptions, participants]);

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
  const canEditBookingId = source.kind === "engagement-id";
  const canEditSchedule =
    source.kind === "engagement-id" &&
    engagementBloodCollectionType !== "home_collection" &&
    hasConfiguredBloodCollectionSchedule(engagementPublicSlotDetail);
  const visibleExpertTypes = useMemo(() => {
    if (source.kind !== "engagement-id" || !consultationConfigLoaded) return expertTypes;
    const enabledKeys = enabledConsultationKeys(engagementConsultations);
    return expertTypes.filter((et) => enabledKeys.has(et.type_key));
  }, [consultationConfigLoaded, engagementConsultations, expertTypes, source.kind]);

  const bookingDateUserIds = useMemo(() => {
    if (!columnFilters.bookingDate) return null;
    return new Set(bookingDateUserIdsByDate[columnFilters.bookingDate] ?? []);
  }, [columnFilters.bookingDate, bookingDateUserIdsByDate]);

  const afterColumnFilters = useMemo(() => {
    if (useServerPagination) return participants;
    return applyColumnFilters(participants, columnFilters, bookingDateUserIds);
  }, [useServerPagination, participants, columnFilters, bookingDateUserIds]);

  const visibleRows = useMemo(() => {
    if (useServerPagination) return afterColumnFilters;
    return applySearch(afterColumnFilters, search);
  }, [useServerPagination, afterColumnFilters, search]);

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
      const prev = normalizeConsultationPref(consultationFieldValue(participant, field));
      const nextPref: ConsultationPreference = {
        ...prev,
        want: value === true,
        done: value === true ? Boolean(prev.done) : false,
        ...(value !== true ? { date: null, cabin: null, slot: null, expert_id: null, done: false } : {}),
      };
      const updatedConsultations = {
        ...participantConsultationsRecord(participant),
        [field]: nextPref,
      };
      await participantsApi.updateParticipant(engagementIdForDepartment, participant.user_id, {
        consultations: updatedConsultations,
      });
      setParticipants((prevRows) =>
        prevRows.map((row) =>
          row.user_id === participant.user_id
            ? { ...row, consultations: updatedConsultations }
            : row
        )
      );
    } catch (err) {
      setConsultationUpdateError(getApiError(err));
    } finally {
      setConsultationUpdateLoading(null);
    }
  };

  const handleBookingIdUpdate = async (participant: Participant, nextValue: string) => {
    if (!engagementIdForDepartment || !participant.user_id) return;

    const normalized = nextValue.trim() || null;
    const current = (participant.booking_id ?? "").trim() || null;
    if (normalized === current) return;

    try {
      setBookingIdUpdateLoading(participant.user_id);
      setBookingIdUpdateError(null);
      const res = await participantsApi.updateParticipant(
        engagementIdForDepartment,
        participant.user_id,
        { booking_id: normalized }
      );
      const saved = res.data.data.booking_id ?? normalized;
      setParticipants((prevRows) =>
        prevRows.map((row) =>
          row.user_id === participant.user_id ? { ...row, booking_id: saved } : row
        )
      );
    } catch (err) {
      setBookingIdUpdateError(getApiError(err));
    } finally {
      setBookingIdUpdateLoading(null);
    }
  };

  const refreshEngagementSlotDetail = useCallback(async () => {
    if (source.kind !== "engagement-id") return;
    try {
      const engagementRes = await engagementsApi.get(source.engagementId);
      setEngagementPublicSlotDetail(engagementRes.data.data.public_slot_detail ?? null);
      setEngagementBloodCollectionType(engagementRes.data.data.blood_collection_type ?? null);
    } catch {
      // ignore refresh errors
    }
  }, [source]);

  const clearScheduleDraft = (userId: number) => {
    setScheduleDrafts((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handleScheduleUpdate = async (
    participant: Participant,
    updates: {
      engagement_date: string;
      slot_start_time: string;
      blood_collection_cabin: string;
    }
  ) => {
    if (!engagementIdForDepartment || !participant.user_id) return;

    const nextDate = updates.engagement_date;
    const nextCabin = updates.blood_collection_cabin;
    const nextSlot = normalizeSlotToHhmm(updates.slot_start_time);

    if (!nextDate || !nextSlot || !nextCabin) return;

    const currentDate = participant.engagement_date ?? "";
    const currentSlot = normalizeSlotToHhmm(participant.slot_start_time ?? "");
    const currentCabin = participant.blood_collection_cabin ?? "";

    if (
      nextDate === currentDate &&
      nextSlot === currentSlot &&
      nextCabin === currentCabin
    ) {
      clearScheduleDraft(participant.user_id);
      return;
    }

    try {
      setScheduleUpdateLoading(participant.user_id);
      setScheduleUpdateError(null);
      const res = await participantsApi.updateParticipant(
        engagementIdForDepartment,
        participant.user_id,
        {
          engagement_date: nextDate,
          slot_start_time: nextSlot,
          blood_collection_cabin: nextCabin,
        }
      );
      const data = res.data.data;
      setParticipants((prevRows) =>
        prevRows.map((row) =>
          row.user_id === participant.user_id
            ? {
                ...row,
                engagement_date: data.engagement_date ?? nextDate,
                slot_start_time: data.slot_start_time ?? nextSlot,
                blood_collection_cabin: data.blood_collection_cabin ?? nextCabin,
              }
            : row
        )
      );
      clearScheduleDraft(participant.user_id);
      await refreshEngagementSlotDetail();
    } catch (err) {
      setScheduleUpdateError(getApiError(err));
    } finally {
      setScheduleUpdateLoading(null);
    }
  };

  const beginScheduleDraft = (participant: Participant, draft: ScheduleDraft) => {
    if (!participant.user_id) return;
    setScheduleDrafts((prev) => ({
      ...prev,
      [participant.user_id]: draft,
    }));
    setScheduleUpdateError(null);
  };

  const handleDateChange = (participant: Participant, nextDate: string) => {
    if (!nextDate) return;

    const draft = participant.user_id ? scheduleDrafts[participant.user_id] : undefined;
    const baselineDate = draft?.engagement_date ?? participant.engagement_date ?? "";
    if (nextDate === baselineDate && !draft) return;

    if (draft) {
      beginScheduleDraft(participant, {
        engagement_date: nextDate,
        blood_collection_cabin: "",
        slot_start_time: "",
      });
      return;
    }

    const currentCabin = participant.blood_collection_cabin ?? "";
    const currentSlot = normalizeSlotToHhmm(participant.slot_start_time ?? "");

    if (
      currentCabin &&
      currentSlot &&
      isScheduleCombinationAvailable(
        engagementPublicSlotDetail,
        nextDate,
        currentCabin,
        currentSlot
      )
    ) {
      void handleScheduleUpdate(participant, {
        engagement_date: nextDate,
        blood_collection_cabin: currentCabin,
        slot_start_time: currentSlot,
      });
      return;
    }

    beginScheduleDraft(participant, {
      engagement_date: nextDate,
      blood_collection_cabin: "",
      slot_start_time: "",
    });
  };

  const handleCabinChange = (participant: Participant, nextCabin: string) => {
    if (!nextCabin) return;

    const draft = participant.user_id ? scheduleDrafts[participant.user_id] : undefined;
    if (!draft && nextCabin === (participant.blood_collection_cabin ?? "")) return;

    const date = draft?.engagement_date ?? participant.engagement_date ?? "";
    const currentSlot = normalizeSlotToHhmm(
      draft?.slot_start_time || participant.slot_start_time || ""
    );

    if (
      !draft &&
      currentSlot &&
      isScheduleCombinationAvailable(engagementPublicSlotDetail, date, nextCabin, currentSlot)
    ) {
      void handleScheduleUpdate(participant, {
        engagement_date: date,
        blood_collection_cabin: nextCabin,
        slot_start_time: currentSlot,
      });
      return;
    }

    beginScheduleDraft(participant, {
      engagement_date: date,
      blood_collection_cabin: nextCabin,
      slot_start_time: "",
    });
  };

  const handleSlotChange = (participant: Participant, nextSlot: string) => {
    if (!nextSlot) return;

    const draft = participant.user_id ? scheduleDrafts[participant.user_id] : undefined;
    if (
      !draft &&
      normalizeSlotToHhmm(nextSlot) === normalizeSlotToHhmm(participant.slot_start_time ?? "")
    ) {
      return;
    }

    const date = draft?.engagement_date ?? participant.engagement_date ?? "";
    const cabin = draft?.blood_collection_cabin ?? participant.blood_collection_cabin ?? "";

    if (!date || !cabin) return;

    void handleScheduleUpdate(participant, {
      engagement_date: date,
      blood_collection_cabin: cabin,
      slot_start_time: nextSlot,
    });
  };

  const renderConsultationCell = (p: Participant, field: ConsultationField) => {
    const isEditing = consultationEditMode.has(field);
    const cellValue = consultationFieldValue(p, field);
    const want = consultationWant(cellValue);

    if (isEditing && canEditConsultation) {
      const loadingKey = `${p.user_id}:${field}`;
      const isLoading = consultationUpdateLoading === loadingKey;

      return (
        <select
          value={boolToSelectValue(want)}
          disabled={isLoading}
          onChange={(e) => {
            const nextValue = selectValueToBool(e.target.value);
            if (normalizeBool(want) === nextValue) return;
            void handleConsultationUpdate(p, field, nextValue);
          }}
          className="max-w-[140px] px-2 py-1 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
        >
          {BOOL_SELECT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <span className="text-sm text-zinc-700 whitespace-nowrap" title={formatConsultationCell(cellValue)}>
        {formatConsultationCell(cellValue)}
      </span>
    );
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
    columnFilters.bookingDate !== "" ||
    columnFilters.department !== "" ||
    columnFilters.bookingId !== "all" ||
    Object.values(columnFilters.consultationFilters).some((f) => f !== "all");
  const hasParticipantViewFilter = useServerPagination
    ? hasActiveColumnFilters || debouncedSearch.trim() !== ""
    : search.trim() !== "" || hasActiveColumnFilters;

  const bloodTestCompleteInView = useServerPagination && participantStats
    ? participantStats.filtered_blood_test_complete
    : visibleRows.filter(isBloodTestComplete).length;
  const bloodTestFilteredTotal = useServerPagination && participantStats
    ? participantStats.filtered_total
    : hasParticipantViewFilter
    ? visibleRows.length
    : participants.length;
  const bloodTestCompleteTotal = useServerPagination && participantStats
    ? participantStats.overall_blood_test_complete
    : participants.filter(isBloodTestComplete).length;
  const bloodTestOverallTotal = useServerPagination && participantStats
    ? participantStats.overall_total
    : participants.length;
  const bloodTestNotReadyInView = useMemo(
    () => visibleRows.filter((p) => !isBloodTestComplete(p)),
    [visibleRows]
  );
  const bloodTestNotReadyTotal = useMemo(
    () => participants.filter((p) => !isBloodTestComplete(p)),
    [participants]
  );
  const bloodTestNotReadyNames = useServerPagination && participantStats
    ? participantStats.not_ready_names
    : undefined;

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
    setExportFormat("csv");
    setExportWithAddress(false);
    setExportFormatOpen(true);
  };

  const handleConfirmExport = () => {
    if (selectedParticipants.length === 0) return;
    const codePart =
      source.kind === "engagement-id"
        ? `engagement-${source.engagementId}-selected`
        : source.kind === "engagement-code"
        ? `${source.code}-selected`
        : source.kind === "camp"
        ? `camp-${source.campNo}-selected`
        : `${source.kind}-selected`;
    const filenamePrefix = `participants-${codePart}`;
    const offeredKeys =
      source.kind === "engagement-id"
        ? enabledConsultationKeys(engagementConsultations)
        : null;
    const exportColumns = buildExportColumns({
      offeredKeys,
      withAddress: exportWithAddress,
    });
    if (exportFormat === "excel") {
      exportParticipantsToExcel(selectedParticipants, filenamePrefix, exportColumns);
    } else {
      exportParticipantsToCsv(selectedParticipants, filenamePrefix, exportColumns);
    }
    setExportFormatOpen(false);
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
      await fetchParticipantStats();
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
      await fetchParticipantStats();

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
    if ((useServerPagination ? total : participants.length) === 0) return "No participants found.";
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
        {!loading && !error && participants.length > 0 && (
          <div className="mb-4 flex flex-wrap items-end gap-2 sm:gap-3">
            <div className="flex flex-col gap-0.5 min-w-[140px]">
              <label className="text-xs font-medium text-zinc-500">Booking ID</label>
              <select
                value={columnFilters.bookingId}
                onChange={(e) =>
                  setColumnFilters((f) => ({ ...f, bookingId: e.target.value as BoolFilter }))
                }
                className={filterSelectClass}
              >
                <option value="all">All</option>
                <option value="yes">With booking ID</option>
                <option value="no">Without booking ID</option>
              </select>
            </div>
            {source.kind === "engagement-id" && (
              <div className="flex flex-col gap-0.5 min-w-[140px]">
                <label className="text-xs font-medium text-zinc-500">Booking date</label>
                <select
                  value={columnFilters.bookingDate}
                  onChange={(e) =>
                    setColumnFilters((f) => ({ ...f, bookingDate: e.target.value }))
                  }
                  className={filterSelectClass}
                  disabled={bookingDatesLoading}
                >
                  <option value="">All dates</option>
                  {bookingDateOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {hasEngagementFields && (
              <>
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
            {visibleExpertTypes.map((et) => (
              <div key={et.type_key} className="flex flex-col gap-0.5 min-w-[120px]">
                <label className="text-xs font-medium text-zinc-500">
                  {et.type} consultation
                </label>
                <select
                  value={columnFilters.consultationFilters[et.type_key] ?? "all"}
                  onChange={(e) =>
                    setColumnFilters((f) => ({
                      ...f,
                      consultationFilters: {
                        ...f.consultationFilters,
                        [et.type_key]: e.target.value as BoolFilter,
                      },
                    }))
                  }
                  className={filterSelectClass}
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            ))}
              </>
            )}
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
              {visibleRows.length} shown · {useServerPagination ? total : participants.length} total
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
            {bookingIdUpdateError && (
              <p className="text-sm text-red-600 mb-3">{bookingIdUpdateError}</p>
            )}
            {scheduleUpdateError && (
              <p className="text-sm text-red-600 mb-3">{scheduleUpdateError}</p>
            )}
            {Object.keys(scheduleDrafts).length > 0 && (
              <p className="text-sm text-amber-700 mb-3">
                Date changed — select a cabin and slot to complete the update.
              </p>
            )}
            {selectedCount === 0 && (
              <p className="text-xs text-zinc-500 mb-3">
                {useServerPagination
                  ? `${visibleRows.length} shown · ${total} total`
                  : visibleRows.length === participants.length
                  ? `${participants.length} participant${participants.length !== 1 ? "s" : ""}`
                  : `${visibleRows.length} shown · ${participants.length} total`}
                {" · "}
                {statsLoading && useServerPagination ? (
                  <span className="text-zinc-400">checking blood tests…</span>
                ) : (
                  <BloodTestCompleteCount
                    complete={bloodTestCompleteInView}
                    total={bloodTestFilteredTotal}
                    notReadyParticipants={bloodTestNotReadyInView}
                    notReadyNames={bloodTestNotReadyNames}
                  />
                )}
                {hasParticipantViewFilter && !statsLoading && (
                  <>
                    {" · "}
                    <BloodTestCompleteCount
                      complete={bloodTestCompleteTotal}
                      total={bloodTestOverallTotal}
                      notReadyParticipants={bloodTestNotReadyTotal}
                    />
                    <span className="text-zinc-500"> overall</span>
                  </>
                )}
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
                      <EditableColumnHeader
                        label="Booking Id"
                        editable={canEditBookingId}
                        isEditing={bookingIdEditMode}
                        onToggleEdit={() => setBookingIdEditMode((v) => !v)}
                        editTitle="booking id"
                      />
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      <EditableColumnHeader
                        label="Engagement Date"
                        editable={canEditSchedule}
                        isEditing={engagementDateEditMode}
                        onToggleEdit={() => setEngagementDateEditMode((v) => !v)}
                        editTitle="engagement date"
                      />
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      <EditableColumnHeader
                        label="Slot Start Time"
                        editable={canEditSchedule}
                        isEditing={slotStartTimeEditMode}
                        onToggleEdit={() => setSlotStartTimeEditMode((v) => !v)}
                        editTitle="slot start time"
                      />
                    </th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      <EditableColumnHeader
                        label="Blood Collection Cabin"
                        editable={canEditSchedule}
                        isEditing={bloodCollectionCabinEditMode}
                        onToggleEdit={() => setBloodCollectionCabinEditMode((v) => !v)}
                        editTitle="blood collection cabin"
                      />
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
                    {visibleExpertTypes.map((et) => (
                    <th key={et.type_key} className="px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">
                      <EditableColumnHeader
                        label={`${et.type} Consultation`}
                        editable={canEditConsultation}
                        isEditing={consultationEditMode.has(et.type_key)}
                        onToggleEdit={() => toggleConsultationEditMode(et.type_key)}
                        editTitle={`${et.type.toLowerCase()} consultation`}
                      />
                    </th>
                    ))}
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
                    const scheduleDraft = scheduleDrafts[p.user_id];
                    const draftDate = scheduleDraft?.engagement_date ?? p.engagement_date ?? "";
                    const draftCabin = scheduleDraft
                      ? scheduleDraft.blood_collection_cabin
                      : p.blood_collection_cabin ?? "";
                    const draftSlot = scheduleDraft
                      ? scheduleDraft.slot_start_time
                      : normalizeSlotToHhmm(p.slot_start_time);
                    const showDateEditor =
                      (engagementDateEditMode && canEditSchedule) || Boolean(scheduleDraft);
                    const showCabinEditor =
                      (bloodCollectionCabinEditMode && canEditSchedule) || Boolean(scheduleDraft);
                    const showSlotEditor =
                      (slotStartTimeEditMode && canEditSchedule) ||
                      Boolean(scheduleDraft?.blood_collection_cabin);
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
                        <td
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (bookingIdEditMode && canEditBookingId) ev.stopPropagation();
                          }}
                        >
                          {bookingIdEditMode && canEditBookingId ? (
                            <input
                              key={`${p.user_id}-${p.booking_id ?? ""}`}
                              type="text"
                              defaultValue={p.booking_id ?? ""}
                              disabled={bookingIdUpdateLoading === p.user_id}
                              placeholder="—"
                              onBlur={(e) => {
                                void handleBookingIdUpdate(p, e.target.value);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="max-w-[160px] px-2 py-1 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
                              aria-label={`Booking Id for ${fullName(p)}`}
                            />
                          ) : (
                            p.booking_id || "—"
                          )}
                        </td>
                        <td
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (showDateEditor && canEditSchedule) ev.stopPropagation();
                          }}
                        >
                          {showDateEditor && canEditSchedule ? (
                            <select
                              value={draftDate}
                              disabled={scheduleUpdateLoading === p.user_id}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (!next) return;
                                handleDateChange(p, next);
                              }}
                              className="max-w-[160px] px-2 py-1 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
                              aria-label={`Engagement date for ${fullName(p)}`}
                            >
                              <option value="">—</option>
                              {getAvailableDates(engagementPublicSlotDetail, draftDate || p.engagement_date).map(
                                (dateOption) => (
                                  <option key={dateOption} value={dateOption}>
                                    {dateOption}
                                  </option>
                                )
                              )}
                            </select>
                          ) : (
                            p.engagement_date || "—"
                          )}
                        </td>
                        <td
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (showSlotEditor && canEditSchedule) ev.stopPropagation();
                          }}
                        >
                          {showSlotEditor && canEditSchedule ? (
                            <select
                              value={draftSlot}
                              disabled={
                                scheduleUpdateLoading === p.user_id ||
                                !draftDate ||
                                !draftCabin
                              }
                              onChange={(e) => {
                                const next = e.target.value;
                                if (!next) return;
                                handleSlotChange(p, next);
                              }}
                              className="max-w-[160px] px-2 py-1 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
                              aria-label={`Slot start time for ${fullName(p)}`}
                            >
                              <option value="">
                                {scheduleDraft && !scheduleDraft.blood_collection_cabin
                                  ? "Select cabin first"
                                  : "—"}
                              </option>
                              {getAvailableSlots(
                                engagementPublicSlotDetail,
                                draftDate,
                                draftCabin,
                                draftSlot || p.slot_start_time
                              ).map((slotOption) => (
                                <option key={slotOption.slot} value={normalizeSlotToHhmm(slotOption.slot)}>
                                  {slotOption.slot}
                                </option>
                              ))}
                            </select>
                          ) : scheduleDraft && !scheduleDraft.blood_collection_cabin ? (
                            <span className="text-xs text-amber-700">Select cabin</span>
                          ) : (
                            p.slot_start_time || "—"
                          )}
                        </td>
                        <td
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (showCabinEditor && canEditSchedule) ev.stopPropagation();
                          }}
                        >
                          {showCabinEditor && canEditSchedule ? (
                            <select
                              value={draftCabin}
                              disabled={scheduleUpdateLoading === p.user_id || !draftDate}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (!next) return;
                                handleCabinChange(p, next);
                              }}
                              className="max-w-[180px] px-2 py-1 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
                              aria-label={`Blood collection cabin for ${fullName(p)}`}
                            >
                              <option value="">
                                {scheduleDraft ? "Select cabin" : "—"}
                              </option>
                              {getAvailableCabins(
                                engagementPublicSlotDetail,
                                draftDate,
                                draftCabin || p.blood_collection_cabin
                              ).map((cabin) => (
                                <option key={cabin.cabin_key} value={cabin.cabin_key}>
                                  {cabin.cabin_name || cabin.cabin_key}
                                </option>
                              ))}
                            </select>
                          ) : (
                            p.blood_collection_cabin || "—"
                          )}
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
                        {visibleExpertTypes.map((et) => (
                        <td
                          key={et.type_key}
                          className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-600 whitespace-nowrap"
                          onClick={(ev) => {
                            if (
                              consultationEditMode.has(et.type_key) &&
                              canEditConsultation
                            ) {
                              ev.stopPropagation();
                            }
                          }}
                        >
                          {renderConsultationCell(p, et.type_key)}
                        </td>
                        ))}
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

            {total > PARTICIPANTS_PAGE_SIZE && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600">
                <span>
                  Showing {(page - 1) * PARTICIPANTS_PAGE_SIZE + 1}–
                  {Math.min(page * PARTICIPANTS_PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1 || loading}
                    className="px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span>
                    Page {page} of {Math.max(1, Math.ceil(total / PARTICIPANTS_PAGE_SIZE))}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) =>
                        Math.min(Math.ceil(total / PARTICIPANTS_PAGE_SIZE), current + 1)
                      )
                    }
                    disabled={page >= Math.ceil(total / PARTICIPANTS_PAGE_SIZE) || loading}
                    className="px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
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

      {exportFormatOpen && (
        <Modal
          open={exportFormatOpen}
          onClose={() => setExportFormatOpen(false)}
          title="Export selected participants"
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-700">
              Export{" "}
              <span className="font-semibold">{selectedCount}</span> selected participant
              {selectedCount !== 1 ? "s" : ""} in the format below.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="export-format" className="text-xs font-medium text-zinc-500">
                Format
              </label>
              <select
                id="export-format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                className={filterSelectClass}
              >
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
              </select>
            </div>
            <label
              htmlFor="export-with-address"
              className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer"
            >
              <input
                id="export-with-address"
                type="checkbox"
                checked={exportWithAddress}
                onChange={(e) => setExportWithAddress(e.target.checked)}
                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              with-address
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExportFormatOpen(false)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
