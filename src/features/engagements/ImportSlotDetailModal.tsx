import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  engagementsApi,
  getApiError,
  type SlotDetail,
} from "../../lib/api";
import { EngagementSearchPicker } from "../../shared/ui/EngagementSearchPicker";
import { Modal } from "../../shared/ui/Modal";
import {
  type CabinSectionKey,
  type ImportableCabin,
  cabinAlreadyImported,
  importableCabinKey,
  importableCabinsFromSlotDetail,
  importSelectedCabinsIntoSlotDetail,
  isDateWithinRange,
  normalizeSlotDetail,
  type ImportAllCabinsResult,
} from "./slotDetailUtils";

export type ImportCopyResult = ImportAllCabinsResult & {
  message: string;
  sourceEngagementName?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  organizationId?: number | null;
  currentEngagementId?: number | null;
  slotDetail: SlotDetail;
  sections: CabinSectionKey[];
  onImportComplete: (result: ImportCopyResult) => void;
  onEditImportedCabin: (section: CabinSectionKey, date: string, cabinKey: string) => void;
};

type RowStatus = "will_copy" | "out_of_range" | "already_added" | "not_applicable";

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

function buildImportMessage(
  result: ImportAllCabinsResult,
  sourceName?: string
): string {
  const source = sourceName ? ` from ${sourceName}` : "";
  const parts: string[] = [];
  if (result.addedCount > 0) {
    parts.push(
      `Copied ${result.addedCount} cabin${result.addedCount === 1 ? "" : "s"}${source}`
    );
  } else {
    parts.push(`No new cabins copied${source}`);
  }
  if (result.skippedAlreadyAdded > 0) {
    parts.push(`${result.skippedAlreadyAdded} already added`);
  }
  if (result.skippedOutOfRange > 0) {
    parts.push(`${result.skippedOutOfRange} outside date range`);
  }
  return parts.join(". ") + ".";
}

function rowStatus(
  item: ImportableCabin,
  slotDetail: SlotDetail,
  startDate: string,
  endDate: string,
  allowedSections: Set<CabinSectionKey>
): RowStatus {
  if (!allowedSections.has(item.section)) return "not_applicable";
  if (!isDateWithinRange(item.date, startDate, endDate)) return "out_of_range";
  if (cabinAlreadyImported(slotDetail, item.section, item.date, item.cabin.cabin_key)) {
    return "already_added";
  }
  return "will_copy";
}

function statusLabel(status: RowStatus): string {
  switch (status) {
    case "will_copy":
      return "Will copy";
    case "out_of_range":
      return "Outside date range";
    case "already_added":
      return "Already added";
    case "not_applicable":
      return "Not applicable";
  }
}

