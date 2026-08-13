import type {
  CabinBreak,
  CabinSlotConfig,
  EngagementKind,
  SlotDetail,
  SlotDetailSection,
} from "../../lib/api";

export type CabinSectionKey = "blood_collection" | "consultation";

export function needsBloodCabins(kind: EngagementKind | null): boolean {
  return (
    kind === "bio_ai" ||
    kind === "blood_test" ||
    kind === "blood_test_with_consultation" ||
    kind === "bio_ai_with_consultation"
  );
}

export function needsConsultationCabins(kind: EngagementKind | null): boolean {
  return (
    kind === "consultation" ||
    kind === "blood_test_with_consultation" ||
    kind === "bio_ai_with_consultation"
  );
}

export function emptySlotDetail(): SlotDetail {
  return {};
}

export function normalizeSlotDetail(raw: SlotDetail | null | undefined): SlotDetail {
  if (!raw) return emptySlotDetail();
  return {
    blood_collection: raw.blood_collection ? { ...raw.blood_collection } : undefined,
    consultation: raw.consultation ? { ...raw.consultation } : undefined,
  };
}

export function collectDates(slotDetail: SlotDetail): string[] {
  const dates = new Set<string>();
  for (const section of [slotDetail.blood_collection, slotDetail.consultation]) {
    if (!section) continue;
    for (const d of Object.keys(section)) dates.add(d);
  }
  return Array.from(dates).sort();
}

function allCabinKeys(slotDetail: SlotDetail): Set<string> {
  const keys = new Set<string>();
  for (const section of [slotDetail.blood_collection, slotDetail.consultation]) {
    if (!section) continue;
    for (const cabins of Object.values(section)) {
      for (const cabin of cabins) keys.add(cabin.cabin_key);
    }
  }
  return keys;
}

