import type {
  ConsoleParticipantAssessment,
  ConsoleQuestionnaireQuestion,
} from "../../lib/api";

const METSIGHTS_TYPE_CODES = new Set(["1", "2"]);

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function normalizePackageCode(row: ConsoleParticipantAssessment): string {
  return String(row.package_code ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function getPackagePriorityTier(row: ConsoleParticipantAssessment): number {
  const code = normalizePackageCode(row);
  const typeCode = String(row.assessment_type_code ?? "").trim();

  if (code.includes("METSIGHTS") && code.includes("PRO")) return 3;
  if (code === "METSIGHTS_BASIC" || (code.includes("METSIGHTS") && code.includes("BASIC"))) return 2;
  if (METSIGHTS_TYPE_CODES.has(typeCode)) {
    return typeCode === "2" ? 3 : 2;
  }
  if (code.includes("FITPRINT") || code.includes("FITNESS_PRINT")) return 0;
  return 1;
}

export function isMetsightsAssessment(row: ConsoleParticipantAssessment): boolean {
  const code = normalizePackageCode(row);
  const typeCode = String(row.assessment_type_code ?? "").trim();
  if (METSIGHTS_TYPE_CODES.has(typeCode)) return true;
  return (
    (code.includes("METSIGHTS") && (code.includes("BASIC") || code.includes("PRO"))) ||
    code === "METSIGHTS_BASIC" ||
    code === "METSIGHTS_PRO"
  );
}

export function pickLatestMetsightsAssessment(
  assessments: ConsoleParticipantAssessment[],
  engagementId: number
): ConsoleParticipantAssessment | null {
  const scoped = assessments.filter(
    (row) => Number(row.engagement_id ?? 0) === engagementId && isMetsightsAssessment(row)
  );
  if (scoped.length === 0) return null;
  if (scoped.length === 1) return scoped[0];

  return [...scoped].sort((a, b) => {
    const tierDiff = getPackagePriorityTier(b) - getPackagePriorityTier(a);
    if (tierDiff !== 0) return tierDiff;
    const byAssigned = toTimestamp(b.assigned_at) - toTimestamp(a.assigned_at);
    if (byAssigned !== 0) return byAssigned;
    return Number(b.assessment_instance_id) - Number(a.assessment_instance_id);
  })[0];
}

const ROUTE_ORDER = [
  "physical-measurement",
  "anthropometry",
  "family-history",
  "lifestyle-habits",
  "diet-lifestyle-parameters",
  "nutrition-log",
  "vitals",
  "blood-parameters",
  "advanced-blood-parameters",
  "fitness-parameters",
];

export function sortCategories<T extends { category_key?: string | null; category_id: number }>(
  categories: T[]
): T[] {
  return [...categories].sort((a, b) => {
    const aKey = String(a.category_key ?? "").toLowerCase();
    const bKey = String(b.category_key ?? "").toLowerCase();
    const aIndex = ROUTE_ORDER.findIndex((key) => aKey.includes(key) || key.includes(aKey));
    const bIndex = ROUTE_ORDER.findIndex((key) => bKey.includes(key) || key.includes(bKey));
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (safeA !== safeB) return safeA - safeB;
    return Number(a.category_id) - Number(b.category_id);
  });
}

function normalizeQuestionType(type?: string | null): string {
  return String(type ?? "").trim().toLowerCase();
}

function mapOptionLabelToValue(
  question: ConsoleQuestionnaireQuestion,
  raw: unknown
): string {
  const value = String(raw ?? "").trim();
  if (!value || !Array.isArray(question.options)) return value;
  const byValue = question.options.find((opt) => String(opt.option_value ?? "").trim() === value);
  if (byValue) return value;
  const byLabel = question.options.find(
    (opt) => String(opt.display_name ?? "").trim().toLowerCase() === value.toLowerCase()
  );
  return byLabel ? String(byLabel.option_value ?? "").trim() : value;
}

function isEmptyAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function normalizeAnswerForQuestion(
  question: ConsoleQuestionnaireQuestion,
  rawAnswer: unknown
): unknown {
  const questionType = normalizeQuestionType(question.question_type);

  if (
    questionType === "multiple_choice" ||
    questionType === "multi_choice" ||
    questionType === "checkbox" ||
    questionType === "multi_select"
  ) {
    const values = (Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer])
      .map((value) => mapOptionLabelToValue(question, value))
      .filter((value) => !isEmptyAnswer(value));
    return values;
  }

  if (
    questionType === "single_choice" ||
    questionType === "choice" ||
    questionType === "radio" ||
    questionType === "single_select" ||
    questionType === "select_one" ||
    questionType === "dropdown"
  ) {
    const selected = Array.isArray(rawAnswer) ? rawAnswer[0] : rawAnswer;
    return mapOptionLabelToValue(question, selected);
  }

  if (questionType === "scale") {
    if (rawAnswer != null && typeof rawAnswer === "object" && !Array.isArray(rawAnswer)) {
      const obj = rawAnswer as { value?: unknown; unit?: unknown };
      const num = Number(obj.value);
      if (!Number.isFinite(num)) return null;
      const unitCode =
        mapOptionLabelToValue(question, obj.unit) || String(obj.unit ?? "").trim();
      if (!unitCode) return null;
      return { value: num, unit: unitCode };
    }
    const primitive = Array.isArray(rawAnswer) ? rawAnswer[0] : rawAnswer;
    const coerced = Number(primitive);
    if (!Number.isFinite(coerced)) return null;
    const firstOpt = Array.isArray(question.options) ? question.options[0] : null;
    const unitCode = String(firstOpt?.option_value ?? "").trim();
    if (!unitCode) return null;
    return { value: coerced, unit: unitCode };
  }

  if (questionType === "number" || questionType === "numeric" || questionType === "integer") {
    const selected = Array.isArray(rawAnswer) ? rawAnswer[0] : rawAnswer;
    const numberValue = Number(selected);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  if (Array.isArray(rawAnswer)) {
    return rawAnswer[0] ?? null;
  }

  return rawAnswer;
}

export function getVisibleQuestions(questions: ConsoleQuestionnaireQuestion[]): ConsoleQuestionnaireQuestion[] {
  return questions.filter((q) => q.is_visible !== false && !q.is_read_only);
}

export function isAnswerEmpty(value: unknown): boolean {
  return isEmptyAnswer(value);
}