export function ImportSlotDetailModal({
  open,
  onClose,
  startDate,
  endDate,
  organizationId,
  currentEngagementId,
  slotDetail,
  sections,
  onImportComplete,
}: Props) {
  const [sourceEngagementId, setSourceEngagementId] = useState(0);
  const [sourceEngagementName, setSourceEngagementName] = useState<string | undefined>();
  const [sourceSlotDetail, setSourceSlotDetail] = useState<SlotDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const allowedSections = useMemo(() => new Set(sections), [sections]);

  useEffect(() => {
    if (!open) {
      setSourceEngagementId(0);
      setSourceEngagementName(undefined);
      setSourceSlotDetail(null);
      setFetchError(null);
      setLoading(false);
      setSelectedKeys(new Set());
    }
  }, [open]);

  const loadSourceEngagement = useCallback(
    async (engagementId: number) => {
      if (!engagementId) {
        setSourceSlotDetail(null);
        setSourceEngagementName(undefined);
        setFetchError(null);
        return;
      }
      if (currentEngagementId && engagementId === currentEngagementId) {
        setSourceSlotDetail(null);
        setFetchError("Choose a different engagement to copy from.");
        return;
      }
      setLoading(true);
      setFetchError(null);
      try {
        const res = await engagementsApi.get(engagementId);
        const engagement = res.data.data;
        if (organizationId != null && engagement.organization_id !== organizationId) {
          setSourceSlotDetail(null);
          setFetchError("Source engagement must belong to the same organization.");
          return;
        }
        const normalized = normalizeSlotDetail(engagement.slot_detail);
        if (!normalized.blood_collection && !normalized.consultation) {
          setSourceSlotDetail(null);
          setFetchError("Selected engagement has no cabin schedule.");
          return;
        }
        setSourceEngagementName(
          engagement.engagement_name ?? engagement.engagement_code ?? `Engagement #${engagementId}`
        );
        setSourceSlotDetail(normalized);
      } catch (err) {
        setSourceSlotDetail(null);
        setFetchError(getApiError(err));
      } finally {
        setLoading(false);
      }
    },
    [currentEngagementId, organizationId]
  );

  useEffect(() => {
    if (!open || !sourceEngagementId) return;
    void loadSourceEngagement(sourceEngagementId);
  }, [open, sourceEngagementId, loadSourceEngagement]);

  const importableCabins = useMemo(() => {
    if (!sourceSlotDetail) return [] as ImportableCabin[];
    return importableCabinsFromSlotDetail(sourceSlotDetail, sections);
  }, [sourceSlotDetail, sections]);

  const rows = useMemo(() => {
    return importableCabins.map((item) => ({
      item,
      key: importableCabinKey(item),
      status: rowStatus(item, slotDetail, startDate, endDate, allowedSections),
    }));
  }, [allowedSections, endDate, importableCabins, slotDetail, startDate]);

  useEffect(() => {
    if (!sourceSlotDetail) return;
    const defaultSelected = new Set(
      rows.filter((r) => r.status === "will_copy").map((r) => r.key)
    );
    setSelectedKeys(defaultSelected);
  }, [rows, sourceSlotDetail]);

  const eligibleSelectedCount = useMemo(() => {
    return rows.filter((r) => r.status === "will_copy" && selectedKeys.has(r.key)).length;
  }, [rows, selectedKeys]);

  const toggleRow = (key: string, status: RowStatus) => {
    if (status !== "will_copy") return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllEligible = () => {
    const eligible = rows.filter((r) => r.status === "will_copy").map((r) => r.key);
    const allSelected = eligible.every((k) => selectedKeys.has(k));
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(eligible));
    }
  };

  const handleCopySelected = () => {
    const result = importSelectedCabinsIntoSlotDetail(
      slotDetail,
      importableCabins,
      selectedKeys,
      startDate,
      endDate
    );
    onImportComplete({
      ...result,
      message: buildImportMessage(result, sourceEngagementName),
      sourceEngagementName,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Copy from past engagement" maxWidthClassName="max-w-3xl">
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          Reuse cabin schedules from a previous engagement with the same organization. Select the
          cabins you want to copy — useful when running repeat camps with the same layout.
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

        {!loading && sourceSlotDetail && rows.length === 0 && !fetchError && (
          <p className="text-sm text-zinc-500">
            Selected engagement has no cabins matching your current schedule sections.
          </p>
        )}

        {!loading && rows.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleAllEligible}
                className="text-xs font-medium text-zinc-700 hover:underline"
              >
                {rows.filter((r) => r.status === "will_copy").every((r) => selectedKeys.has(r.key))
                  ? "Deselect all"
                  : "Select all eligible"}
              </button>
              <p className="text-xs text-zinc-500">
                {eligibleSelectedCount} cabin{eligibleSelectedCount === 1 ? "" : "s"} selected
              </p>
            </div>

            <div className="max-h-[24rem] overflow-y-auto border border-zinc-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 sticky top-0">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Section</th>
                    <th className="px-3 py-2">Cabin</th>
                    <th className="px-3 py-2">Hours</th>
                    <th className="px-3 py-2">Expert</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map(({ item, key, status }) => {
                    const canSelect = status === "will_copy";
                    return (
                      <tr
                        key={key}
                        className={canSelect ? "hover:bg-zinc-50 cursor-pointer" : "text-zinc-400"}
                        onClick={() => toggleRow(key, status)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(key)}
                            disabled={!canSelect}
                            onChange={() => toggleRow(key, status)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateLabel(item.date)}</td>
                        <td className="px-3 py-2">{sectionLabel(item.section)}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-zinc-900">{item.cabin.cabin_name}</p>
                          <p className="text-xs text-zinc-500">{item.cabin.cabin_key}</p>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          {item.cabin.start_time}–{item.cabin.end_time}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {item.section === "consultation" ? item.cabin.expert_type ?? "—" : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs ${
                              status === "will_copy"
                                ? "text-zinc-700"
                                : status === "already_added"
                                  ? "text-emerald-700"
                                  : status === "out_of_range"
                                    ? "text-amber-700"
                                    : "text-zinc-400"
                            }`}
                          >
                            {statusLabel(status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={eligibleSelectedCount === 0}
                onClick={handleCopySelected}
                className="px-4 py-2 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40"
              >
                {eligibleSelectedCount > 0
                  ? `Copy selected (${eligibleSelectedCount})`
                  : "Copy selected"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
