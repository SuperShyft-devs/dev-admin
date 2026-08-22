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
  Pencil,
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

function reportCity(report: CampReportRow): string | null {
  const city = typeof report.city === "string" ? report.city.trim() : "";
  return city || null;
}

function isOverallReport(report: CampReportRow): boolean {
  return report.department === null && reportCity(report) === null;
}

function reportSortRank(report: CampReportRow): number {
  const city = reportCity(report);
  if (!city && report.department === null) return 0;
  if (!city && report.department) return 1;
  if (city && report.department === null) return 2;
  return 3;
}

function reportAccordionKey(report: CampReportRow): string {
  return `${report.report_id}-${reportCity(report) ?? "all"}-${report.department ?? "overall"}`;
}

function estimateScope(
  report: CampReportRow
): Pick<CampReportEstimateOperation, "department" | "city"> {
  return {
    department: report.department,
    city: reportCity(report),
  };
}

async function refreshScopedSection(
  campNo: number,
  report: CampReportRow,
  sectionKey: string
) {
  const city = reportCity(report);
  const department = report.department;
  if (city && department) {
    return campReportsApi.refreshCityDepartment(campNo, city, department, sectionKey);
  }
  if (city) {
    return campReportsApi.refreshCity(campNo, city, sectionKey);
  }
  if (department) {
    return campReportsApi.refreshDepartment(campNo, department, sectionKey);
  }
  return campReportsApi.refreshCamp(campNo, sectionKey);
}

async function fetchScopedDashboard(
  campNo: number,
  report: CampReportRow,
  sectionKey: string
) {
  const city = reportCity(report);
  const department = report.department;
  if (city && department) {
    return campReportsApi.getCityDepartmentDashboard(campNo, city, department, sectionKey);
  }
  if (city) {
    return campReportsApi.getCityDashboard(campNo, city, sectionKey);
  }
  if (department) {
    return campReportsApi.getDepartmentDashboard(campNo, department, sectionKey);
  }
  return campReportsApi.getDashboard(campNo, sectionKey);
}

async function updateScopedDashboard(
  campNo: number,
  report: CampReportRow,
  sectionKey: string,
  payload: Record<string, unknown>
) {
  const city = reportCity(report);
  const department = report.department;
  if (city && department) {
    return campReportsApi.updateCityDepartmentDashboard(
      campNo,
      city,
      department,
      sectionKey,
      payload
    );
  }
  if (city) {
    return campReportsApi.updateCityDashboard(campNo, city, sectionKey, payload);
  }
  if (department) {
    return campReportsApi.updateDepartmentDashboard(campNo, department, sectionKey, payload);
  }
  return campReportsApi.updateDashboard(campNo, sectionKey, payload);
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
  if (key.startsWith("enrolled.")) {
    return `People in ${key.slice("enrolled.".length)}`;
  }
  if (key.startsWith("percent.")) {
    const rest = key.slice("percent.".length);
    if (rest.startsWith("male.") || rest.startsWith("female.")) {
      const [gender, ...bucketParts] = rest.split(".");
      const genderLabel = gender === "male" ? "Men" : "Women";
      return `Share · ${genderLabel} · ${bucketParts.join(" ").replace(/_/g, " ")} (%)`;
    }
    const band = rest;
    if (
      band === "optimal" ||
      band === "low_risk" ||
      band === "increased_risk" ||
      band === "high_risk"
    ) {
      return `Share in ${band.replace(/_/g, " ")} (%)`;
    }
    if (band === "low" || band === "moderate" || band === "high" || band === "very_high") {
      return `Share in ${band.replace(/_/g, " ")} (%)`;
    }
    return `Share in ${band} (%)`;
  }
  if (key.startsWith("count.")) {
    const rest = key.slice("count.".length);
    if (rest.startsWith("male.") || rest.startsWith("female.")) {
      const [gender, ...bucketParts] = rest.split(".");
      const genderLabel = gender === "male" ? "Men" : "Women";
      return `People · ${genderLabel} · ${bucketParts.join(" ").replace(/_/g, " ")}`;
    }
    return `People in ${rest.replace(/_/g, " ")}`;
  }
  if (key.startsWith("male.") || key.startsWith("female.")) {
    const [gender, field] = key.split(".");
    const genderLabel = gender === "male" ? "Men" : "Women";
    if (field === "total_responded") return `${genderLabel} on chart`;
    if (field === "group") return `${genderLabel} chart groups`;
    if (field === "counts_sum") return `${genderLabel} counts add up`;
  }
  const labels: Record<string, string> = {
    employees_enrolled: "People enrolled",
    male_enrolled: "Men enrolled",
    female_enrolled: "Women enrolled",
    total_blood_test: "Blood tests completed",
    blood_test_percent: "Blood-test coverage (%)",
    high_risk_group: "High-risk group",
    caution_risk_group: "Caution-risk group",
    good_risk_group: "Good-risk group",
    questionnaire_completed: "Questionnaire completed",
    bio_ai_report_generated: "Bio AI reports generated",
    risk_groups_sum: "Risk groups add up to Bio AI",
    doctor_consultation: "Doctor consultations",
    nutritionist_consultation: "Nutritionist consultations",
    doctor_and_nutritionist_consultation: "Doctor and nutritionist consultations",
    total_enrolled: "Total people enrolled",
    age_group: "Age groups",
    buckets_sum: "Age-group counts add up",
    group: "Risk groups",
    elevated_metabolic_score: "Elevated metabolic score (%)",
    elevated_oxidative_stress_percent: "Elevated oxidative stress (%)",
    total_employees: "People with a score",
    counts_sum: "Risk-group counts add up",
    elevated_consistency: "Elevated % matches High + Very High",
    answered_vs_questionnaire_completed: "Answered vs questionnaire completed",
    unknown_answers: "Unrecognized answers",
    unknown_gender: "Gender not male or female",
    "nutrition.score": "Nutrition score",
    "fitness.score": "Fitness score",
    "lifestyle.score": "Lifestyle score",
  };
  if (labels[key]) return labels[key];
  return key.replace(/\./g, " · ").replace(/_/g, " ");
}

function formatAgeSource(source: unknown): string {
  if (source === "date_of_birth") return "Date of birth";
  if (source === "profile_age") return "Profile age";
  return source == null ? "—" : String(source);
}

