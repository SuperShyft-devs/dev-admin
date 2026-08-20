import type {
  CabinBreak,
  CabinSlotConfig,
  SlotDetail,
  SlotDetailSection,
} from "../../lib/api";

export type CabinSectionKey = "blood_collection" | "consultation";

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

/** "Cabin Name 123" → "cabin_name123" */
export function cabinKeyFromName(name: string): string {
  let out = "";
  for (const ch of name.toLowerCase().trim()) {
    if (/[a-z]/.test(ch)) {
      out += ch;
    } else if (/[0-9]/.test(ch)) {
      if (out.endsWith("_")) out = out.slice(0, -1);
      out += ch;
    } else if (out.length && /[a-z]$/.test(out)) {
      out += "_";
    }
  }
  return out.replace(/^_+|_+$/g, "");
}

export function uniqueCabinKey(
  slotDetail: SlotDetail,
  slug: string,
  excludeKey?: string
): string {
  if (!slug) return "";
  const existing = allCabinKeys(slotDetail);
  if (excludeKey) existing.delete(excludeKey);
  if (!existing.has(slug)) return slug;
  let n = 2;
  while (existing.has(`${slug}_${n}`)) n += 1;
  return `${slug}_${n}`;
}

export function createEmptyCabin(section: CabinSectionKey): CabinSlotConfig {
  return {
    cabin_name: "",
    cabin_key: "",
    start_time: "09:00",
    end_time: "17:00",
    ...(section === "consultation" ? { expert_type: "" } : {}),
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
  cabin: CabinSlotConfig,
  originalKey?: string
): SlotDetail {
  const sectionData: SlotDetailSection = { ...(slotDetail[section] ?? {}) };
  const list = [...(sectionData[date] ?? [])];
  const matchKey = originalKey || cabin.cabin_key;
  const idx = matchKey ? list.findIndex((c) => c.cabin_key === matchKey) : -1;
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

export function validateCabin(cabin: CabinSlotConfig, section?: CabinSectionKey): string | null {
  const start = normalizeTime(cabin.start_time);
  const end = normalizeTime(cabin.end_time);
  if (!cabin.cabin_name.trim()) return "Cabin name is required";
  if (!cabin.cabin_key.trim()) return "Cabin key could not be generated from the cabin name";
  if (section === "consultation" && !cabin.expert_type?.trim()) return "Expert type is required";
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

export type ImportableCabin = {
  section: CabinSectionKey;
  date: string;
  cabin: CabinSlotConfig;
};

export function importableCabinsFromSlotDetail(slotDetail: SlotDetail): ImportableCabin[] {
  const items: ImportableCabin[] = [];
  for (const section of ["blood_collection", "consultation"] as const) {
    const sectionData = slotDetail[section];
    if (!sectionData) continue;
    for (const [date, cabins] of Object.entries(sectionData)) {
      for (const cabin of cabins) {
        items.push({ section, date, cabin: normalizeCabinTimes({ ...cabin }) });
      }
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.section.localeCompare(b.section));
}

export function cloneCabinForImport(
  cabin: CabinSlotConfig,
  slotDetail: SlotDetail,
  section: CabinSectionKey
): CabinSlotConfig {
  const baseKey = cabin.cabin_key || cabinKeyFromName(cabin.cabin_name);
  const cabin_key = uniqueCabinKey(slotDetail, baseKey);
  return normalizeCabinTimes({
    ...cabin,
    cabin_key,
    ...(section === "consultation" ? { expert_type: cabin.expert_type ?? "" } : {}),
  });
}

export function importCabinIntoSlotDetail(
  slotDetail: SlotDetail,
  section: CabinSectionKey,
  date: string,
  cabin: CabinSlotConfig
): SlotDetail {
  const cloned = cloneCabinForImport(cabin, slotDetail, section);
  return upsertCabin(slotDetail, section, date, cloned);
}

export type ImportAllCabinsResult = {
  nextSlotDetail: SlotDetail;
  addedCount: number;
  skippedOutOfRange: number;
  skippedAlreadyAdded: number;
  datesToAdd: string[];
};

export function importAllCabinsIntoSlotDetail(
  slotDetail: SlotDetail,
  cabins: ImportableCabin[],
  startDate: string,
  endDate: string
): ImportAllCabinsResult {
  let nextSlotDetail = slotDetail;
  let addedCount = 0;
  let skippedOutOfRange = 0;
  let skippedAlreadyAdded = 0;
  const datesToAdd: string[] = [];

  for (const item of cabins) {
    if (!isDateWithinRange(item.date, startDate, endDate)) {
      skippedOutOfRange += 1;
      continue;
    }
    if (cabinAlreadyImported(nextSlotDetail, item.section, item.date, item.cabin.cabin_key)) {
      skippedAlreadyAdded += 1;
      continue;
    }
    nextSlotDetail = importCabinIntoSlotDetail(
      nextSlotDetail,
      item.section,
      item.date,
      item.cabin
    );
    addedCount += 1;
    if (!datesToAdd.includes(item.date)) {
      datesToAdd.push(item.date);
    }
  }

  return {
    nextSlotDetail,
    addedCount,
    skippedOutOfRange,
    skippedAlreadyAdded,
    datesToAdd,
  };
}

export function cabinAlreadyImported(
  slotDetail: SlotDetail,
  section: CabinSectionKey,
  date: string,
  sourceCabinKey: string
): boolean {
  return getCabinsForDate(slotDetail, section, date).some((c) => c.cabin_key === sourceCabinKey);
}

export function isDateWithinRange(date: string, startDate: string, endDate: string): boolean {
  const d = date.slice(0, 10);
  const start = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);
  if (!start || !end) return true;
  return d >= start && d <= end;
}
