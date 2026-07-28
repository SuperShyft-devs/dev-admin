import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { fetchAllPages } from "../../lib/fetchAllPages";
import {
  campReportSectionsApi,
  campReportsApi,
  getApiError,
  type CampReportEstimateOperation,
  type CampReportEstimateResult,
  type CampReportRow,
  type CampReportSection,
  type CampReportSectionPayload,
} from "../../lib/api";
import { Modal } from "../../shared/ui/Modal";

function getReportMeta(report: CampReportRow): Record<string, unknown> | null {
  const payload = report.report;
  if (!payload || typeof payload !== "object") return null;
  const meta = payload.meta;
  if (!meta || typeof meta !== "object") return null;
  return meta as Record<string, unknown>;
}

function getSectionData(
  report: CampReportRow,
  sectionKey: string
): CampReportSectionPayload | null {
  const payload = report.report;
  if (!payload || typeof payload !== "object") return null;
  const section = payload[sectionKey];
  if (!section || typeof section !== "object") return null;
  return section as CampReportSectionPayload;
}

function reportAccordionKey(report: CampReportRow): string {
  return `${report.report_id}-${report.department ?? "overall"}`;
}

function formatEstimatedTime(seconds: number): string {
  if (seconds < 60) {
    return `about ${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (remMinutes === 0) {
    return `about ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `about ${hours}h ${remMinutes}m`;
}

function formatFieldLabel(key: string): string {
  if (key.startsWith("consultations.")) {
    const expertKey = key.slice("consultations.".length);
    const parts = expertKey.split("_").filter(Boolean);
    if (parts.length === 0) return "Consultations";
    if (parts.length === 1) {
      return `${parts[0][0].toUpperCase()}${parts[0].slice(1)} consultations`;
    }
    if (parts.length === 2) {
      return `${parts[0][0].toUpperCase()}${parts[0].slice(1)} and ${parts[1]} consultations`;
    }
    return `${parts.map((p, i) => (i === 0 ? p[0].toUpperCase() + p.slice(1) : p)).join(", ")} consultations`;
  }
  const labels: Record<string, string> = {
    employees_enrolled: "People enrolled",
    male_enrolled: "Men enrolled",
    female_enrolled: "Women enrolled",
    total_blood_test: "Blood tests completed",
    blood_test_percent: "Blood-test coverage (%)",
    high_risk_group: "High-risk group",
    doctor_consultation: "Doctor consultations",
    nutritionist_consultation: "Nutritionist consultations",
    doctor_and_nutritionist_consultation: "Doctor and nutritionist consultations",
  };
  if (labels[key]) return labels[key];
  return key.replace(/\./g, " · ").replace(/_/g, " ");
}

const BTS_COLUMNS =
  "grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_1.5rem]";

function isBtsFieldEntry(
  value: unknown
): value is {
  match: boolean;
  expected: unknown;
  stored: unknown;
  reason?: string | null;
} {
  return (
    !!value &&
    typeof value === "object" &&
    "match" in value &&
    "expected" in value &&
    "stored" in value
  );
}

type ConfirmAction =
  | { kind: "refresh"; report: CampReportRow; section: CampReportSection }
  | { kind: "validate"; report: CampReportRow; section: CampReportSection }
  | { kind: "refresh_all" };

function BtsModalBody({
  data,
}: {
  data: Record<string, unknown> | null;
}) {
  if (data == null) {
    return (
      <p className="text-sm text-zinc-500">
        No validation data yet. Confirm validate to generate it.
      </p>
    );
  }

  const status = typeof data.status === "string" ? data.status : null;

  if (status === "not_implemented") {
    return (
      <p className="text-sm text-zinc-600">
        {typeof data.message === "string"
          ? data.message
          : "Validation for this section is not available yet."}
      </p>
    );
  }

  const fields =
    data.fields && typeof data.fields === "object"
      ? (data.fields as Record<string, unknown>)
      : null;
  const details =
    data.details && typeof data.details === "object"
      ? (data.details as Record<string, unknown>)
      : null;
  const blood =
    details?.blood && typeof details.blood === "object"
      ? (details.blood as Record<string, unknown>)
      : null;

  if (fields || status === "ok" || status === "mismatch") {
    const statusClass =
      status === "ok"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : status === "mismatch"
          ? "bg-amber-50 text-amber-900 border-amber-200"
          : "bg-zinc-50 text-zinc-700 border-zinc-200";

    return (
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          {status && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${statusClass}`}
            >
              {status}
            </span>
          )}
          {typeof data.checked_at === "string" && (
            <span className="text-xs text-zinc-500">
              Checked at {new Date(data.checked_at).toLocaleString()}
            </span>
          )}
        </div>

        {typeof data.message === "string" && data.message && (
          <p className="text-sm text-zinc-600">{data.message}</p>
        )}

        {blood && Object.keys(blood).length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
            <p className="text-xs font-medium text-zinc-800 mb-1.5">Blood test breakdown</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  {
                    key: "with_booking_id",
                    label: "Has booking",
                    tip: "These people already have a lab booking saved with us. They are counted as blood tests.",
                  },
                  {
                    key: "with_metsights_collection",
                    label: "Sample collected",
                    tip: "No booking saved with us, but the lab system says their blood was already taken. They are counted as blood tests.",
                  },
                  {
                    key: "missing_collection",
                    label: "No sample yet",
                    tip: "We checked the lab system. Their blood has not been taken yet. Not counted.",
                  },
                  {
                    key: "no_record_id",
                    label: "Cannot check",
                    tip: "We could not find their health assessment, so we could not check if blood was taken. Not counted.",
                  },
                  {
                    key: "check_failed",
                    label: "Check failed",
                    tip: "We tried to check the lab system, but it did not respond properly. Not counted this time.",
                  },
                  {
                    key: "users_needing_metsights_check",
                    label: "Checked online",
                    tip: "How many people we had to look up in the lab system because they had no booking saved with us.",
                  },
                ] as const
              ).map((item) =>
                blood[item.key] == null ? null : (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-2 text-[11px] text-zinc-600"
                  >
                    <span className="inline-flex items-center gap-1 min-w-0 text-zinc-500">
                      <span className="truncate">{item.label}</span>
                      <span className="relative group/tip shrink-0">
                        <Info
                          className="w-3 h-3 text-zinc-400"
                          aria-label={item.tip}
                        />
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-52 -translate-x-1/2 rounded-md bg-zinc-900 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-zinc-100 opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
                        >
                          {item.tip}
                        </span>
                      </span>
                    </span>
                    <span className="font-medium text-zinc-800 tabular-nums shrink-0">
                      {String(blood[item.key])}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {fields && Object.keys(fields).length > 0 ? (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div
              className={`grid ${BTS_COLUMNS} gap-x-3 px-3 py-2 bg-zinc-50 text-[11px] font-medium text-zinc-500 uppercase tracking-wide`}
            >
              <span>Field</span>
              <span className="text-right">Expected</span>
              <span className="text-right">In report</span>
              <span aria-hidden className="w-6" />
            </div>
            <div className="divide-y divide-zinc-100">
              {Object.entries(fields).map(([key, raw]) => {
                if (!isBtsFieldEntry(raw)) {
                  return (
                    <div key={key} className="px-3 py-2 text-xs text-zinc-600">
                      <span className="font-medium">{formatFieldLabel(key)}</span>
                      <pre className="mt-1 text-[10px] whitespace-pre-wrap break-words">
                        {JSON.stringify(raw, null, 2)}
                      </pre>
                    </div>
                  );
                }
                return (
                  <div key={key} className="px-3 py-2.5">
                    <div className={`grid ${BTS_COLUMNS} gap-x-3 items-center`}>
                      <span className="text-xs font-medium text-zinc-800 min-w-0 pr-2">
                        {formatFieldLabel(key)}
                      </span>
                      <span className="text-xs font-mono text-zinc-700 text-right tabular-nums">
                        {raw.expected == null ? "—" : String(raw.expected)}
                      </span>
                      <span className="text-xs font-mono text-zinc-700 text-right tabular-nums">
                        {raw.stored == null ? "—" : String(raw.stored)}
                      </span>
                      <span className="flex justify-end">
                        {raw.match ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                      </span>
                    </div>
                    {!raw.match && raw.reason && (
                      <p className="mt-1.5 text-[11px] text-amber-800 leading-relaxed pr-8">
                        {raw.reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <pre className="text-xs text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words max-h-[70vh]">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function CampReportsPage() {
  const { campNo: campNoParam } = useParams<{ campNo: string }>();
  const campNo = campNoParam ? Number(campNoParam) : NaN;

  const [reports, setReports] = useState<CampReportRow[]>([]);
  const [sections, setSections] = useState<CampReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string | null>>({});
  const [dashboardModal, setDashboardModal] = useState<{
    title: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [btsModal, setBtsModal] = useState<{
    title: string;
    sectionKey: string;
    data: Record<string, unknown> | null;
  } | null>(null);
  const [bulkRefresh, setBulkRefresh] = useState<{
    open: boolean;
    running: boolean;
    done: number;
    total: number;
    currentLabel: string | null;
    failures: { label: string; error: string }[];
  }>({
    open: false,
    running: false,
    done: 0,
    total: 0,
    currentLabel: null,
    failures: [],
  });
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: ConfirmAction | null;
    estimating: boolean;
    estimate: CampReportEstimateResult | null;
    error: string | null;
  }>({
    open: false,
    title: "",
    description: "",
    action: null,
    estimating: false,
    estimate: null,
    error: null,
  });

  const fetchData = useCallback(async (opts?: { silent?: boolean }): Promise<CampReportRow[]> => {
    if (!Number.isFinite(campNo)) {
      setError("Invalid camp number");
      setLoading(false);
      return [];
    }

    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [reportsRes, sectionRows] = await Promise.all([
        campReportsApi.listByCamp(campNo),
        fetchAllPages<CampReportSection>((page, limit) =>
          campReportSectionsApi.list({ page, limit })
        ),
      ]);
      const rows = reportsRes.data.data;
      setReports(rows);
      setSections(sectionRows);
      setExpandedKeys((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          const key = reportAccordionKey(row);
          if (next[key] === undefined) {
            next[key] = row.department === null;
          }
        }
        return next;
      });
      return rows;
    } catch (err) {
      setError(getApiError(err));
      return [];
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [campNo]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      if (a.department === null && b.department !== null) return -1;
      if (a.department !== null && b.department === null) return 1;
      return (a.department ?? "").localeCompare(b.department ?? "");
    });
  }, [reports]);

  const toggleAccordion = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchDashboard = async (
    report: CampReportRow,
    section: CampReportSection
  ): Promise<Record<string, unknown>> => {
    const response =
      report.department === null
        ? await campReportsApi.getDashboard(campNo, section.section_key)
        : await campReportsApi.getDepartmentDashboard(
            campNo,
            report.department,
            section.section_key
          );
    return response.data.data;
  };

  const handleLoadSection = async (
    report: CampReportRow,
    section: CampReportSection
  ) => {
    const loadStateKey = `${report.report_id}:${section.section_key}`;
    setLoadingKey(`${loadStateKey}:load`);
    setSectionErrors((prev) => ({ ...prev, [loadStateKey]: null }));

    try {
      const data = await fetchDashboard(report, section);
      setDashboardModal({
        title: section.section,
        data,
      });
    } catch (err) {
      setSectionErrors((prev) => ({
        ...prev,
        [loadStateKey]: getApiError(err),
      }));
    } finally {
      setLoadingKey(null);
    }
  };

  const handleRefreshSection = async (
    report: CampReportRow,
    section: CampReportSection
  ) => {
    const loadStateKey = `${report.report_id}:${section.section_key}`;
    setLoadingKey(`${loadStateKey}:refresh`);
    setSectionErrors((prev) => ({ ...prev, [loadStateKey]: null }));

    try {
      if (report.department === null) {
        await campReportsApi.refreshCamp(campNo, section.section_key);
      } else {
        await campReportsApi.refreshDepartment(
          campNo,
          report.department,
          section.section_key
        );
      }

      const data = await fetchDashboard(report, section);
      setDashboardModal({
        title: section.section,
        data,
      });
    } catch (err) {
      setSectionErrors((prev) => ({
        ...prev,
        [loadStateKey]: getApiError(err),
      }));
    } finally {
      setLoadingKey(null);
    }
  };

  const handleValidateSection = async (
    report: CampReportRow,
    section: CampReportSection
  ) => {
    const loadStateKey = `${report.report_id}:${section.section_key}`;
    setLoadingKey(`${loadStateKey}:validate`);
    setSectionErrors((prev) => ({ ...prev, [loadStateKey]: null }));

    try {
      let refreshResult: { report_bts?: Record<string, unknown> | null } | undefined;
      if (report.department === null) {
        const response = await campReportsApi.refreshCamp(campNo, section.section_key);
        refreshResult = response.data.data;
      } else {
        const response = await campReportsApi.refreshDepartment(
          campNo,
          report.department,
          section.section_key
        );
        refreshResult = response.data.data;
      }

      const rows = await fetchData({ silent: true });
      const refreshed = rows.find((row) => row.report_id === report.report_id);
      const sectionBtsRaw = refreshed?.report_bts?.[section.section_key];
      const sectionBts =
        sectionBtsRaw && typeof sectionBtsRaw === "object"
          ? (sectionBtsRaw as Record<string, unknown>)
          : refreshResult?.report_bts ?? null;

      setBtsModal({
        title: `Validation: ${section.section}`,
        sectionKey: section.section_key,
        data: sectionBts,
      });
    } catch (err) {
      setSectionErrors((prev) => ({
        ...prev,
        [loadStateKey]: getApiError(err),
      }));
    } finally {
      setLoadingKey(null);
    }
  };

  const reportDisplayName = (report: CampReportRow): string => {
    if (report.department === null) return "Main report";
    const meta = getReportMeta(report);
    if (typeof meta?.camp_name === "string" && meta.camp_name) return meta.camp_name;
    return `Department: ${report.department}`;
  };

  const closeConfirmModal = () => {
    if (confirmModal.estimating) return;
    setConfirmModal((prev) => ({ ...prev, open: false, action: null }));
  };

  const openConfirmModal = async (
    title: string,
    description: string,
    action: ConfirmAction,
    operations: CampReportEstimateOperation[]
  ) => {
    setConfirmModal({
      open: true,
      title,
      description,
      action,
      estimating: true,
      estimate: null,
      error: null,
    });
    try {
      const response = await campReportsApi.estimate(campNo, operations);
      setConfirmModal((prev) => ({
        ...prev,
        estimating: false,
        estimate: response.data.data,
        error: null,
      }));
    } catch (err) {
      setConfirmModal((prev) => ({
        ...prev,
        estimating: false,
        estimate: null,
        error: getApiError(err),
      }));
    }
  };

  const requestRefreshSection = (
    report: CampReportRow,
    section: CampReportSection
  ) => {
    void openConfirmModal(
      "Confirm refresh",
      `Refresh “${section.section}” on ${reportDisplayName(report)}?`,
      { kind: "refresh", report, section },
      [
        {
          section: section.section_key,
          action: "refresh",
          department: report.department,
        },
      ]
    );
  };

  const requestValidate = (report: CampReportRow, section: CampReportSection) => {
    void openConfirmModal(
      "Confirm validate",
      `Validate “${section.section}” on ${reportDisplayName(report)}? This will refresh the section and update validation data.`,
      { kind: "validate", report, section },
      [{ section: section.section_key, action: "validate", department: report.department }]
    );
  };

  const requestRefreshAllSections = () => {
    if (sortedReports.length === 0 || sections.length === 0 || bulkRefresh.running) return;
    const operations: CampReportEstimateOperation[] = sortedReports.flatMap((report) =>
      sections.map((section) => ({
        section: section.section_key,
        action: "refresh" as const,
        department: report.department,
      }))
    );
    void openConfirmModal(
      "Confirm refresh all",
      `Refresh every section on the main report and all department reports (${operations.length} operations)?`,
      { kind: "refresh_all" },
      operations
    );
  };

  const handleConfirmAction = async () => {
    const action = confirmModal.action;
    const estimate = confirmModal.estimate;
    if (!action || !estimate?.all_allowed) return;
    setConfirmModal((prev) => ({ ...prev, open: false, action: null }));

    if (action.kind === "refresh") {
      await handleRefreshSection(action.report, action.section);
      return;
    }
    if (action.kind === "refresh_all") {
      await handleRefreshAllSections();
      return;
    }
    await handleValidateSection(action.report, action.section);
  };

  const handleRefreshAllSections = async () => {
    if (sortedReports.length === 0 || sections.length === 0 || bulkRefresh.running) return;

    const jobs = sortedReports.flatMap((report) =>
      sections.map((section) => ({
        report,
        section,
        label: `${reportDisplayName(report)} · ${section.section}`,
      }))
    );

    setBulkRefresh({
      open: true,
      running: true,
      done: 0,
      total: jobs.length,
      currentLabel: null,
      failures: [],
    });

    const failures: { label: string; error: string }[] = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      setBulkRefresh((prev) => ({
        ...prev,
        currentLabel: job.label,
      }));

      try {
        if (job.report.department === null) {
          await campReportsApi.refreshCamp(campNo, job.section.section_key);
        } else {
          await campReportsApi.refreshDepartment(
            campNo,
            job.report.department,
            job.section.section_key
          );
        }
      } catch (err) {
        failures.push({ label: job.label, error: getApiError(err) });
      }

      setBulkRefresh((prev) => ({
        ...prev,
        done: i + 1,
      }));
    }

    await fetchData({ silent: true });

    setBulkRefresh({
      open: true,
      running: false,
      done: jobs.length,
      total: jobs.length,
      currentLabel: null,
      failures,
    });
  };

  const closeBulkRefreshModal = () => {
    if (bulkRefresh.running) return;
    setBulkRefresh((prev) => ({ ...prev, open: false }));
  };

  const openExistingBtsFromConfirm = () => {
    const action = confirmModal.action;
    if (!action || action.kind !== "validate") return;
    const raw = action.report.report_bts?.[action.section.section_key];
    const data =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    setBtsModal({
      title: `Validation: ${action.section.section}`,
      sectionKey: action.section.section_key,
      data,
    });
  };

  if (!Number.isFinite(campNo)) {
    return (
      <div className="p-6">
        <p className="text-red-600">Invalid camp number.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <Link
        to="/organisations/camps"
        className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to camps
      </Link>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900">Manage Reports</h1>
          <p className="text-sm text-zinc-500 mt-1">Camp no. {campNo}</p>
        </div>
        {!loading && !error && sortedReports.length > 0 && sections.length > 0 && (
          <button
            type="button"
            onClick={() => requestRefreshAllSections()}
            disabled={bulkRefresh.running || confirmModal.open}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 shrink-0"
            title="Refresh every section on the main report and all department reports"
          >
            {bulkRefresh.running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh all sections
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : sortedReports.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          No camp reports found for this camp. Initialize reports from the camps list first.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReports.map((report) => {
            const accordionKey = reportAccordionKey(report);
            const expanded = expandedKeys[accordionKey] ?? false;
            const meta = getReportMeta(report);
            const title =
              typeof meta?.camp_name === "string" && meta.camp_name
                ? meta.camp_name
                : "Camp report";
            const isMain = report.department === null;

            return (
              <div
                key={accordionKey}
                className={
                  "border rounded-xl overflow-hidden bg-white " +
                  (isMain ? "border-zinc-900 shadow-sm" : "border-zinc-200")
                }
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(accordionKey)}
                  className={
                    "w-full flex items-center gap-3 px-4 py-3 text-left " +
                    (isMain ? "bg-zinc-50" : "bg-white hover:bg-zinc-50")
                  }
                >
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-zinc-900">{title}</span>
                      {isMain && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-900 text-white">
                          Main report
                        </span>
                      )}
                    </div>
                    {!isMain && report.department && (
                      <p className="text-xs text-zinc-500 mt-0.5">Department: {report.department}</p>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-zinc-100">
                    {sections.length === 0 ? (
                      <p className="text-sm text-zinc-500 py-3">
                        No report sections configured. Add sections from Manage Report Sections on the camps page.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        {sections.map((section) => {
                          const sectionData = getSectionData(report, section.section_key);
                          const loadStateKey = `${report.report_id}:${section.section_key}`;
                          const isLoadLoading = loadingKey === `${loadStateKey}:load`;
                          const isRefreshLoading = loadingKey === `${loadStateKey}:refresh`;
                          const isValidateLoading = loadingKey === `${loadStateKey}:validate`;
                          const isSectionBusy = isLoadLoading || isRefreshLoading || isValidateLoading;
                          const sectionError = sectionErrors[loadStateKey];

                          return (
                            <div
                              key={`${report.report_id}-${section.section_key}`}
                              className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-2 min-h-[88px]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="text-sm font-medium text-zinc-900">
                                    {sectionData?.name ?? section.section}
                                  </h3>
                                  {(sectionData?.description ?? section.description) && (
                                    <p className="text-xs text-zinc-500 mt-1">
                                      {sectionData?.description ?? section.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => requestValidate(report, section)}
                                    disabled={isSectionBusy || confirmModal.open}
                                    className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                                    title="Validate section"
                                  >
                                    {isValidateLoading ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <ShieldCheck className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleLoadSection(report, section)}
                                    disabled={isSectionBusy}
                                    className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                                    title="Load section data"
                                  >
                                    {isLoadLoading ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Eye className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => requestRefreshSection(report, section)}
                                    disabled={isSectionBusy || confirmModal.open}
                                    className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                                    title="Refresh and load section data"
                                  >
                                    {isRefreshLoading ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              {sectionError && (
                                <p className="text-xs text-red-600">{sectionError}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={confirmModal.open}
        onClose={closeConfirmModal}
        title={confirmModal.title}
        maxWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">{confirmModal.description}</p>

          {confirmModal.estimating ? (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500 shrink-0" />
              <p className="text-sm text-zinc-500">Estimating completion time…</p>
            </div>
          ) : confirmModal.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {confirmModal.error}
            </div>
          ) : confirmModal.estimate ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
                <p className="text-sm text-zinc-900">
                  Estimated time:{" "}
                  <span className="font-medium">
                    {formatEstimatedTime(confirmModal.estimate.total_estimated_seconds)}
                  </span>
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Client timeout: {confirmModal.estimate.timeout_seconds}s
                  {confirmModal.estimate.operations.length === 1 && (
                    <>
                      {confirmModal.estimate.operations[0].participant_count != null && (
                        <> · {confirmModal.estimate.operations[0].participant_count} participants</>
                      )}
                      {confirmModal.estimate.operations[0].unit_count != null &&
                        confirmModal.estimate.operations[0].unit_count !==
                          confirmModal.estimate.operations[0].participant_count && (
                          <> · {confirmModal.estimate.operations[0].unit_count} assessments</>
                        )}
                    </>
                  )}
                </p>
              </div>
              {!confirmModal.estimate.all_allowed && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {confirmModal.action?.kind === "refresh_all" ? (
                    <>
                      One or more sections are estimated to exceed the {confirmModal.estimate.timeout_seconds}s
                      timeout and cannot be started.
                      <ul className="mt-2 list-disc list-inside text-xs space-y-0.5">
                        {confirmModal.estimate.operations
                          .filter((op) => !op.allowed)
                          .map((op) => (
                            <li key={`${op.action}:${op.section}:${op.department ?? ""}`}>
                              {op.section}
                              {op.department ? ` (${op.department})` : ""} —{" "}
                              {formatEstimatedTime(op.estimated_seconds)}
                            </li>
                          ))}
                      </ul>
                    </>
                  ) : (
                    <>
                      This operation is estimated to take longer than the{" "}
                      {confirmModal.estimate.timeout_seconds}s client timeout. It cannot be started.
                    </>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeConfirmModal}
              disabled={confirmModal.estimating}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
            {confirmModal.action?.kind === "validate" && (
              <button
                type="button"
                onClick={openExistingBtsFromConfirm}
                disabled={confirmModal.estimating}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                View
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleConfirmAction()}
              disabled={
                confirmModal.estimating ||
                !!confirmModal.error ||
                !confirmModal.estimate?.all_allowed
              }
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkRefresh.open}
        onClose={closeBulkRefreshModal}
        title={bulkRefresh.running ? "Refreshing all sections" : "Refresh complete"}
        maxWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          {bulkRefresh.running ? (
            <>
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-700 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    Refreshing {bulkRefresh.done} / {bulkRefresh.total}
                  </p>
                  {bulkRefresh.currentLabel && (
                    <p className="text-xs text-zinc-500 mt-1 truncate">{bulkRefresh.currentLabel}</p>
                  )}
                </div>
              </div>
              <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-zinc-900 transition-all duration-300"
                  style={{
                    width: `${
                      bulkRefresh.total > 0
                        ? Math.round((bulkRefresh.done / bulkRefresh.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-zinc-500">
                Keep this window open. Main report and every department section are refreshed one by one.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-700">
                Finished {bulkRefresh.done} / {bulkRefresh.total} section refreshes.
                {bulkRefresh.failures.length === 0
                  ? " All succeeded."
                  : ` ${bulkRefresh.failures.length} failed.`}
              </p>
              {bulkRefresh.failures.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50 divide-y divide-red-100">
                  {bulkRefresh.failures.map((failure) => (
                    <div key={failure.label} className="px-3 py-2">
                      <p className="text-xs font-medium text-red-800">{failure.label}</p>
                      <p className="text-xs text-red-600 mt-0.5">{failure.error}</p>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={closeBulkRefreshModal}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
              >
                Close
              </button>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={dashboardModal !== null}
        onClose={() => setDashboardModal(null)}
        title={dashboardModal?.title ?? "Section data"}
        maxWidthClassName="max-w-3xl"
      >
        <pre className="text-xs text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words">
          {dashboardModal
            ? JSON.stringify(dashboardModal.data, null, 2)
            : ""}
        </pre>
      </Modal>

      <Modal
        open={btsModal !== null}
        onClose={() => setBtsModal(null)}
        title={btsModal?.title ?? "Validation"}
        maxWidthClassName="max-w-2xl"
      >
        {btsModal && <BtsModalBody data={btsModal.data} />}
      </Modal>
    </div>
  );
}
