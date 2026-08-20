import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  engagementsApi,
  getApiError,
  type BloodCollectionType,
  type EngagementKind,
  type SlotDetail,
} from "../../lib/api";
import { EngagementSearchPicker } from "../../shared/ui/EngagementSearchPicker";
import { Modal } from "../../shared/ui/Modal";
import { pruneSlotDetailForType } from "./engagementTypeConfig";
import {
  type CabinSectionKey,
  type ImportableCabin,
  cabinAlreadyImported,
  cloneCabinForImport,
  getCabinsForDate,
  importCabinIntoSlotDetail,
  importableCabinsFromSlotDetail,
  isDateWithinRange,
  normalizeSlotDetail,
  upsertCabin,
} from "./slotDetailUtils";

type Props = {
  open: boolean;
  onClose: () => void;
  kind: EngagementKind | null;
  bloodCollectionType: BloodCollectionType | string | null | undefined;
  startDate: string;
  endDate: string;
  organizationId?: number | null;
  currentEngagementId?: number | null;
  enabledConsultations?: Record<string, boolean> | null;
  slotDetail: SlotDetail;
  dates: string[];
  onDatesChange: (dates: string[]) => void;
  onSlotDetailChange: (next: SlotDetail) => void;
  onEditImportedCabin: (section: CabinSectionKey, date: string, cabinKey: string) => void;
};

