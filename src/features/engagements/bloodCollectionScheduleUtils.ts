import type { PublicCabinSlot, PublicSlotDetail } from "../../lib/api";

export function normalizeSlotToHhmm(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  const parts = text.split(":");
  if (parts.length < 2) return text;
  const hour = parts[0].padStart(2, "0");
  const minute = parts[1].padStart(2, "0");
  return `${hour}:${minute}`;
}

function getBloodSection(slotDetail: PublicSlotDetail | null | undefined) {
  return slotDetail?.blood_collection ?? null;
}

function getDateEntry(slotDetail: PublicSlotDetail | null | undefined, date: string) {
  const section = getBloodSection(slotDetail);
  if (!section || !date) return undefined;
  return section[date];
}

export function getAvailableDates(
  slotDetail: PublicSlotDetail | null | undefined,
  currentDate?: string | null
): string[] {
  const section = getBloodSection(slotDetail);
  if (!section) return currentDate?.trim() ? [currentDate.trim()] : [];

  const dates = new Set<string>();
  for (const [dateKey, entry] of Object.entries(section)) {
    if (entry.is_enable === false) continue;
    const hasSlot = (entry.cabins ?? []).some((cabin) =>
      (cabin.available_slots ?? []).some((slot) => (slot.spot_left ?? 0) > 0)
    );
    if (hasSlot) dates.add(dateKey);
  }
  if (currentDate?.trim()) dates.add(currentDate.trim());
  return Array.from(dates).sort();
}

export function getAvailableCabins(
  slotDetail: PublicSlotDetail | null | undefined,
  date: string,
  currentCabin?: string | null
): PublicCabinSlot[] {
  const entry = getDateEntry(slotDetail, date);
  if (!entry) return [];

  const cabins: PublicCabinSlot[] = [];
  const seen = new Set<string>();
  for (const cabin of entry.cabins ?? []) {
    const key = cabin.cabin_key?.trim();
    if (!key || seen.has(key)) continue;
    const hasSlot = (cabin.available_slots ?? []).some((slot) => (slot.spot_left ?? 0) > 0);
    if (hasSlot || key === (currentCabin ?? "").trim()) {
      cabins.push(cabin);
      seen.add(key);
    }
  }

  const current = (currentCabin ?? "").trim();
  if (current && !seen.has(current)) {
    const match = (entry.cabins ?? []).find((c) => c.cabin_key === current);
    if (match) cabins.push(match);
  }

  return cabins;
}

export function getAvailableSlots(
  slotDetail: PublicSlotDetail | null | undefined,
  date: string,
  cabinKey: string,
  currentSlot?: string | null
): { slot: string; spot_left: number }[] {
  const entry = getDateEntry(slotDetail, date);
  if (!entry || !cabinKey.trim()) return [];

  const cabin = (entry.cabins ?? []).find((c) => c.cabin_key === cabinKey);
  if (!cabin) return [];

  const currentNorm = normalizeSlotToHhmm(currentSlot);
  const slots = new Map<string, { slot: string; spot_left: number }>();
  for (const item of cabin.available_slots ?? []) {
    const slot = item.slot?.trim();
    if (!slot) continue;
    const normalized = normalizeSlotToHhmm(slot);
    if ((item.spot_left ?? 0) > 0 || normalized === currentNorm) {
      slots.set(normalized, { slot, spot_left: item.spot_left ?? 0 });
    }
  }
  if (currentNorm && !slots.has(currentNorm)) {
    slots.set(currentNorm, { slot: currentNorm, spot_left: 0 });
  }

  return Array.from(slots.values()).sort((a, b) => a.slot.localeCompare(b.slot));
}

export function getCabinLabel(
  slotDetail: PublicSlotDetail | null | undefined,
  date: string,
  cabinKey: string
): string {
  const entry = getDateEntry(slotDetail, date);
  const cabin = (entry?.cabins ?? []).find((c) => c.cabin_key === cabinKey);
  return cabin?.cabin_name?.trim() || cabinKey;
}

export function hasConfiguredBloodCollectionSchedule(
  slotDetail: PublicSlotDetail | null | undefined
): boolean {
  const section = getBloodSection(slotDetail);
  return Boolean(section && Object.keys(section).length > 0);
}