export function nextCabinKey(slotDetail: SlotDetail, section: CabinSectionKey): string {
  const prefix = section === "blood_collection" ? "btc" : "cc";
  const existing = allCabinKeys(slotDetail);
  let n = 1;
  while (existing.has(`${prefix}-${String(n).padStart(3, "0")}`)) n += 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

export function defaultCabinName(section: CabinSectionKey, slotDetail: SlotDetail, date: string): string {
  const sectionData = slotDetail[section] ?? {};
  const count = (sectionData[date] ?? []).length + 1;
  return section === "blood_collection"
    ? `Blood Test Cabin ${count}`
    : `Consultation Cabin ${count}`;
}

export function createEmptyCabin(
  slotDetail: SlotDetail,
  section: CabinSectionKey,
  date: string
): CabinSlotConfig {
  return {
    cabin_name: defaultCabinName(section, slotDetail, date),
    cabin_key: nextCabinKey(slotDetail, section),
    start_time: "09:00",
    end_time: "17:00",
    slot_duration: 30,
    capacity_per_slot: section === "blood_collection" ? 2 : 1,
    breaks: [],
    is_active: true,
  };
}

export function getCabinsForDate(
  slotDetail: SlotDetail,
  section: CabinSectionKey,
  date: string
): CabinSlotConfig[] {
  return slotDetail[section]?.[date] ?? [];
}

export function upsertCabin(
  slotDetail: SlotDetail,
  section: CabinSectionKey,
  date: string,
  cabin: CabinSlotConfig
): SlotDetail {
  const sectionData: SlotDetailSection = { ...(slotDetail[section] ?? {}) };
  const list = [...(sectionData[date] ?? [])];
  const idx = list.findIndex((c) => c.cabin_key === cabin.cabin_key);
  if (idx >= 0) list[idx] = cabin;
  else list.push(cabin);
  sectionData[date] = list;
  return { ...slotDetail, [section]: sectionData };
}

export function removeCabin(
  slotDetail: SlotDetail,
  section: CabinSectionKey,
  date: string,
  cabinKey: string
): SlotDetail {
  const sectionData: SlotDetailSection = { ...(slotDetail[section] ?? {}) };
  const list = (sectionData[date] ?? []).filter((c) => c.cabin_key !== cabinKey);
  if (list.length === 0) {
    delete sectionData[date];
  } else {
    sectionData[date] = list;
  }
  const next: SlotDetail = { ...slotDetail, [section]: sectionData };
  if (Object.keys(sectionData).length === 0) {
    delete next[section];
  }
  return pruneEmptyDates(next);
}

export function addDate(slotDetail: SlotDetail, date: string): SlotDetail {
  // Dates are implicit once cabins are added; keep an empty marker via blood or consultation?
  // We track dates independently in the UI; slot_detail only stores dates with cabins.
  // Adding a date alone does not mutate slot_detail until a cabin is saved.
  void slotDetail;
  void date;
  return slotDetail;
}

export function removeDate(slotDetail: SlotDetail, date: string): SlotDetail {
  const next: SlotDetail = {
    blood_collection: slotDetail.blood_collection
      ? { ...slotDetail.blood_collection }
      : undefined,
    consultation: slotDetail.consultation ? { ...slotDetail.consultation } : undefined,
  };
  if (next.blood_collection) {
    delete next.blood_collection[date];
    if (Object.keys(next.blood_collection).length === 0) delete next.blood_collection;
  }
  if (next.consultation) {
    delete next.consultation[date];
    if (Object.keys(next.consultation).length === 0) delete next.consultation;
  }
  return next;
}

function pruneEmptyDates(slotDetail: SlotDetail): SlotDetail {
  const next: SlotDetail = { ...slotDetail };
  for (const key of ["blood_collection", "consultation"] as const) {
    const section = next[key];
    if (!section) continue;
    const cleaned: SlotDetailSection = {};
    for (const [d, cabins] of Object.entries(section)) {
      if (cabins.length > 0) cleaned[d] = cabins;
    }
    if (Object.keys(cleaned).length === 0) delete next[key];
    else next[key] = cleaned;
  }
  return next;
}

export function slotDetailForSubmit(slotDetail: SlotDetail): SlotDetail | null {
  const pruned = pruneEmptyDates(slotDetail);
  if (!pruned.blood_collection && !pruned.consultation) return null;
  return pruned;
}

export function normalizeTime(value: string): string {
  if (!value) return value;
  const parts = value.split(":");
  if (parts.length < 2) return value;
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
}

export function validateCabin(cabin: CabinSlotConfig): string | null {
  const start = normalizeTime(cabin.start_time);
  const end = normalizeTime(cabin.end_time);
  if (!cabin.cabin_name.trim()) return "Cabin name is required";
  if (!start || !end) return "Start and end time are required";
  if (end <= start) return "End time must be after start time";
  if (!(cabin.slot_duration > 0)) return "Slot duration must be at least 1 minute";
  if (!(cabin.capacity_per_slot > 0)) return "Capacity must be at least 1";
  for (const br of cabin.breaks) {
    const brStart = normalizeTime(br.start_time);
    const brEnd = normalizeTime(br.end_time);
    if (!brStart || !brEnd) return "Break start and end time are required";
    if (brEnd <= brStart) return "Break end time must be after start time";
    if (brStart < start || brEnd > end) {
      return "Break must be within cabin hours";
    }
  }
  return null;
}

export function validateBreak(br: CabinBreak, cabin: CabinSlotConfig): string | null {
  const start = normalizeTime(cabin.start_time);
  const end = normalizeTime(cabin.end_time);
  const brStart = normalizeTime(br.start_time);
  const brEnd = normalizeTime(br.end_time);
  if (!brStart || !brEnd) return "Break start and end time are required";
  if (brEnd <= brStart) return "Break end time must be after start time";
  if (brStart < start || brEnd > end) {
    return "Break must be within cabin hours";
  }
  return null;
}

export function normalizeCabinTimes(cabin: CabinSlotConfig): CabinSlotConfig {
  return {
    ...cabin,
    start_time: normalizeTime(cabin.start_time),
    end_time: normalizeTime(cabin.end_time),
    breaks: cabin.breaks.map((br) => ({
      start_time: normalizeTime(br.start_time),
      end_time: normalizeTime(br.end_time),
    })),
  };
}