function sectionLabel(section: CabinSectionKey): string {
  return section === "blood_collection" ? "Blood test" : "Consultation";
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ImportSlotDetailModal({
  open,
  onClose,
  kind,
  bloodCollectionType,
  startDate,
  endDate,
  organizationId,
  currentEngagementId,
  enabledConsultations,
  slotDetail,
  dates,
  onDatesChange,
  onSlotDetailChange,
  onEditImportedCabin,
}: Props) {
  const [sourceEngagementId, setSourceEngagementId] = useState(0);
  const [sourceSlotDetail, setSourceSlotDetail] = useState<SlotDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSourceEngagementId(0);
      setSourceSlotDetail(null);
      setFetchError(null);
      setActionMessage(null);
      setLoading(false);
    }
  }, [open]);

  const loadSourceEngagement = useCallback(
    async (engagementId: number) => {
      if (!engagementId) {
        setSourceSlotDetail(null);
        setFetchError(null);
        return;
      }
      if (currentEngagementId && engagementId === currentEngagementId) {
        setSourceSlotDetail(null);
        setFetchError("Choose a different engagement to import from.");
        return;
      }
      setLoading(true);
      setFetchError(null);
      setActionMessage(null);
      try {
        const res = await engagementsApi.get(engagementId);
        const engagement = res.data.data;
        if (organizationId != null && engagement.organization_id !== organizationId) {
          setSourceSlotDetail(null);
          setFetchError("Source engagement must belong to the same organization.");
          return;
        }
        const normalized = normalizeSlotDetail(engagement.slot_detail);
        const pruned = pruneSlotDetailForType(normalized, kind, bloodCollectionType);
        if (!pruned.blood_collection && !pruned.consultation) {
          setSourceSlotDetail(null);
          setFetchError("Selected engagement has no importable cabin schedule.");
          return;
        }
        setSourceSlotDetail(pruned);
      } catch (err) {
        setSourceSlotDetail(null);
        setFetchError(getApiError(err));
      } finally {
        setLoading(false);
      }
    },
    [bloodCollectionType, currentEngagementId, kind, organizationId]
  );

  useEffect(() => {
    if (!open || !sourceEngagementId) return;
    void loadSourceEngagement(sourceEngagementId);
  }, [open, sourceEngagementId, loadSourceEngagement]);

  const importableCabins = useMemo(() => {
    if (!sourceSlotDetail) return [] as ImportableCabin[];
    return importableCabinsFromSlotDetail(sourceSlotDetail).filter((item) => {
      if (item.section === "consultation" && enabledConsultations) {
        const expertType = item.cabin.expert_type?.trim();
        if (expertType && enabledConsultations[expertType] !== true) return false;
      }
      return true;
    });
  }, [enabledConsultations, sourceSlotDetail]);

  const groupedCabins = useMemo(() => {
    const groups = new Map<string, ImportableCabin[]>();
    for (const item of importableCabins) {
      const key = `${item.date}|${item.section}`;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [importableCabins]);

  const handleAddCabin = (item: ImportableCabin) => {
    if (!isDateWithinRange(item.date, startDate, endDate)) {
      setActionMessage("This date is outside the current engagement start/end range.");
      return;
    }
    if (cabinAlreadyImported(slotDetail, item.section, item.date, item.cabin.cabin_key)) {
      setActionMessage("This cabin is already added for that date.");
      return;
    }
    const nextSlotDetail = importCabinIntoSlotDetail(slotDetail, item.section, item.date, item.cabin);
    onSlotDetailChange(nextSlotDetail);
    if (!dates.includes(item.date)) {
      onDatesChange([...dates, item.date].sort());
    }
    setActionMessage(`Added ${item.cabin.cabin_name} for ${formatDateLabel(item.date)}.`);
  };

  const handleEditCabin = (item: ImportableCabin) => {
    if (!isDateWithinRange(item.date, startDate, endDate)) {
      setActionMessage("This date is outside the current engagement start/end range.");
      return;
    }

    let cabinKey = item.cabin.cabin_key;
    if (!cabinAlreadyImported(slotDetail, item.section, item.date, item.cabin.cabin_key)) {
      const cloned = cloneCabinForImport(item.cabin, slotDetail, item.section);
      cabinKey = cloned.cabin_key;
      const nextSlotDetail = upsertCabin(slotDetail, item.section, item.date, cloned);
      onSlotDetailChange(nextSlotDetail);
      if (!dates.includes(item.date)) {
        onDatesChange([...dates, item.date].sort());
      }
    } else {
      const existing = getCabinsForDate(slotDetail, item.section, item.date).find(
        (c) => c.cabin_key === item.cabin.cabin_key
      );
      if (existing) cabinKey = existing.cabin_key;
    }

    onEditImportedCabin(item.section, item.date, cabinKey);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Import cabin schedule" maxWidthClassName="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          Pick another engagement to browse its blood test and consultation cabins. Add cabins into
          this engagement, then edit them if needed.
        </p>

        <EngagementSearchPicker
          value={sourceEngagementId}
          onChange={setSourceEngagementId}
          label="Source engagement"
          placeholder="Search by name or code…"
        />

        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        )}

        {fetchError && (
          <p className="text-sm text-red-600" role="alert">
            {fetchError}
          </p>
        )}

        {actionMessage && !fetchError && (
          <p className="text-sm text-emerald-700" role="status">
            {actionMessage}
          </p>
        )}

        {!loading && sourceSlotDetail && groupedCabins.length === 0 && !fetchError && (
          <p className="text-sm text-zinc-500">No cabins match the current engagement type and offerings.</p>
        )}

        {!loading && groupedCabins.length > 0 && (
          <div className="max-h-[24rem] overflow-y-auto space-y-4 border border-zinc-200 rounded-lg p-3">
            {groupedCabins.map(([groupKey, cabins]) => {
              const [date, section] = groupKey.split("|") as [string, CabinSectionKey];
              const inRange = isDateWithinRange(date, startDate, endDate);
              return (
                <div key={groupKey}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {formatDateLabel(date)} · {sectionLabel(section)}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {cabins.map((item) => {
                      const added = cabinAlreadyImported(
                        slotDetail,
                        item.section,
                        item.date,
                        item.cabin.cabin_key
                      );
                      return (
                        <li
                          key={`${item.section}-${item.date}-${item.cabin.cabin_key}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900">{item.cabin.cabin_name}</p>
                            <p className="text-xs text-zinc-500">
                              {item.cabin.cabin_key} · {item.cabin.start_time}–{item.cabin.end_time}
                              {item.section === "consultation" && item.cabin.expert_type
                                ? ` · ${item.cabin.expert_type}`
                                : ""}
                            </p>
                            {!inRange && (
                              <p className="text-xs text-amber-700 mt-0.5">
                                Outside current engagement date range
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={!inRange || added}
                              onClick={() => handleAddCabin(item)}
                              className="px-3 py-1.5 rounded-md bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-40"
                            >
                              {added ? "Added" : "Add"}
                            </button>
                            {added && (
                              <button
                                type="button"
                                onClick={() => handleEditCabin(item)}
                                className="px-3 py-1.5 rounded-md border border-zinc-300 text-zinc-700 text-xs font-medium hover:bg-zinc-50"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