function formatScalarDisplay(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
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
  const [openAgeGroups, setOpenAgeGroups] = useState<Record<string, boolean>>({});
  const [openOrsBands, setOpenOrsBands] = useState<Record<string, boolean>>({});
  const [openOrsExcluded, setOpenOrsExcluded] = useState(false);
  const [openRiskPeople, setOpenRiskPeople] = useState(false);
  const [openQuestionnaireByEngagement, setOpenQuestionnaireByEngagement] = useState(false);
  const [openBioAiMismatch, setOpenBioAiMismatch] = useState(false);
  const [openQgdGroups, setOpenQgdGroups] = useState<Record<string, boolean>>({});
  const [openQgdExceptions, setOpenQgdExceptions] = useState<Record<string, boolean>>({});
  const [openDiseasePanels, setOpenDiseasePanels] = useState<Record<string, boolean>>({});
  const [openDiseaseGroups, setOpenDiseaseGroups] = useState<Record<string, boolean>>({});
  const [openDiseasePercentMath, setOpenDiseasePercentMath] = useState<Record<string, boolean>>({});
  const [openPositiveWinsSections, setOpenPositiveWinsSections] = useState<Record<string, boolean>>({});
  const [openPositiveWinsPeople, setOpenPositiveWinsPeople] = useState<Record<string, boolean>>({});
  const [openPositiveWinsParticipants, setOpenPositiveWinsParticipants] = useState(false);
  const [openCompanyAverageScoreSections, setOpenCompanyAverageScoreSections] = useState<
    Record<string, boolean>
  >({});
  const [openCompanyAverageParticipants, setOpenCompanyAverageParticipants] = useState(false);
  const [openCompanyAverageExcluded, setOpenCompanyAverageExcluded] = useState(false);
  const [openCompanyAveragePersonScores, setOpenCompanyAveragePersonScores] = useState<
    Record<string, boolean>
  >({});

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
  const method =
    details?.method && typeof details.method === "object"
      ? (details.method as Record<string, unknown>)
      : null;
  const ageGroups =
    details?.age_groups && typeof details.age_groups === "object"
      ? (details.age_groups as Record<string, unknown>)
      : null;
  const notes = Array.isArray(details?.notes)
    ? details.notes.filter((n): n is string => typeof n === "string")
    : [];
  const riskGroups =
    details?.risk_groups && typeof details.risk_groups === "object"
      ? (details.risk_groups as Record<string, unknown>)
      : null;
  const riskPeople = Array.isArray(riskGroups?.people)
    ? (riskGroups.people as Record<string, unknown>[])
    : [];
  const questionnaireDetails =
    details?.questionnaire && typeof details.questionnaire === "object"
      ? (details.questionnaire as Record<string, unknown>)
      : null;
  const questionnaireByEngagement = Array.isArray(questionnaireDetails?.by_engagement)
    ? (questionnaireDetails.by_engagement as Record<string, unknown>[])
    : [];
  const bioAiMismatch =
    details?.bio_ai_mismatch && typeof details.bio_ai_mismatch === "object"
      ? (details.bio_ai_mismatch as Record<string, unknown>)
      : null;
  const bioAiMismatchPeople = Array.isArray(bioAiMismatch?.people)
    ? (bioAiMismatch.people as Record<string, unknown>[])
    : [];
  const elevatedMath =
    details?.elevated_math && typeof details.elevated_math === "object"
      ? (details.elevated_math as Record<string, unknown>)
      : null;
  const elevatedMathSteps = Array.isArray(elevatedMath?.steps)
    ? elevatedMath.steps.filter((s): s is string => typeof s === "string")
    : [];
  const orsBands =
    details?.bands && typeof details.bands === "object"
      ? (details.bands as Record<string, unknown>)
      : null;
  const orsExcluded =
    details?.excluded && typeof details.excluded === "object"
      ? (details.excluded as Record<string, unknown>)
      : null;
  const orsExcludedPeople = Array.isArray(orsExcluded?.people)
    ? (orsExcluded.people as Record<string, unknown>[])
    : [];
  const orsBandRules = Array.isArray(method?.band_rules)
    ? (method.band_rules as Record<string, unknown>[])
    : [];
  const diseaseBtsDetails =
    details?.diseases && typeof details.diseases === "object"
      ? (details.diseases as Record<string, Record<string, unknown>>)
      : null;
  const isDiseaseRiskBts =
    diseaseBtsDetails != null && Object.keys(diseaseBtsDetails).length > 0;
  const isOxidativeStressBts =
    elevatedMath?.kind === "oxidative_stress" ||
    method?.with_oxidative_stress_score != null;
  const scoreBandLabel = isOxidativeStressBts
    ? "oxidative stress score"
    : isDiseaseRiskBts
      ? "risk score"
      : "metabolic score";
  const elevatedMathTitle = isOxidativeStressBts
    ? "Elevated oxidative stress — step by step"
    : isDiseaseRiskBts
      ? "Elevated risk — step by step"
      : "Elevated metabolic score — step by step";
  const bandsSectionTitle = isOxidativeStressBts
    ? "Who is in each group"
    : "Who is in each risk group";
  const qgdGroups =
    details?.groups && typeof details.groups === "object"
      ? (details.groups as Record<string, Record<string, unknown>>)
      : null;
  const qgdExceptions =
    details?.exceptions && typeof details.exceptions === "object"
      ? (details.exceptions as Record<string, Record<string, unknown>[]>)
      : null;
  const qgdComparison =
    details?.comparison && typeof details.comparison === "object"
      ? (details.comparison as Record<string, unknown>)
      : null;
  const unknownGender =
    details?.unknown_gender && typeof details.unknown_gender === "object"
      ? (details.unknown_gender as Record<string, unknown>)
      : null;
  const unknownGenderPeople = Array.isArray(unknownGender?.people)
    ? (unknownGender.people as Record<string, unknown>[])
    : [];
  const isPositiveWinsBts =
    method?.section_kind === "positive_wins" ||
    (details?.low_risk != null && details?.healthy_habits != null);
  const positiveWinsLowRisk =
    details?.low_risk && typeof details.low_risk === "object"
      ? (details.low_risk as Record<string, unknown>)
      : null;
  const positiveWinsHabits =
    details?.healthy_habits && typeof details.healthy_habits === "object"
      ? (details.healthy_habits as Record<string, unknown>)
      : null;
  const positiveWinsProfiles =
    details?.healthy_profiles && typeof details.healthy_profiles === "object"
      ? (details.healthy_profiles as Record<string, unknown>)
      : null;
  const positiveWinsParticipants = Array.isArray(details?.participants)
    ? (details.participants as Record<string, unknown>[])
    : [];
  const isCompanyAverageScoresBts =
    method?.section_kind === "company_average_scores" ||
    (details?.aggregation != null && details?.summary != null);
  const companyAverageSummary =
    details?.summary && typeof details.summary === "object"
      ? (details.summary as Record<string, unknown>)
      : null;
  const companyAverageAggregation =
    details?.aggregation && typeof details.aggregation === "object"
      ? (details.aggregation as Record<string, Record<string, unknown>>)
      : null;
  const companyAverageParticipants = Array.isArray(details?.participants)
    ? (details.participants as Record<string, unknown>[])
    : [];
  const companyAverageExcluded =
    details?.excluded && typeof details.excluded === "object"
      ? (details.excluded as Record<string, unknown[]>)
      : null;
  const companyAverageNotes = Array.isArray(details?.notes)
    ? details.notes.filter((n): n is string => typeof n === "string")
    : [];
  const companyAverageExcludedNoFitprint = Array.isArray(companyAverageExcluded?.no_fitprint)
    ? (companyAverageExcluded.no_fitprint as Record<string, unknown>[])
    : [];
  const companyAverageExcludedReportFailed = Array.isArray(
    companyAverageExcluded?.report_load_failed
  )
    ? (companyAverageExcluded.report_load_failed as Record<string, unknown>[])
    : [];
  const companyAverageExcludedTotal =
    companyAverageExcludedNoFitprint.length + companyAverageExcludedReportFailed.length;

  const qgdExceptionSections: {
    key: string;
    title: string;
    showAnswer?: boolean;
  }[] = [
    {
      key: "answered_without_finishing_questionnaire",
      title: "Answered without finishing questionnaire",
      showAnswer: true,
    },
    {
      key: "finished_questionnaire_without_this_answer",
      title: "Finished questionnaire without this answer",
    },
    {
      key: "answer_not_a_known_choice",
      title: "Answer is not a known choice",
      showAnswer: true,
    },
    {
      key: "gender_not_male_or_female",
      title: "Gender not male or female",
      showAnswer: true,
    },
    { key: "blank_answer", title: "Blank answer saved" },
  ];

  function formatRiskGroupLabel(value: unknown): string {
    if (value === "high") return "High";
    if (value === "caution") return "Caution";
    if (value === "good") return "Good";
    return value == null ? "—" : String(value);
  }

  function formatOrsBandLabel(band: string): string {
    if (band === "optimal") return "Optimal";
    if (band === "low_risk") return "Low Risk";
    if (band === "increased_risk") return "Increased Risk";
    if (band === "high_risk") return "High Risk";
    if (band === "low") return "Low";
    if (band === "moderate") return "Moderate";
    if (band === "high") return "High";
    if (band === "very_high") return "Very High";
    return band.replace(/_/g, " ");
  }

  function formatQgdGroupLabel(bucket: string): string {
    return bucket.replace(/_/g, " ");
  }

  function formatCompanyAverageScoreCell(category: unknown): string {
    if (!category || typeof category !== "object") return "—";
    const score = (category as Record<string, unknown>).score;
    const status = (category as Record<string, unknown>).status;
    if (score == null) {
      return status === "missing" ? "Missing" : "—";
    }
    return String(score);
  }

  function companyAverageScoreStatusClass(category: unknown): string {
    if (!category || typeof category !== "object") return "text-zinc-500";
    const status = (category as Record<string, unknown>).status;
    if (status === "missing") return "text-amber-700";
    return "text-zinc-800";
  }

  if (fields || status === "ok" || status === "mismatch") {
    const statusClass =
      status === "ok"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : status === "mismatch"
          ? "bg-amber-50 text-amber-900 border-amber-200"
          : "bg-zinc-50 text-zinc-700 border-zinc-200";

    return (
      <div className="space-y-4">
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

        {method && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 space-y-2">
            <p className="text-xs font-medium text-zinc-800">How we counted</p>
            {typeof method.scope_label === "string" && (
              <p className="text-[12px] text-zinc-600">
                Scope: {method.scope_label}
              </p>
            )}
            {typeof method.question_label === "string" && (
              <p className="text-[12px] text-zinc-600">
                Question: {method.question_label}
              </p>
            )}
            {typeof method.counting_rule === "string" && (
              <p className="text-[12px] text-zinc-600">{method.counting_rule}</p>
            )}
            {typeof method.who_is_included === "string" && (
              <p className="text-[12px] text-zinc-600">
                Included: {method.who_is_included}
              </p>
            )}
            {typeof method.who_is_excluded === "string" && (
              <p className="text-[12px] text-zinc-600">
                Not included: {method.who_is_excluded}
              </p>
            )}
            {typeof method.reference_date === "string" && (
              <p className="text-[12px] text-zinc-600">
                Age as of{" "}
                {typeof method.reference_date_label === "string"
                  ? method.reference_date_label.toLowerCase()
                  : "camp start"}{" "}
                ({method.reference_date}).
              </p>
            )}
            {orsBandRules.length > 0 && (
              <ul className="space-y-0.5 pt-1">
                {orsBandRules.map((rule, idx) => {
                  const band = typeof rule.band === "string" ? rule.band : "";
                  const range =
                    typeof rule.score_range_label === "string"
                      ? rule.score_range_label
                      : "";
                  if (!band) return null;
                  return (
                    <li key={`${band}-${idx}`} className="text-[11px] text-zinc-600">
                      {formatOrsBandLabel(band)}: {scoreBandLabel} {range}
                    </li>
                  );
                })}
              </ul>
            )}
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
              {(
                [
                  { key: "engagement_count", label: "Sessions" },
                  { key: "participant_rows", label: "Enrollments" },
                  { key: "distinct_people", label: "Unique people" },
                  { key: "age_from_date_of_birth", label: "Age from date of birth" },
                  { key: "age_from_profile", label: "Age from profile" },
                  { key: "under_18_count", label: "Under 18" },
                  { key: "total_enrolled", label: "People enrolled" },
                  { key: "bio_ai_reports", label: "Bio AI reports" },
                  { key: "with_metabolic_score", label: "With metabolic score" },
                  { key: "missing_metabolic_score", label: "Missing metabolic score" },
                  { key: "with_oxidative_stress_score", label: "With oxidative stress score" },
                  { key: "missing_oxidative_stress_score", label: "Missing oxidative stress score" },
                  { key: "with_bio_ai_report", label: "With Bio AI report" },
                  { key: "unknown_gender_count", label: "Unknown gender" },
                  { key: "global_excluded_count", label: "Not in this chart" },
                  { key: "excluded_people_count", label: "Not in this chart" },
                  { key: "enrolled", label: "People enrolled" },
                  { key: "questionnaire_completed", label: "Questionnaire completed" },
                  { key: "answered_this_question", label: "Answered this question" },
                  { key: "counted_on_chart", label: "On the chart" },
                  { key: "not_on_chart", label: "Not on the chart" },
                ] as const
              ).map((item) =>
                method[item.key] == null ? null : (
                  <li
                    key={item.key}
                    className="inline-flex items-center gap-1.5 text-[12px] min-w-0"
                  >
                    <span className="text-zinc-500 truncate">{item.label}</span>
                    <span className="font-medium text-zinc-800 tabular-nums shrink-0">
                      {String(method[item.key])}
                    </span>
                  </li>
                )
              )}
            </ul>
            {notes.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-zinc-200 pt-2">
                {notes.map((note) => (
                  <li key={note} className="text-[11px] text-zinc-600 leading-relaxed">
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {elevatedMathSteps.length > 0 && !isDiseaseRiskBts && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 space-y-2">
            <p className="text-xs font-medium text-zinc-800">
              {elevatedMathTitle}
            </p>
            {typeof elevatedMath?.result_percent === "number" && (
              <p className="text-[12px] text-zinc-600">
                Result:{" "}
                <span className="font-medium text-zinc-800 tabular-nums">
                  {elevatedMath.result_percent}%
                </span>
              </p>
            )}
            <ol className="space-y-1.5 list-none">
              {elevatedMathSteps.map((step) => (
                <li key={step} className="text-[12px] text-zinc-700 leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {blood && Object.keys(blood).length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
            <p className="text-xs font-medium text-zinc-800 mb-2">Blood test breakdown</p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
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
                  <li
                    key={item.key}
                    className="inline-flex items-center gap-1.5 text-[12px] min-w-0"
                  >
                    <span className="text-zinc-500 truncate">{item.label}</span>
                    <button
                      type="button"
                      className="inline-flex shrink-0 text-zinc-400 hover:text-zinc-600"
                      title={item.tip}
                      aria-label={item.tip}
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-medium text-zinc-800 tabular-nums shrink-0">
                      {String(blood[item.key])}
                    </span>
                  </li>
                )
              )}
            </ul>
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
              {Object.entries(fields)
                .filter(
                  ([key]) =>
                    !isPositiveWinsBts || !/^low_risk\.\d+\.name$/.test(key)
                )
                .map(([key, raw]) => {
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
                        {formatScalarDisplay(raw.expected)}
                      </span>
                      <span className="text-xs font-mono text-zinc-700 text-right tabular-nums">
                        {formatScalarDisplay(raw.stored)}
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

        {ageGroups && Object.keys(ageGroups).length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 text-xs font-medium text-zinc-800">
              Who is in each age group
            </div>
            <div className="divide-y divide-zinc-100">
              {Object.entries(ageGroups).map(([group, raw]) => {
                const groupData =
                  raw && typeof raw === "object"
                    ? (raw as Record<string, unknown>)
                    : null;
                const count =
                  groupData && typeof groupData.count === "number"
                    ? groupData.count
                    : null;
                const people = Array.isArray(groupData?.people)
                  ? (groupData.people as Record<string, unknown>[])
                  : [];
                const open = openAgeGroups[group] ?? false;
                return (
                  <div key={group}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
                      onClick={() =>
                        setOpenAgeGroups((prev) => ({
                          ...prev,
                          [group]: !open,
                        }))
                      }
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-zinc-800">{group}</span>
                      <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                        {count == null ? "—" : `${count} people`}
                      </span>
                    </button>
                    {open && (
                      <div className="px-3 pb-3 overflow-x-auto">
                        {people.length === 0 ? (
                          <p className="text-[11px] text-zinc-500 px-1">No one in this group.</p>
                        ) : (
                          <table className="w-full text-[11px] text-left">
                            <thead>
                              <tr className="text-zinc-500 border-b border-zinc-100">
                                <th className="py-1.5 pr-3 font-medium">Name</th>
                                <th className="py-1.5 pr-3 font-medium">User ID</th>
                                <th className="py-1.5 pr-3 font-medium">Age used</th>
                                <th className="py-1.5 pr-3 font-medium">Age source</th>
                                <th className="py-1.5 font-medium">Date of birth</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50">
                              {people.map((person, idx) => (
                                <tr key={`${String(person.user_id)}-${idx}`}>
                                  <td className="py-1.5 pr-3 text-zinc-800">
                                    {person.name == null ? "—" : String(person.name)}
                                  </td>
                                  <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                                    {person.user_id == null ? "—" : String(person.user_id)}
                                  </td>
                                  <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                                    {person.age_used == null ? "—" : String(person.age_used)}
                                  </td>
                                  <td className="py-1.5 pr-3 text-zinc-700">
                                    {formatAgeSource(person.age_source)}
                                  </td>
                                  <td className="py-1.5 text-zinc-700 tabular-nums">
                                    {person.date_of_birth == null
                                      ? "—"
                                      : String(person.date_of_birth)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {orsBands && Object.keys(orsBands).length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 text-xs font-medium text-zinc-800">
              {bandsSectionTitle}
            </div>
            <div className="divide-y divide-zinc-100">
              {Object.entries(orsBands).map(([band, raw]) => {
                const groupData =
                  raw && typeof raw === "object"
                    ? (raw as Record<string, unknown>)
                    : null;
                const count =
                  groupData && typeof groupData.count === "number"
                    ? groupData.count
                    : null;
                const rangeLabel =
                  groupData && typeof groupData.score_range_label === "string"
                    ? groupData.score_range_label
                    : null;
                const people = Array.isArray(groupData?.people)
                  ? (groupData.people as Record<string, unknown>[])
                  : [];
                const open = openOrsBands[band] ?? false;
                return (
                  <div key={band}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
                      onClick={() =>
                        setOpenOrsBands((prev) => ({
                          ...prev,
                          [band]: !open,
                        }))
                      }
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-zinc-800">
                        {formatOrsBandLabel(band)}
                      </span>
                      {rangeLabel && (
                        <span className="text-[11px] text-zinc-500">
                          {scoreBandLabel} {rangeLabel}
                        </span>
                      )}
                      <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                        {count == null ? "—" : `${count} people`}
                      </span>
                    </button>
                    {open && (
                      <div className="px-3 pb-3 overflow-x-auto">
                        {people.length === 0 ? (
                          <p className="text-[11px] text-zinc-500 px-1">No one in this group.</p>
                        ) : (
                          <table className="w-full text-[11px] text-left">
                            <thead>
                              <tr className="text-zinc-500 border-b border-zinc-100">
                                <th className="py-1.5 pr-3 font-medium">Name</th>
                                <th className="py-1.5 pr-3 font-medium">User ID</th>
                                <th className="py-1.5 font-medium">
                                  {isOxidativeStressBts
                                    ? "Oxidative stress score"
                                    : "Metabolic score"}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50">
                              {people.map((person, idx) => (
                                <tr key={`${String(person.user_id)}-${idx}`}>
                                  <td className="py-1.5 pr-3 text-zinc-800">
                                    {person.name == null ? "—" : String(person.name)}
                                  </td>
                                  <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                                    {person.user_id == null ? "—" : String(person.user_id)}
                                  </td>
                                  <td className="py-1.5 text-zinc-700 tabular-nums">
                                    {person.oxidative_stress_score != null
                                      ? String(person.oxidative_stress_score)
                                      : person.metabolic_score == null
                                        ? "—"
                                        : String(person.metabolic_score)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {orsExcludedPeople.length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 bg-zinc-50"
              onClick={() => setOpenOrsExcluded((prev) => !prev)}
            >
              {openOrsExcluded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-zinc-800">
                Not included in this chart
              </span>
              <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                {orsExcludedPeople.length} people
              </span>
            </button>
            {openOrsExcluded && (
              <div className="px-3 pb-3 overflow-x-auto border-t border-zinc-100">
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-100">
                      <th className="py-1.5 pr-3 font-medium">Name</th>
                      <th className="py-1.5 pr-3 font-medium">User ID</th>
                      <th className="py-1.5 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {orsExcludedPeople.map((person, idx) => (
                      <tr key={`${String(person.user_id)}-${idx}`}>
                        <td className="py-1.5 pr-3 text-zinc-800">
                          {person.name == null ? "—" : String(person.name)}
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                          {person.user_id == null ? "—" : String(person.user_id)}
                        </td>
                        <td className="py-1.5 text-zinc-700">
                          {person.reason == null ? "—" : String(person.reason)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {diseaseBtsDetails && Object.keys(diseaseBtsDetails).length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 text-xs font-medium text-zinc-800">
              Disease risk by gender
            </div>
            <div className="divide-y divide-zinc-100">
              {Object.entries(diseaseBtsDetails).map(([code, raw]) => {
                const diseaseData =
                  raw && typeof raw === "object"
                    ? (raw as Record<string, unknown>)
                    : null;
                if (!diseaseData) return null;
                const label =
                  typeof diseaseData.label === "string"
                    ? diseaseData.label
                    : code.replace(/_/g, " ");
                const maleData =
                  diseaseData.male && typeof diseaseData.male === "object"
                    ? (diseaseData.male as Record<string, unknown>)
                    : null;
                const femaleData =
                  diseaseData.female && typeof diseaseData.female === "object"
                    ? (diseaseData.female as Record<string, unknown>)
                    : null;
                const maleTotal =
                  maleData && typeof maleData.total_responded === "number"
                    ? maleData.total_responded
                    : 0;
                const femaleTotal =
                  femaleData && typeof femaleData.total_responded === "number"
                    ? femaleData.total_responded
                    : 0;
                const diseaseNotes = Array.isArray(diseaseData.notes)
                  ? diseaseData.notes.filter((n): n is string => typeof n === "string")
                  : [];
                const notCounted = Array.isArray(diseaseData.not_counted)
                  ? (diseaseData.not_counted as Record<string, unknown>[])
                  : [];
                const openDisease = openDiseasePanels[code] ?? false;

                return (
                  <div key={code}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
                      onClick={() =>
                        setOpenDiseasePanels((prev) => ({
                          ...prev,
                          [code]: !openDisease,
                        }))
                      }
                    >
                      {openDisease ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-zinc-800">{label}</span>
                      <span className="text-[11px] text-zinc-500 ml-auto tabular-nums">
                        {maleTotal} men · {femaleTotal} women
                      </span>
                    </button>
                    {openDisease && (
                      <div className="px-3 pb-3 space-y-3 border-t border-zinc-100">
                        {diseaseNotes.length > 0 && (
                          <ul className="space-y-1 pt-2">
                            {diseaseNotes.map((note) => (
                              <li
                                key={note}
                                className="text-[11px] text-zinc-600 leading-relaxed"
                              >
                                {note}
                              </li>
                            ))}
                          </ul>
                        )}
                        {(["male", "female"] as const).map((gender) => {
                          const genderData =
                            gender === "male" ? maleData : femaleData;
                          if (!genderData) return null;
                          const genderLabel = gender === "male" ? "Men" : "Women";
                          const groups =
                            genderData.groups && typeof genderData.groups === "object"
                              ? (genderData.groups as Record<string, Record<string, unknown>>)
                              : null;
                          const percentMath =
                            genderData.percent_math &&
                            typeof genderData.percent_math === "object"
                              ? (genderData.percent_math as Record<string, unknown>)
                              : null;
                          const elevatedMathGender =
                            genderData.elevated_math &&
                            typeof genderData.elevated_math === "object"
                              ? (genderData.elevated_math as Record<string, unknown>)
                              : null;
                          const elevatedSteps = Array.isArray(elevatedMathGender?.steps)
                            ? elevatedMathGender.steps.filter(
                                (s): s is string => typeof s === "string"
                              )
                            : [];
                          const percentMathKey = `${code}:${gender}:percent`;
                          const openPercent = openDiseasePercentMath[percentMathKey] ?? false;

                          return (
                            <div
                              key={`${code}-${gender}`}
                              className="rounded-lg border border-zinc-200 bg-zinc-50/50"
                            >
                              <div className="px-3 py-2 text-xs font-medium text-zinc-800">
                                {genderLabel}
                              </div>
                              {elevatedSteps.length > 0 && (
                                <div className="px-3 pb-2 space-y-1">
                                  <p className="text-[11px] font-medium text-zinc-700">
                                    {elevatedMathTitle}
                                  </p>
                                  {typeof elevatedMathGender?.result_percent === "number" && (
                                    <p className="text-[11px] text-zinc-600">
                                      Result:{" "}
                                      <span className="font-medium tabular-nums">
                                        {elevatedMathGender.result_percent}%
                                      </span>
                                    </p>
                                  )}
                                  <ol className="space-y-1 list-none">
                                    {elevatedSteps.map((step) => (
                                      <li
                                        key={step}
                                        className="text-[11px] text-zinc-700 leading-relaxed"
                                      >
                                        {step}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                              {percentMath && Object.keys(percentMath).length > 0 && (
                                <div className="px-3 pb-2">
                                  <button
                                    type="button"
                                    className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 hover:text-zinc-900"
                                    onClick={() =>
                                      setOpenDiseasePercentMath((prev) => ({
                                        ...prev,
                                        [percentMathKey]: !openPercent,
                                      }))
                                    }
                                  >
                                    {openPercent ? (
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                    Band shares — step by step
                                  </button>
                                  {openPercent && (
                                    <div className="mt-2 space-y-2">
                                      {Object.entries(percentMath).map(([band, mathRaw]) => {
                                        const math =
                                          mathRaw && typeof mathRaw === "object"
                                            ? (mathRaw as Record<string, unknown>)
                                            : null;
                                        const steps = Array.isArray(math?.steps)
                                          ? math.steps.filter(
                                              (s): s is string => typeof s === "string"
                                            )
                                          : [];
                                        if (steps.length === 0) return null;
                                        return (
                                          <div
                                            key={band}
                                            className="rounded border border-zinc-200 bg-white px-2 py-1.5"
                                          >
                                            <p className="text-[11px] font-medium text-zinc-800">
                                              {formatOrsBandLabel(band)}
                                            </p>
                                            <ol className="mt-1 space-y-0.5 list-none">
                                              {steps.map((step) => (
                                                <li
                                                  key={step}
                                                  className="text-[10px] text-zinc-600 leading-relaxed"
                                                >
                                                  {step}
                                                </li>
                                              ))}
                                            </ol>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                              {groups && (
                                <div className="divide-y divide-zinc-100 border-t border-zinc-200">
                                  {Object.entries(groups).map(([band, groupRaw]) => {
                                    const groupData =
                                      groupRaw && typeof groupRaw === "object"
                                        ? (groupRaw as Record<string, unknown>)
                                        : null;
                                    const count =
                                      groupData && typeof groupData.count === "number"
                                        ? groupData.count
                                        : null;
                                    const rangeLabel =
                                      groupData &&
                                      typeof groupData.score_range_label === "string"
                                        ? groupData.score_range_label
                                        : null;
                                    const people = Array.isArray(groupData?.people)
                                      ? (groupData.people as Record<string, unknown>[])
                                      : [];
                                    const accordionKey = `${code}:${gender}:${band}`;
                                    const openGroup = openDiseaseGroups[accordionKey] ?? false;
                                    return (
                                      <div key={accordionKey}>
                                        <button
                                          type="button"
                                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50"
                                          onClick={() =>
                                            setOpenDiseaseGroups((prev) => ({
                                              ...prev,
                                              [accordionKey]: !openGroup,
                                            }))
                                          }
                                        >
                                          {openGroup ? (
                                            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                          ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                          )}
                                          <span className="text-[11px] font-medium text-zinc-800">
                                            {formatOrsBandLabel(band)}
                                          </span>
                                          {rangeLabel && (
                                            <span className="text-[10px] text-zinc-500">
                                              {scoreBandLabel} {rangeLabel}
                                            </span>
                                          )}
                                          <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">
                                            {count == null ? "—" : `${count} people`}
                                          </span>
                                        </button>
                                        {openGroup && (
                                          <div className="px-3 pb-2 overflow-x-auto">
                                            {people.length === 0 ? (
                                              <p className="text-[10px] text-zinc-500 px-1">
                                                No one in this group.
                                              </p>
                                            ) : (
                                              <table className="w-full text-[10px] text-left">
                                                <thead>
                                                  <tr className="text-zinc-500 border-b border-zinc-100">
                                                    <th className="py-1 pr-2 font-medium">Name</th>
                                                    <th className="py-1 pr-2 font-medium">User ID</th>
                                                    <th className="py-1 pr-2 font-medium">
                                                      Risk score
                                                    </th>
                                                    <th className="py-1 font-medium">
                                                      Report code
                                                    </th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-50">
                                                  {people.map((person, idx) => (
                                                    <tr key={`${String(person.user_id)}-${idx}`}>
                                                      <td className="py-1 pr-2 text-zinc-800">
                                                        {person.name == null
                                                          ? "—"
                                                          : String(person.name)}
                                                      </td>
                                                      <td className="py-1 pr-2 text-zinc-700 tabular-nums">
                                                        {person.user_id == null
                                                          ? "—"
                                                          : String(person.user_id)}
                                                      </td>
                                                      <td className="py-1 pr-2 text-zinc-700 tabular-nums">
                                                        {person.risk_score == null
                                                          ? "—"
                                                          : String(person.risk_score)}
                                                      </td>
                                                      <td className="py-1 text-zinc-700">
                                                        {person.report_code == null
                                                          ? code
                                                          : String(person.report_code)}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
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
                        })}
                        {notCounted.length > 0 && (
                          <div className="rounded border border-zinc-200 bg-white overflow-hidden">
                            <div className="px-3 py-2 bg-zinc-50 text-[11px] font-medium text-zinc-800">
                              Not counted for this disease ({notCounted.length})
                            </div>
                            <div className="px-3 pb-2 overflow-x-auto">
                              <table className="w-full text-[10px] text-left">
                                <thead>
                                  <tr className="text-zinc-500 border-b border-zinc-100">
                                    <th className="py-1 pr-2 font-medium">Name</th>
                                    <th className="py-1 pr-2 font-medium">User ID</th>
                                    <th className="py-1 font-medium">Reason</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-50">
                                  {notCounted.map((person, idx) => (
                                    <tr key={`${String(person.user_id)}-${idx}`}>
                                      <td className="py-1 pr-2 text-zinc-800">
                                        {person.name == null ? "—" : String(person.name)}
                                      </td>
                                      <td className="py-1 pr-2 text-zinc-700 tabular-nums">
                                        {person.user_id == null
                                          ? "—"
                                          : String(person.user_id)}
                                      </td>
                                      <td className="py-1 text-zinc-700">
                                        {person.reason == null ? "—" : String(person.reason)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isPositiveWinsBts && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 text-xs font-medium text-zinc-800">
              Positive Wins breakdown
            </div>
            <div className="divide-y divide-zinc-100">
              {(
                [
                  {
                    key: "low_risk",
                    title: "Top healthy diseases",
                    data: positiveWinsLowRisk,
                    peopleKeyPrefix: "low_risk",
                  },
                  {
                    key: "healthy_habits",
                    title: "Top healthy habits",
                    data: positiveWinsHabits,
                    peopleKeyPrefix: "habits",
                  },
                  {
                    key: "healthy_profiles",
                    title: "Top healthy blood profiles",
                    data: positiveWinsProfiles,
                    peopleKeyPrefix: "profiles",
                  },
                ] as const
              ).map(({ key, title, data, peopleKeyPrefix }) => {
                if (!data) return null;
                const selectionMath =
                  data.selection_math && typeof data.selection_math === "object"
                    ? (data.selection_math as Record<string, unknown>)
                    : null;
                const selectionSteps = Array.isArray(selectionMath?.steps)
                  ? selectionMath.steps.filter((s): s is string => typeof s === "string")
                  : [];
                const selected = Array.isArray(data.selected)
                  ? (data.selected as Record<string, unknown>[])
                  : [];
                const ranking = Array.isArray(data.ranking)
                  ? (data.ranking as Record<string, unknown>[])
                  : [];
                const perPersonRule =
                  typeof data.per_person_rule === "string" ? data.per_person_rule : null;
                const openSection = openPositiveWinsSections[key] ?? false;

                return (
                  <div key={key}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
                      onClick={() =>
                        setOpenPositiveWinsSections((prev) => ({
                          ...prev,
                          [key]: !openSection,
                        }))
                      }
                    >
                      {openSection ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-zinc-800">{title}</span>
                      <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">
                        {selected.length} on chart
                      </span>
                    </button>
                    {openSection && (
                      <div className="px-3 pb-3 space-y-3 border-t border-zinc-100">
                        {perPersonRule && (
                          <p className="text-[11px] text-zinc-600 leading-relaxed pt-2">
                            Per person: {perPersonRule}
                          </p>
                        )}
                        {selectionSteps.length > 0 && (
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 space-y-1">
                            <p className="text-[11px] font-medium text-zinc-800">
                              How we picked the camp top 3
                            </p>
                            <ol className="space-y-1 list-none">
                              {selectionSteps.map((step) => (
                                <li
                                  key={step}
                                  className="text-[11px] text-zinc-700 leading-relaxed"
                                >
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {selected.length > 0 && (
                          <div className="space-y-2">
                            {selected.map((item, idx) => {
                              const people = Array.isArray(item.people)
                                ? (item.people as Record<string, unknown>[])
                                : [];
                              const itemKey =
                                key === "low_risk"
                                  ? String(item.code ?? idx)
                                  : key === "healthy_habits"
                                    ? String(item.habit_label ?? idx)
                                    : String(item.profile_name ?? idx);
                              const accordionKey = `${peopleKeyPrefix}:${itemKey}`;
                              const openPeople = openPositiveWinsPeople[accordionKey] ?? false;
                              const label =
                                key === "low_risk"
                                  ? String(item.name ?? item.code ?? "—")
                                  : key === "healthy_habits"
                                    ? String(item.habit_label ?? "—")
                                    : String(item.profile_name ?? "—");
                              const count =
                                typeof item.count === "number" ? item.count : people.length;
                              const riskScoreMath =
                                key === "low_risk" &&
                                item.risk_score_scaled_math &&
                                typeof item.risk_score_scaled_math === "object"
                                  ? (item.risk_score_scaled_math as Record<string, unknown>)
                                  : null;
                              const riskScoreMathSteps = Array.isArray(riskScoreMath?.steps)
                                ? riskScoreMath.steps.filter(
                                    (s): s is string => typeof s === "string"
                                  )
                                : [];
                              const riskScoreMathKey = `${accordionKey}:score-math`;
                              const openRiskScoreMath =
                                openPositiveWinsPeople[riskScoreMathKey] ?? false;

                              return (
                                <div
                                  key={accordionKey}
                                  className="rounded border border-zinc-200 bg-white overflow-hidden"
                                >
                                  <button
                                    type="button"
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50"
                                    onClick={() =>
                                      setOpenPositiveWinsPeople((prev) => ({
                                        ...prev,
                                        [accordionKey]: !openPeople,
                                      }))
                                    }
                                  >
                                    {openPeople ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                    )}
                                    <span className="text-[11px] font-medium text-zinc-800">
                                      {label}
                                    </span>
                                    <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">
                                      {count} people
                                    </span>
                                  </button>
                                  {openPeople && (
                                    <div className="px-3 pb-2 overflow-x-auto border-t border-zinc-100 space-y-2 pt-2">
                                      {riskScoreMathSteps.length > 0 && (
                                        <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                                          <button
                                            type="button"
                                            className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-700 hover:text-zinc-900"
                                            onClick={() =>
                                              setOpenPositiveWinsPeople((prev) => ({
                                                ...prev,
                                                [riskScoreMathKey]: !openRiskScoreMath,
                                              }))
                                            }
                                          >
                                            {openRiskScoreMath ? (
                                              <ChevronDown className="w-3 h-3" />
                                            ) : (
                                              <ChevronRight className="w-3 h-3" />
                                            )}
                                            Risk score on chart — step by step
                                            {riskScoreMath?.result != null && (
                                              <span className="text-zinc-500 font-normal tabular-nums ml-1">
                                                ({String(riskScoreMath.result)})
                                              </span>
                                            )}
                                          </button>
                                          {openRiskScoreMath && (
                                            <ol className="mt-1.5 space-y-0.5 list-none">
                                              {riskScoreMathSteps.map((step) => (
                                                <li
                                                  key={step}
                                                  className="text-[10px] text-zinc-600 leading-relaxed"
                                                >
                                                  {step}
                                                </li>
                                              ))}
                                            </ol>
                                          )}
                                        </div>
                                      )}
                                      {people.length === 0 ? (
                                        <p className="text-[10px] text-zinc-500 py-1">
                                          No contributors listed.
                                        </p>
                                      ) : (
                                        <table className="w-full text-[10px] text-left">
                                          <thead>
                                            <tr className="text-zinc-500 border-b border-zinc-100">
                                              <th className="py-1 pr-2 font-medium">Name</th>
                                              <th className="py-1 pr-2 font-medium">User ID</th>
                                              {key === "low_risk" && (
                                                <th className="py-1 font-medium">Risk score</th>
                                              )}
                                              {key === "healthy_habits" && (
                                                <th className="py-1 font-medium">Habit key</th>
                                              )}
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-zinc-50">
                                            {people.map((person, pIdx) => (
                                              <tr key={`${String(person.user_id)}-${pIdx}`}>
                                                <td className="py-1 pr-2 text-zinc-800">
                                                  {person.name == null
                                                    ? "—"
                                                    : String(person.name)}
                                                </td>
                                                <td className="py-1 pr-2 text-zinc-700 tabular-nums">
                                                  {person.user_id == null
                                                    ? "—"
                                                    : String(person.user_id)}
                                                </td>
                                                {key === "low_risk" && (
                                                  <td className="py-1 text-zinc-700 tabular-nums">
                                                    {person.risk_score_scaled == null
                                                      ? "—"
                                                      : String(person.risk_score_scaled)}
                                                  </td>
                                                )}
                                                {key === "healthy_habits" && (
                                                  <td className="py-1 text-zinc-700">
                                                    {item.habit_key == null
                                                      ? "—"
                                                      : String(item.habit_key)}
                                                  </td>
                                                )}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {ranking.length > selected.length && (
                          <p className="text-[10px] text-zinc-500">
                            {ranking.length - selected.length} more item(s) were counted but
                            not shown because we only keep the top 3 on the chart.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isPositiveWinsBts && positiveWinsParticipants.length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 bg-zinc-50"
              onClick={() => setOpenPositiveWinsParticipants((prev) => !prev)}
            >
              {openPositiveWinsParticipants ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-zinc-800">
                Each person&apos;s lists
              </span>
              <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                {positiveWinsParticipants.length} people
              </span>
            </button>
            {openPositiveWinsParticipants && (
              <div className="px-3 pb-3 overflow-x-auto border-t border-zinc-100 space-y-3 pt-2">
                {positiveWinsParticipants.map((person, idx) => {
                  const personNotes =
                    person.notes && typeof person.notes === "object"
                      ? (person.notes as Record<string, unknown>)
                      : null;
                  const lowRiskMath =
                    person.low_risk_math && typeof person.low_risk_math === "object"
                      ? (person.low_risk_math as Record<string, unknown>)
                      : null;
                  const lowRiskMathSteps = Array.isArray(lowRiskMath?.steps)
                    ? lowRiskMath.steps.filter((s): s is string => typeof s === "string")
                    : [];
                  const lowRiskByDisease =
                    lowRiskMath?.by_disease && typeof lowRiskMath.by_disease === "object"
                      ? (lowRiskMath.by_disease as Record<string, Record<string, unknown>>)
                      : null;
                  return (
                    <div
                      key={`${String(person.user_id)}-${idx}`}
                      className="rounded border border-zinc-200 bg-zinc-50/50 px-3 py-2"
                    >
                      <p className="text-[11px] font-medium text-zinc-800">
                        {person.name == null ? "—" : String(person.name)}
                        <span className="text-zinc-500 font-normal ml-2 tabular-nums">
                          ID {person.user_id == null ? "—" : String(person.user_id)}
                        </span>
                      </p>
                      {lowRiskMathSteps.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {lowRiskMathSteps.map((step) => (
                            <li
                              key={step}
                              className="text-[10px] text-zinc-600 leading-relaxed"
                            >
                              {step}
                            </li>
                          ))}
                        </ul>
                      )}
                      {lowRiskByDisease &&
                        Object.entries(lowRiskByDisease).map(([code, diseaseMath]) => {
                          const diseaseSteps = Array.isArray(diseaseMath.steps)
                            ? diseaseMath.steps.filter(
                                (s): s is string => typeof s === "string"
                              )
                            : [];
                          if (diseaseSteps.length === 0) return null;
                          const diseaseName =
                            typeof diseaseMath.name === "string"
                              ? diseaseMath.name
                              : code;
                          return (
                            <div
                              key={`${String(person.user_id)}-${code}`}
                              className="mt-2 rounded border border-zinc-200 bg-white px-2 py-1.5"
                            >
                              <p className="text-[10px] font-medium text-zinc-800">
                                {diseaseName} ({code}) — risk_score_scaled step by step
                                {diseaseMath.result != null && (
                                  <span className="text-zinc-500 font-normal tabular-nums ml-1">
                                    ({String(diseaseMath.result)})
                                  </span>
                                )}
                              </p>
                              <ol className="mt-1 space-y-0.5 list-none">
                                {diseaseSteps.map((step) => (
                                  <li
                                    key={step}
                                    className="text-[10px] text-zinc-600 leading-relaxed"
                                  >
                                    {step}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          );
                        })}
                      {personNotes && (
                        <ul className="mt-1 space-y-0.5">
                          {(["low_risk", "healthy_habits", "healthy_profiles"] as const).map(
                            (bucket) => {
                              const note = personNotes[bucket];
                              if (typeof note !== "string" || !note) return null;
                              return (
                                <li
                                  key={bucket}
                                  className="text-[10px] text-amber-800 leading-relaxed"
                                >
                                  {note}
                                </li>
                              );
                            }
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isCompanyAverageScoresBts && companyAverageSummary && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-medium text-zinc-800">Summary</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-zinc-600">
              <span>Total enrolled in scope</span>
              <span className="tabular-nums text-right">
                {String(companyAverageSummary.total_enrolled ?? "—")}
              </span>
              <span>With FitPrint (used in averages)</span>
              <span className="tabular-nums text-right">
                {String(companyAverageSummary.with_fitprint ?? "—")}
              </span>
              <span>Without FitPrint</span>
              <span className="tabular-nums text-right">
                {String(companyAverageSummary.without_fitprint ?? "—")}
              </span>
              <span>Skipped due to report error</span>
              <span className="tabular-nums text-right">
                {String(companyAverageSummary.skipped_report_errors ?? "—")}
              </span>
            </div>
          </div>
        )}

        {isCompanyAverageScoresBts && companyAverageAggregation && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 text-xs font-medium text-zinc-800">
              How each average was calculated
            </div>
            <div className="divide-y divide-zinc-100">
              {(["nutrition", "fitness", "lifestyle"] as const).map((categoryKey) => {
                const categoryData = companyAverageAggregation[categoryKey];
                if (!categoryData) return null;
                const label =
                  typeof categoryData.label === "string"
                    ? categoryData.label
                    : categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
                const steps = Array.isArray(categoryData.steps)
                  ? categoryData.steps.filter((s): s is string => typeof s === "string")
                  : [];
                const roundedScore = categoryData.rounded_score;
                const openSection = openCompanyAverageScoreSections[categoryKey] ?? false;

                return (
                  <div key={categoryKey}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
                      onClick={() =>
                        setOpenCompanyAverageScoreSections((prev) => ({
                          ...prev,
                          [categoryKey]: !openSection,
                        }))
                      }
                    >
                      {openSection ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-zinc-800">{label}</span>
                      <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">
                        Chart score: {roundedScore == null ? "—" : String(roundedScore)}
                      </span>
                    </button>
                    {openSection && steps.length > 0 && (
                      <div className="px-3 pb-3 border-t border-zinc-100">
                        <ol className="mt-2 space-y-1 list-none">
                          {steps.map((step) => (
                            <li
                              key={step}
                              className="text-[11px] text-zinc-700 leading-relaxed"
                            >
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isCompanyAverageScoresBts && companyAverageParticipants.length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 bg-zinc-50"
              onClick={() => setOpenCompanyAverageParticipants((prev) => !prev)}
            >
              {openCompanyAverageParticipants ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-zinc-800">
                Each person&apos;s scores
              </span>
              <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                {companyAverageParticipants.length} people
              </span>
            </button>
            {openCompanyAverageParticipants && (
              <div className="px-3 pb-3 overflow-x-auto border-t border-zinc-100 space-y-2 pt-2">
                {companyAverageParticipants.map((person, idx) => {
                  const personKey = `${String(person.user_id ?? idx)}-${idx}`;
                  const openPerson = openCompanyAveragePersonScores[personKey] ?? false;
                  const nutrition = person.nutrition;
                  const fitness = person.fitness;
                  const lifestyle = person.lifestyle;

                  return (
                    <div
                      key={personKey}
                      className="rounded border border-zinc-200 bg-white overflow-hidden"
                    >
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50"
                        onClick={() =>
                          setOpenCompanyAveragePersonScores((prev) => ({
                            ...prev,
                            [personKey]: !openPerson,
                          }))
                        }
                      >
                        {openPerson ? (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        )}
                        <span className="text-[11px] font-medium text-zinc-800">
                          {person.name == null ? "—" : String(person.name)}
                        </span>
                        <span className="text-[10px] text-zinc-500 tabular-nums ml-auto">
                          N {formatCompanyAverageScoreCell(nutrition)} · F{" "}
                          {formatCompanyAverageScoreCell(fitness)} · L{" "}
                          {formatCompanyAverageScoreCell(lifestyle)}
                        </span>
                      </button>
                      {openPerson && (
                        <div className="px-3 pb-2 border-t border-zinc-100 space-y-2 pt-2">
                          <p className="text-[10px] text-zinc-500 tabular-nums">
                            User ID {person.user_id == null ? "—" : String(person.user_id)}
                            {person.assessment_instance_id != null && (
                              <>
                                {" "}
                                · FitPrint assessment{" "}
                                {String(person.assessment_instance_id)}
                              </>
                            )}
                          </p>
                          {(["nutrition", "fitness", "lifestyle"] as const).map((categoryKey) => {
                            const category = person[categoryKey];
                            if (!category || typeof category !== "object") return null;
                            const categoryRecord = category as Record<string, unknown>;
                            const steps = Array.isArray(categoryRecord.steps)
                              ? categoryRecord.steps.filter(
                                  (s): s is string => typeof s === "string"
                                )
                              : [];
                            const categoryLabel =
                              categoryKey === "nutrition"
                                ? "Nutrition"
                                : categoryKey === "fitness"
                                  ? "Fitness"
                                  : "Lifestyle";
                            return (
                              <div
                                key={`${personKey}-${categoryKey}`}
                                className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5"
                              >
                                <p
                                  className={`text-[10px] font-medium ${companyAverageScoreStatusClass(category)}`}
                                >
                                  {categoryLabel}: {formatCompanyAverageScoreCell(category)}
                                </p>
                                {steps.length > 0 && (
                                  <ul className="mt-1 space-y-0.5">
                                    {steps.map((step) => (
                                      <li
                                        key={step}
                                        className="text-[10px] text-zinc-600 leading-relaxed"
                                      >
                                        {step}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isCompanyAverageScoresBts && companyAverageExcludedTotal > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 bg-zinc-50"
              onClick={() => setOpenCompanyAverageExcluded((prev) => !prev)}
            >
              {openCompanyAverageExcluded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-zinc-800">Excluded people</span>
              <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                {companyAverageExcludedTotal}
              </span>
            </button>
            {openCompanyAverageExcluded && (
              <div className="px-3 pb-3 border-t border-zinc-100 space-y-3 pt-2">
                {companyAverageExcludedNoFitprint.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-zinc-800 mb-1">
                      No FitPrint assessment
                    </p>
                    <table className="w-full text-[11px] text-left">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-100">
                          <th className="py-1.5 pr-3 font-medium">Name</th>
                          <th className="py-1.5 pr-3 font-medium">User ID</th>
                          <th className="py-1.5 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {companyAverageExcludedNoFitprint.map((person, idx) => (
                          <tr key={`no-fp-${String(person.user_id)}-${idx}`}>
                            <td className="py-1.5 pr-3 text-zinc-800">
                              {person.name == null ? "—" : String(person.name)}
                            </td>
                            <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                              {person.user_id == null ? "—" : String(person.user_id)}
                            </td>
                            <td className="py-1.5 text-zinc-600">
                              {person.reason == null ? "—" : String(person.reason)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {companyAverageExcludedReportFailed.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-zinc-800 mb-1">
                      Report could not load
                    </p>
                    <table className="w-full text-[11px] text-left">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-100">
                          <th className="py-1.5 pr-3 font-medium">Name</th>
                          <th className="py-1.5 pr-3 font-medium">User ID</th>
                          <th className="py-1.5 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {companyAverageExcludedReportFailed.map((person, idx) => (
                          <tr key={`load-fail-${String(person.user_id)}-${idx}`}>
                            <td className="py-1.5 pr-3 text-zinc-800">
                              {person.name == null ? "—" : String(person.name)}
                            </td>
                            <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                              {person.user_id == null ? "—" : String(person.user_id)}
                            </td>
                            <td className="py-1.5 text-zinc-600">
                              {person.reason == null ? "—" : String(person.reason)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isCompanyAverageScoresBts && companyAverageNotes.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-medium text-zinc-800">Notes</p>
            {companyAverageNotes.map((note) => (
              <p key={note} className="text-[12px] text-zinc-600 leading-relaxed">
                {note}
              </p>
            ))}
          </div>
        )}

        {unknownGenderPeople.length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 text-xs font-medium text-zinc-800">
              Unknown gender ({unknownGenderPeople.length})
            </div>
            <div className="px-3 pb-3 overflow-x-auto">
              <table className="w-full text-[11px] text-left">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-100">
                    <th className="py-1.5 pr-3 font-medium">Name</th>
                    <th className="py-1.5 pr-3 font-medium">User ID</th>
                    <th className="py-1.5 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {unknownGenderPeople.map((person, idx) => (
                    <tr key={`${String(person.user_id)}-${idx}`}>
                      <td className="py-1.5 pr-3 text-zinc-800">
                        {person.name == null ? "—" : String(person.name)}
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                        {person.user_id == null ? "—" : String(person.user_id)}
                      </td>
                      <td className="py-1.5 text-zinc-700">
                        {person.reason == null ? "—" : String(person.reason)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {riskPeople.length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 bg-zinc-50"
              onClick={() => setOpenRiskPeople((prev) => !prev)}
            >
              {openRiskPeople ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-zinc-800">
                People by risk group (body age vs actual age)
              </span>
              <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                {riskPeople.length} people
              </span>
            </button>
            {openRiskPeople && (
              <div className="px-3 pb-3 overflow-x-auto border-t border-zinc-100">
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-100">
                      <th className="py-1.5 pr-3 font-medium">Name</th>
                      <th className="py-1.5 pr-3 font-medium">Actual age</th>
                      <th className="py-1.5 pr-3 font-medium">Body age</th>
                      <th className="py-1.5 pr-3 font-medium">Difference</th>
                      <th className="py-1.5 font-medium">Group</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {riskPeople.map((person, idx) => (
                      <tr key={`${String(person.user_id)}-${idx}`}>
                        <td className="py-1.5 pr-3 text-zinc-800">
                          {person.name == null ? "—" : String(person.name)}
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                          {person.actual_age == null ? "—" : String(person.actual_age)}
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                          {person.metabolic_age == null ? "—" : String(person.metabolic_age)}
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                          {person.gap_years == null ? "—" : String(person.gap_years)}
                        </td>
                        <td className="py-1.5 text-zinc-700">
                          {formatRiskGroupLabel(person.risk_group)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {qgdComparison && typeof qgdComparison.summary === "string" && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
            <p className="text-xs font-medium text-zinc-800 mb-1">How totals compare</p>
            <p className="text-[12px] text-zinc-700 leading-relaxed">{qgdComparison.summary}</p>
          </div>
        )}

        {qgdGroups && Object.keys(qgdGroups).length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 text-xs font-medium text-zinc-800">
              Who is on the chart
            </div>
            <div className="divide-y divide-zinc-100">
              {(["male", "female"] as const).flatMap((gender) =>
                Object.entries(qgdGroups[gender] ?? {}).map(([bucket, raw]) => {
                  const groupData =
                    raw && typeof raw === "object"
                      ? (raw as Record<string, unknown>)
                      : null;
                  const count =
                    groupData && typeof groupData.count === "number"
                      ? groupData.count
                      : null;
                  const people = Array.isArray(groupData?.people)
                    ? (groupData.people as Record<string, unknown>[])
                    : [];
                  const accordionKey = `${gender}:${bucket}`;
                  const open = openQgdGroups[accordionKey] ?? false;
                  const genderLabel = gender === "male" ? "Men" : "Women";
                  return (
                    <div key={accordionKey}>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
                        onClick={() =>
                          setOpenQgdGroups((prev) => ({
                            ...prev,
                            [accordionKey]: !open,
                          }))
                        }
                      >
                        {open ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium text-zinc-800">
                          {genderLabel} · {formatQgdGroupLabel(bucket)}
                        </span>
                        <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                          {count == null ? "—" : `${count} people`}
                        </span>
                      </button>
                      {open && (
                        <div className="px-3 pb-3 overflow-x-auto">
                          {people.length === 0 ? (
                            <p className="text-[11px] text-zinc-500 px-1">No one in this group.</p>
                          ) : (
                            <table className="w-full text-[11px] text-left">
                              <thead>
                                <tr className="text-zinc-500 border-b border-zinc-100">
                                  <th className="py-1.5 pr-3 font-medium">Name</th>
                                  <th className="py-1.5 pr-3 font-medium">User ID</th>
                                  <th className="py-1.5 font-medium">Answer</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-50">
                                {people.map((person, idx) => (
                                  <tr key={`${String(person.user_id)}-${idx}`}>
                                    <td className="py-1.5 pr-3 text-zinc-800">
                                      {person.name == null ? "—" : String(person.name)}
                                    </td>
                                    <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                                      {person.user_id == null ? "—" : String(person.user_id)}
                                    </td>
                                    <td className="py-1.5 text-zinc-700">
                                      {person.answer_label == null
                                        ? "—"
                                        : String(person.answer_label)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {qgdExceptions &&
          qgdExceptionSections.map(({ key, title, showAnswer }) => {
            const people = Array.isArray(qgdExceptions[key]) ? qgdExceptions[key] : [];
            if (people.length === 0) return null;
            const open = openQgdExceptions[key] ?? false;
            return (
              <div key={key} className="rounded-lg border border-zinc-200 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 bg-zinc-50"
                  onClick={() =>
                    setOpenQgdExceptions((prev) => ({
                      ...prev,
                      [key]: !open,
                    }))
                  }
                >
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                  <span className="text-xs font-medium text-zinc-800">{title}</span>
                  <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                    {people.length} people
                  </span>
                </button>
                {open && (
                  <div className="px-3 pb-3 overflow-x-auto border-t border-zinc-100">
                    <table className="w-full text-[11px] text-left">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-100">
                          <th className="py-1.5 pr-3 font-medium">Name</th>
                          <th className="py-1.5 pr-3 font-medium">User ID</th>
                          {showAnswer && (
                            <th className="py-1.5 pr-3 font-medium">Answer</th>
                          )}
                          <th className="py-1.5 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {people.map((person, idx) => (
                          <tr key={`${String(person.user_id)}-${idx}`}>
                            <td className="py-1.5 pr-3 text-zinc-800 align-top">
                              {person.name == null ? "—" : String(person.name)}
                            </td>
                            <td className="py-1.5 pr-3 text-zinc-700 tabular-nums align-top">
                              {person.user_id == null ? "—" : String(person.user_id)}
                            </td>
                            {showAnswer && (
                              <td className="py-1.5 pr-3 text-zinc-700 align-top">
                                {person.answer_shown == null
                                  ? person.answer_label == null
                                    ? "—"
                                    : String(person.answer_label)
                                  : String(person.answer_shown)}
                              </td>
                            )}
                            <td className="py-1.5 text-zinc-700 align-top">
                              {person.reason == null ? "—" : String(person.reason)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

        {questionnaireByEngagement.length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 bg-zinc-50"
              onClick={() => setOpenQuestionnaireByEngagement((prev) => !prev)}
            >
              {openQuestionnaireByEngagement ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-zinc-800">
                Questionnaire filled by session
              </span>
              <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                {questionnaireDetails?.sum_filled_cards == null
                  ? `${questionnaireByEngagement.length} sessions`
                  : `Sum ${String(questionnaireDetails.sum_filled_cards)}`}
              </span>
            </button>
            {openQuestionnaireByEngagement && (
              <div className="px-3 pb-3 overflow-x-auto border-t border-zinc-100">
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-100">
                      <th className="py-1.5 pr-3 font-medium">Session</th>
                      <th className="py-1.5 pr-3 font-medium">Filled</th>
                      <th className="py-1.5 pr-3 font-medium">Partial</th>
                      <th className="py-1.5 pr-3 font-medium">Not started</th>
                      <th className="py-1.5 font-medium">Enrolled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {questionnaireByEngagement.map((row, idx) => (
                      <tr key={`${String(row.engagement_id)}-${idx}`}>
                        <td className="py-1.5 pr-3 text-zinc-800">
                          {row.engagement_name == null
                            ? `Session ${String(row.engagement_id ?? "—")}`
                            : String(row.engagement_name)}
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                          {row.filled == null ? "—" : String(row.filled)}
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                          {row.partially_filled == null ? "—" : String(row.partially_filled)}
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-700 tabular-nums">
                          {row.not_started == null ? "—" : String(row.not_started)}
                        </td>
                        <td className="py-1.5 text-zinc-700 tabular-nums">
                          {row.enrolled == null ? "—" : String(row.enrolled)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {bioAiMismatchPeople.length > 0 && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 bg-zinc-50"
              onClick={() => setOpenBioAiMismatch((prev) => !prev)}
            >
              {openBioAiMismatch ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-zinc-800">
                Questionnaire vs Bio AI mismatches
              </span>
              <span className="text-xs text-zinc-500 tabular-nums ml-auto">
                {bioAiMismatchPeople.length} people
              </span>
            </button>
            {openBioAiMismatch && (
              <div className="px-3 pb-3 overflow-x-auto border-t border-zinc-100">
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-100">
                      <th className="py-1.5 pr-3 font-medium">Name</th>
                      <th className="py-1.5 pr-3 font-medium">Questionnaire</th>
                      <th className="py-1.5 pr-3 font-medium">Bio AI</th>
                      <th className="py-1.5 font-medium">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {bioAiMismatchPeople.map((person, idx) => {
                      const reasons = Array.isArray(person.reasons)
                        ? person.reasons.filter((r): r is string => typeof r === "string")
                        : [];
                      return (
                        <tr key={`${String(person.user_id)}-${idx}`}>
                          <td className="py-1.5 pr-3 text-zinc-800 align-top">
                            {person.name == null ? "—" : String(person.name)}
                          </td>
                          <td className="py-1.5 pr-3 text-zinc-700 align-top">
                            {person.questionnaire_completed ? "Completed" : "Not completed"}
                          </td>
                          <td className="py-1.5 pr-3 text-zinc-700 align-top">
                            {person.bio_ai_report_generated ? "Generated" : "Missing"}
                          </td>
                          <td className="py-1.5 text-zinc-700 align-top">
                            {reasons.length === 0 ? "—" : reasons.join(" ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
    report: CampReportRow;
    sectionKey: string;
  } | null>(null);
  const [dashboardEditMode, setDashboardEditMode] = useState(false);
  const [dashboardEditText, setDashboardEditText] = useState("");
  const [dashboardEditError, setDashboardEditError] = useState<string | null>(null);
  const [dashboardSaving, setDashboardSaving] = useState(false);
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
            next[key] = isOverallReport(row);
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
      const rank = reportSortRank(a) - reportSortRank(b);
      if (rank !== 0) return rank;
      const cityCmp = (reportCity(a) ?? "").localeCompare(reportCity(b) ?? "");
      if (cityCmp !== 0) return cityCmp;
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
    const response = await fetchScopedDashboard(campNo, report, section.section_key);
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
      setDashboardEditMode(false);
      setDashboardEditError(null);
      setDashboardModal({
        title: section.section,
        data,
        report,
        sectionKey: section.section_key,
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
      await refreshScopedSection(campNo, report, section.section_key);

      const data = await fetchDashboard(report, section);
      setDashboardEditMode(false);
      setDashboardEditError(null);
      setDashboardModal({
        title: section.section,
        data,
        report,
        sectionKey: section.section_key,
      });
      await fetchData({ silent: true });
    } catch (err) {
      setSectionErrors((prev) => ({
        ...prev,
        [loadStateKey]: getApiError(err),
      }));
    } finally {
      setLoadingKey(null);
    }
  };

  const closeDashboardModal = () => {
    if (dashboardSaving) return;
    setDashboardModal(null);
    setDashboardEditMode(false);
    setDashboardEditText("");
    setDashboardEditError(null);
  };

  const startDashboardEdit = () => {
    if (!dashboardModal) return;
    setDashboardEditText(JSON.stringify(dashboardModal.data, null, 2));
    setDashboardEditError(null);
    setDashboardEditMode(true);
  };

  const cancelDashboardEdit = () => {
    if (dashboardSaving) return;
    setDashboardEditMode(false);
    setDashboardEditText("");
    setDashboardEditError(null);
  };

  const saveDashboardEdit = async () => {
    if (!dashboardModal) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(dashboardEditText);
    } catch {
      setDashboardEditError("Invalid JSON — fix the syntax and try again.");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      setDashboardEditError("Section payload must be a JSON object.");
      return;
    }

    const payload = parsed as Record<string, unknown>;
    setDashboardSaving(true);
    setDashboardEditError(null);

    try {
      const { report, sectionKey } = dashboardModal;
      const response = await updateScopedDashboard(campNo, report, sectionKey, payload);
      const saved = response.data.data.section;
      setDashboardModal({
        ...dashboardModal,
        data: saved,
      });
      setDashboardEditMode(false);
      setDashboardEditText("");
      await fetchData({ silent: true });
    } catch (err) {
      setDashboardEditError(getApiError(err));
    } finally {
      setDashboardSaving(false);
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
      const response = await refreshScopedSection(campNo, report, section.section_key);
      const refreshResult = response.data.data;

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
    const meta = getReportMeta(report);
    if (typeof meta?.camp_name === "string" && meta.camp_name) return meta.camp_name;
    const city = reportCity(report);
    if (city && report.department) return `City: ${city} · Department: ${report.department}`;
    if (city) return `City: ${city}`;
    if (report.department) return `Department: ${report.department}`;
    return "Main report";
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
          ...estimateScope(report),
        },
      ]
    );
  };

  const requestValidate = (report: CampReportRow, section: CampReportSection) => {
    void openConfirmModal(
      "Confirm validate",
      `Validate “${section.section}” on ${reportDisplayName(report)}? This will refresh the section and update validation data.`,
      { kind: "validate", report, section },
      [{ section: section.section_key, action: "validate", ...estimateScope(report) }]
    );
  };

  const requestRefreshAllSections = () => {
    if (sortedReports.length === 0 || sections.length === 0 || bulkRefresh.running) return;
    const operations: CampReportEstimateOperation[] = sortedReports.flatMap((report) =>
      sections.map((section) => ({
        section: section.section_key,
        action: "refresh" as const,
        ...estimateScope(report),
      }))
    );
    void openConfirmModal(
      "Confirm refresh all",
      `Refresh every section on the main, department, city, and city × department reports (${operations.length} operations)?`,
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
        await refreshScopedSection(campNo, job.report, job.section.section_key);
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
            title="Refresh every section on the main, department, city, and city × department reports"
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
            const isMain = isOverallReport(report);
            const city = reportCity(report);

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
                    {!isMain && (city || report.department) && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {[
                          city ? `City: ${city}` : null,
                          report.department ? `Department: ${report.department}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
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
                Keep this window open. Every report scope is refreshed one section at a time.
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
        onClose={closeDashboardModal}
        title={dashboardModal?.title ?? "Section data"}
        maxWidthClassName="max-w-3xl"
        headerActions={
          dashboardModal && !dashboardEditMode ? (
            <button
              type="button"
              onClick={startDashboardEdit}
              className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              aria-label="Edit section JSON"
              title="Edit"
            >
              <Pencil className="w-5 h-5" />
            </button>
          ) : undefined
        }
      >
        {dashboardEditMode ? (
          <div className="space-y-3">
            <textarea
              value={dashboardEditText}
              onChange={(e) => {
                setDashboardEditText(e.target.value);
                if (dashboardEditError) setDashboardEditError(null);
              }}
              spellCheck={false}
              className="w-full min-h-[320px] font-mono text-xs text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-y"
              disabled={dashboardSaving}
            />
            {dashboardEditError && (
              <p className="text-sm text-red-600">{dashboardEditError}</p>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={cancelDashboardEdit}
                disabled={dashboardSaving}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveDashboardEdit()}
                disabled={dashboardSaving}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {dashboardSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Done
              </button>
            </div>
          </div>
        ) : (
          <pre className="text-xs text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words">
            {dashboardModal
              ? JSON.stringify(dashboardModal.data, null, 2)
              : ""}
          </pre>
        )}
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
