import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { fetchAllPages } from "../../lib/fetchAllPages";
import {
  campReportSectionsApi,
  campReportsApi,
  getApiError,
  type CampReportRow,
  type CampReportSection,
  type CampReportSectionPayload,
} from "../../lib/api";

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

function sectionTotalEnrolled(sectionData: CampReportSectionPayload | null): number | undefined {
  if (!sectionData) return undefined;
  return sectionData.data?.total_enrolled ?? sectionData.total_enrolled;
}

const KPI_LABELS: { key: keyof NonNullable<CampReportSectionPayload["data"]>; label: string }[] = [
  { key: "employees_enrolled", label: "Employees enrolled" },
  { key: "male_enrolled", label: "Male enrolled" },
  { key: "female_enrolled", label: "Female enrolled" },
  { key: "total_blood_test", label: "Total blood test" },
  { key: "blood_test_percent", label: "Blood test %" },
  { key: "doctor_consultation", label: "Doctor consultation" },
  { key: "high_risk_group", label: "High risk group" },
];

export function CampReportsPage() {
  const { campNo: campNoParam } = useParams<{ campNo: string }>();
  const campNo = campNoParam ? Number(campNoParam) : NaN;

  const [reports, setReports] = useState<CampReportRow[]>([]);
  const [sections, setSections] = useState<CampReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string | null>>({});

  const fetchData = useCallback(async () => {
    if (!Number.isFinite(campNo)) {
      setError("Invalid camp number");
      setLoading(false);
      return;
    }

    setLoading(true);
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
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
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

  const handleRefresh = async (
    report: CampReportRow,
    sectionKey: string
  ) => {
    const refreshStateKey = `${report.report_id}:${sectionKey}`;
    setRefreshingKey(refreshStateKey);
    setSectionErrors((prev) => ({ ...prev, [refreshStateKey]: null }));

    try {
      const response =
        report.department === null
          ? await campReportsApi.refreshCamp(campNo, sectionKey)
          : await campReportsApi.refreshDepartment(campNo, report.department, sectionKey);

      const updatedSection = response.data.data.section;
      setReports((prev) =>
        prev.map((row) => {
          if (row.report_id !== report.report_id) return row;
          const nextReport = { ...(row.report ?? {}) };
          nextReport[sectionKey] = updatedSection;
          if (nextReport.meta && typeof nextReport.meta === "object") {
            nextReport.meta = {
              ...(nextReport.meta as Record<string, unknown>),
              summary_available: true,
            };
          }
          return { ...row, report: nextReport };
        })
      );
    } catch (err) {
      setSectionErrors((prev) => ({
        ...prev,
        [refreshStateKey]: getApiError(err),
      }));
    } finally {
      setRefreshingKey(null);
    }
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

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900">Manage Reports</h1>
        <p className="text-sm text-zinc-500 mt-1">Camp no. {campNo}</p>
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
                          const refreshStateKey = `${report.report_id}:${section.section_key}`;
                          const isRefreshing = refreshingKey === refreshStateKey;
                          const sectionError = sectionErrors[refreshStateKey];

                          return (
                            <div
                              key={`${report.report_id}-${section.section_key}`}
                              className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-2"
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
                                <button
                                  type="button"
                                  onClick={() => void handleRefresh(report, section.section_key)}
                                  disabled={isRefreshing}
                                  className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 shrink-0"
                                  title="Refresh section"
                                >
                                  {isRefreshing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4" />
                                  )}
                                </button>
                              </div>

                              {sectionTotalEnrolled(sectionData) != null && (
                                <p className="text-xs text-zinc-600">
                                  Total enrolled: {sectionTotalEnrolled(sectionData)}
                                </p>
                              )}

                              {section.section_key === "kpis" && sectionData?.data && (
                                <dl className="grid grid-cols-1 gap-1 text-xs text-zinc-600">
                                  {KPI_LABELS.map(({ key, label }) => {
                                    const value = sectionData.data?.[key];
                                    if (value == null) return null;
                                    return (
                                      <div key={key} className="flex justify-between gap-2">
                                        <dt>{label}</dt>
                                        <dd className="font-medium text-zinc-800 tabular-nums">
                                          {value}
                                        </dd>
                                      </div>
                                    );
                                  })}
                                </dl>
                              )}

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
    </div>
  );
}
