export type PushCategoryOption = { key: string; label: string };

export const METSIGHTS_BLOOD_PACKAGE_CODES = new Set(["METSIGHTS_BASIC", "METSIGHTS_PRO"]);

export const MET_PUSH_CATEGORIES: PushCategoryOption[] = [
  { key: "physical-measurement", label: "Physical Measurement" },
  { key: "vitals", label: "Vitals" },
  { key: "diet-lifestyle-parameters", label: "Diet & Lifestyle" },
  { key: "blood-parameters", label: "Blood Parameters" },
  { key: "advanced-blood-parameters", label: "Advanced Blood Parameters" },
];

export const FITPRINT_PUSH_CATEGORIES: PushCategoryOption[] = [
  { key: "fitness-parameters", label: "Fitness Parameters" },
];

/**
 * Heuristic for sequential push-questionnaires batching:
 * one API call per participant; each selected category is a separate Metsights PATCH
 * (OPTIONS metadata is cached after the first participant).
 */
export const PUSH_SECONDS_PER_PARTICIPANT_BASE = 1;
export const PUSH_SECONDS_PER_CATEGORY = 2;

export function pushCategoriesForTypeCode(typeCode?: string | null): PushCategoryOption[] {
  const tc = (typeCode ?? "").trim();
  if (tc === "7") return FITPRINT_PUSH_CATEGORIES;
  if (tc === "1" || tc === "2") return MET_PUSH_CATEGORIES;
  return [];
}

/** Estimated wall-clock seconds for a client-side sequential push. */
export function estimatePushSeconds(
  participantCount: number,
  categoryCount: number
): number {
  const n = Math.max(0, Math.floor(participantCount));
  const cats = Math.max(0, Math.floor(categoryCount));
  if (n === 0 || cats === 0) return 0;
  return Math.ceil(
    n * (PUSH_SECONDS_PER_PARTICIPANT_BASE + cats * PUSH_SECONDS_PER_CATEGORY)
  );
}

export function formatPushEstimatedTime(seconds: number): string {
  if (seconds <= 0) return "less than a second";
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

export function isPushableAssessmentPackage(pkg: {
  assessment_type_code?: string | null;
}): boolean {
  return pushCategoriesForTypeCode(pkg.assessment_type_code).length > 0;
}
