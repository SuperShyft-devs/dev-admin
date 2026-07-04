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

export function pushCategoriesForTypeCode(typeCode?: string | null): PushCategoryOption[] {
  const tc = (typeCode ?? "").trim();
  if (tc === "7") return FITPRINT_PUSH_CATEGORIES;
  if (tc === "1" || tc === "2") return MET_PUSH_CATEGORIES;
  return [];
}
