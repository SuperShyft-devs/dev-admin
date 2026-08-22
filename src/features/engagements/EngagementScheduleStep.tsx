import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, Copy, Plus, X } from "lucide-react";
import type {
  BloodCollectionType,
  CabinBreak,
  CabinSlotConfig,
  ConsultationMode,
  EngagementKind,
  ExpertTypeItem,
  SlotDetail,
} from "../../lib/api";
import { Modal } from "../../shared/ui/Modal";
import {
  getScheduleTitle,
  summarizeSlotDetail,
  type ScheduleIntent,
} from "./engagementTypeConfig";
import {
  type CabinSectionKey,
  cabinKeyConflict,
  cabinKeyFromName,
  createEmptyCabin,
  getCabinsForDate,
  normalizeCabinKeyInput,
  normalizeCabinTimes,
  removeCabin,
  removeDateFromSection,
  mergeSectionDates,
  uniqueCabinKey,
  upsertCabin,
  validateBreak,
  validateCabin,
} from "./slotDetailUtils";
import { ImportSlotDetailModal, type ImportCopyResult } from "./ImportSlotDetailModal";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Props = {
  kind: EngagementKind | null;
  bloodCollectionType: BloodCollectionType | string | null | undefined;
  consultationMode?: ConsultationMode | string | null | undefined;
  scheduleIntent: ScheduleIntent;
  startDate: string;
  endDate: string;
  organizationId?: number | null;
  currentEngagementId?: number | null;
  slotDetail: SlotDetail;
  dates: string[];
  onDatesChange: (dates: string[]) => void;
  onSlotDetailChange: (next: SlotDetail) => void;
  expertTypes?: ExpertTypeItem[];
};

type EditingCabin = {
  section: CabinSectionKey;
  date: string;
  cabin: CabinSlotConfig;
  originalKey: string;
  isNew: boolean;
  keyManuallyEdited: boolean;
};

type EditingBreak = {
  breakIndex: number | null;
  breakValue: CabinBreak;
};

type ActiveTab = CabinSectionKey;

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDateLabel(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMonthYear(month: Date): string {
  return month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function expertTypeLabel(typeKey: string | undefined, expertTypes: ExpertTypeItem[]): string {
  if (!typeKey) return "";
  return expertTypes.find((et) => et.type_key === typeKey)?.type ?? typeKey;
}

function sectionTitle(section: CabinSectionKey): string {
  return section === "blood_collection" ? "Blood Test" : "Consultation";
}

function cabinPreview(cabin: CabinSlotConfig): string {
  return `${cabin.start_time}–${cabin.end_time} · ${cabin.slot_duration} min slots · capacity ${cabin.capacity_per_slot}`;
}

export function EngagementScheduleStep({
  kind,
  bloodCollectionType,
  consultationMode,
  scheduleIntent,
  startDate,
  endDate,
  organizationId,
  currentEngagementId,
  slotDetail,
  dates,
  onDatesChange,
  onSlotDetailChange,
  expertTypes = [],
}: Props) {
  const showBlood = scheduleIntent.configureBlood;
  const showConsult = scheduleIntent.configureConsult;
  const title = getScheduleTitle(kind, bloodCollectionType, consultationMode);

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    showBlood ? "blood_collection" : "consultation"
  );
  const [bloodDates, setBloodDates] = useState<string[]>([]);
  const [consultDates, setConsultDates] = useState<string[]>([]);
  const [selectedBloodDate, setSelectedBloodDate] = useState<string | null>(null);
  const [selectedConsultDate, setSelectedConsultDate] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (startDate) return parseIsoDate(startDate.slice(0, 10));
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [editingCabin, setEditingCabin] = useState<EditingCabin | null>(null);
  const [editingBreak, setEditingBreak] = useState<EditingBreak | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [cabinError, setCabinError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBanner, setImportBanner] = useState<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const minDate = startDate?.slice(0, 10) || null;
  const maxDate = endDate?.slice(0, 10) || null;
  const summary = useMemo(() => summarizeSlotDetail(slotDetail), [slotDetail]);

  const activeSections = useMemo((): CabinSectionKey[] => {
    const sections: CabinSectionKey[] = [];
    if (showBlood) sections.push("blood_collection");
    if (showConsult) sections.push("consultation");
    return sections;
  }, [showBlood, showConsult]);

  useEffect(() => {
    if (showBlood && !showConsult) setActiveTab("blood_collection");
    else if (!showBlood && showConsult) setActiveTab("consultation");
    else if (!activeSections.includes(activeTab) && activeSections.length > 0) {
      setActiveTab(activeSections[0]);
    }
  }, [showBlood, showConsult, activeTab, activeSections]);

  useEffect(() => {
    setBloodDates((prev) => mergeSectionDates(slotDetail, "blood_collection", prev));
    setConsultDates((prev) => mergeSectionDates(slotDetail, "consultation", prev));
  }, [slotDetail]);

  const sortedBloodDates = useMemo(
    () => mergeSectionDates(slotDetail, "blood_collection", bloodDates),
    [slotDetail, bloodDates]
  );
  const sortedConsultDates = useMemo(
    () => mergeSectionDates(slotDetail, "consultation", consultDates),
    [slotDetail, consultDates]
  );

  useEffect(() => {
    const merged = [...new Set([...sortedBloodDates, ...sortedConsultDates])].sort();
    onDatesChange(merged);
  }, [sortedBloodDates, sortedConsultDates, onDatesChange]);

  useEffect(() => {
    if (selectedBloodDate && bloodDates.includes(selectedBloodDate)) return;
    setSelectedBloodDate(sortedBloodDates[0] ?? null);
  }, [bloodDates, selectedBloodDate, sortedBloodDates]);

  useEffect(() => {
    if (selectedConsultDate && consultDates.includes(selectedConsultDate)) return;
    setSelectedConsultDate(sortedConsultDates[0] ?? null);
  }, [consultDates, selectedConsultDate, sortedConsultDates]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (calendarRef.current?.contains(t) || addBtnRef.current?.contains(t)) return;
      setCalendarOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calendarOpen]);

  const addDateForSection = (section: CabinSectionKey, iso: string) => {
    const sectionDates =
      section === "blood_collection" ? sortedBloodDates : sortedConsultDates;
    if (sectionDates.includes(iso)) {
      setDateError("Date already added");
      if (section === "blood_collection") setSelectedBloodDate(iso);
      else setSelectedConsultDate(iso);
      setCalendarOpen(false);
      return;
    }
    setDateError(null);
    if (section === "blood_collection") {
      setBloodDates((prev) => [...prev, iso].sort());
      setSelectedBloodDate(iso);
    } else {
      setConsultDates((prev) => [...prev, iso].sort());
      setSelectedConsultDate(iso);
    }
    setCalendarOpen(false);
  };

  const handleRemoveDate = (section: CabinSectionKey, date: string) => {
    onSlotDetailChange(removeDateFromSection(slotDetail, section, date));
    if (section === "blood_collection") {
      setBloodDates((prev) => prev.filter((d) => d !== date));
      if (selectedBloodDate === date) {
        const remaining = sortedBloodDates.filter((d) => d !== date);
        setSelectedBloodDate(remaining[0] ?? null);
      }
    } else {
      setConsultDates((prev) => prev.filter((d) => d !== date));
      if (selectedConsultDate === date) {
        const remaining = sortedConsultDates.filter((d) => d !== date);
        setSelectedConsultDate(remaining[0] ?? null);
      }
    }
    setEditingCabin((prev) => (prev?.date === date ? null : prev));
    setEditingBreak(null);
  };

  const startNewCabin = (section: CabinSectionKey, date: string) => {
    setCabinError(null);
    setEditingBreak(null);
    setEditingCabin({
      section,
      date,
      cabin: createEmptyCabin(section),
      originalKey: "",
      isNew: true,
      keyManuallyEdited: false,
    });
  };

  const startEditCabin = (section: CabinSectionKey, date: string, cabin: CabinSlotConfig) => {
    setCabinError(null);
    setEditingBreak(null);
    setEditingCabin({
      section,
      date,
      cabin: { ...cabin, breaks: cabin.breaks.map((b) => ({ ...b })) },
      originalKey: cabin.cabin_key,
      isNew: false,
      keyManuallyEdited: false,
    });
  };

  const openImportedCabinEditor = (section: CabinSectionKey, date: string, cabinKey: string) => {
    const cabin = getCabinsForDate(slotDetail, section, date).find((c) => c.cabin_key === cabinKey);
    if (!cabin) return;
    setActiveTab(section);
    if (section === "blood_collection") setSelectedBloodDate(date);
    else setSelectedConsultDate(date);
    startEditCabin(section, date, cabin);
  };

  const updateEditingCabin = (cabin: CabinSlotConfig) => {
    setEditingCabin((prev) => (prev ? { ...prev, cabin } : prev));
  };

  const updateCabinName = (cabinName: string) => {
    setEditingCabin((prev) => {
      if (!prev) return prev;
      const nextCabin = { ...prev.cabin, cabin_name: cabinName };
      if (!prev.keyManuallyEdited) {
        nextCabin.cabin_key = uniqueCabinKey(
          slotDetail,
          cabinKeyFromName(cabinName),
          prev.originalKey || undefined
        );
      }
      return { ...prev, cabin: nextCabin };
    });
  };

  const updateCabinKey = (cabinKey: string) => {
    setEditingCabin((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        keyManuallyEdited: true,
        cabin: { ...prev.cabin, cabin_key: cabinKey },
      };
    });
  };

  const closeCabinModal = () => {
    setEditingCabin(null);
    setEditingBreak(null);
    setCabinError(null);
  };

  const saveCabin = () => {
    if (!editingCabin) return;
    const cabin = normalizeCabinTimes(editingCabin.cabin);
    const cabin_key = normalizeCabinKeyInput(cabin.cabin_key);
    const withKey = { ...cabin, cabin_key };
    const err = validateCabin(withKey, editingCabin.section);
    if (err) {
      setCabinError(err);
      return;
    }
    if (cabinKeyConflict(slotDetail, cabin_key, editingCabin.originalKey || undefined)) {
      setCabinError("Cabin key must be unique across all dates and sections");
      return;
    }
    setCabinError(null);
    onSlotDetailChange(
      upsertCabin(
        slotDetail,
        editingCabin.section,
        editingCabin.date,
        withKey,
        editingCabin.originalKey || undefined
      )
    );
    closeCabinModal();
  };

  const deleteCabin = (section: CabinSectionKey, date: string, cabinKey: string) => {
    onSlotDetailChange(removeCabin(slotDetail, section, date, cabinKey));
    setEditingCabin((prev) =>
      prev && prev.section === section && prev.date === date && prev.originalKey === cabinKey
        ? null
        : prev
    );
  };

  const startAddBreak = () => {
    if (!editingCabin) return;
    setCabinError(null);
    setEditingBreak({
      breakIndex: null,
      breakValue: { start_time: "13:00", end_time: "14:00" },
    });
  };

  const startEditBreak = (index: number) => {
    if (!editingCabin) return;
    const br = editingCabin.cabin.breaks[index];
    if (!br) return;
    setCabinError(null);
    setEditingBreak({
      breakIndex: index,
      breakValue: { ...br },
    });
  };

  const saveBreak = () => {
    if (!editingCabin || !editingBreak) return;
    const cabin = normalizeCabinTimes(editingCabin.cabin);
    const normalizedBreak = {
      start_time: editingBreak.breakValue.start_time.slice(0, 5),
      end_time: editingBreak.breakValue.end_time.slice(0, 5),
    };
    const err = validateBreak(normalizedBreak, cabin);
    if (err) {
      setCabinError(err);
      return;
    }
    const breaks = [...cabin.breaks];
    if (editingBreak.breakIndex == null) breaks.push(normalizedBreak);
    else breaks[editingBreak.breakIndex] = normalizedBreak;
    setEditingCabin({ ...editingCabin, cabin: { ...cabin, breaks } });
    setEditingBreak(null);
    setCabinError(null);
  };

  const removeBreakAt = (index: number) => {
    if (!editingCabin) return;
    const breaks = editingCabin.cabin.breaks.filter((_, i) => i !== index);
    setEditingCabin({ ...editingCabin, cabin: { ...editingCabin.cabin, breaks } });
    setEditingBreak(null);
  };

  const handleImportComplete = (result: ImportCopyResult) => {
    if (result.addedCount > 0) {
      onSlotDetailChange(result.nextSlotDetail);
      if (result.datesToAdd.length > 0) {
        const merged = [...new Set([...dates, ...result.datesToAdd])].sort();
        onDatesChange(merged);
      }
    }
    setImportBanner(result.message);
    setImportOpen(false);
  };

  if (!showBlood && !showConsult) {
    return null;
  }

  const showTabs = showBlood && showConsult;
  const currentSection = activeTab;
  const currentDates = currentSection === "blood_collection" ? sortedBloodDates : sortedConsultDates;
  const currentSelectedDate =
    currentSection === "blood_collection" ? selectedBloodDate : selectedConsultDate;
  const setCurrentSelectedDate =
    currentSection === "blood_collection" ? setSelectedBloodDate : setSelectedConsultDate;
  const currentCabins =
    currentSelectedDate != null
      ? getCabinsForDate(slotDetail, currentSection, currentSelectedDate)
      : [];
  const selectedDateHasNoCabins = currentSelectedDate != null && currentCabins.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          <p className="text-sm text-zinc-500 mt-1">
            Add dates and cabins for each section, copy from a past engagement, or skip to
            configure later.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
        >
          <Copy className="w-4 h-4" />
          Copy from past engagement
        </button>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        {showBlood && (
          <span>
            Blood: {summary.bloodDates} date{summary.bloodDates === 1 ? "" : "s"},{" "}
            {summary.bloodCabins} cabin{summary.bloodCabins === 1 ? "" : "s"}
          </span>
        )}
        {showBlood && showConsult && <span className="mx-2">·</span>}
        {showConsult && (
          <span>
            Consultation: {summary.consultDates} date{summary.consultDates === 1 ? "" : "s"},{" "}
            {summary.consultCabins} cabin{summary.consultCabins === 1 ? "" : "s"}
          </span>
        )}
        {summary.bloodCabins === 0 && summary.consultCabins === 0 && (
          <span>Not configured yet</span>
        )}
      </div>

      {importBanner && (
        <p className="text-sm text-emerald-700 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" role="status">
          {importBanner}
        </p>
      )}

      <p className="text-xs text-zinc-500">
        Skipping saves the engagement without on-site slots. Participants may not be able to book
        camp or consultation slots until you edit and add them.
      </p>

      {showTabs && (
        <div className="flex gap-1 border-b border-zinc-200">
          {(["blood_collection", "consultation"] as const).map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => setActiveTab(section)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === section
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {sectionTitle(section)}
            </button>
          ))}
        </div>
      )}

      <SectionSchedulePanel
        section={currentSection}
        sortedDates={currentDates}
        selectedDate={currentSelectedDate}
        setSelectedDate={setCurrentSelectedDate}
        slotDetail={slotDetail}
        dateError={dateError}
        calendarOpen={calendarOpen}
        setCalendarOpen={setCalendarOpen}
        calendarMonth={calendarMonth}
        setCalendarMonth={setCalendarMonth}
        calendarRef={calendarRef}
        addBtnRef={addBtnRef}
        minDate={minDate}
        maxDate={maxDate}
        onRemoveDate={(date) => handleRemoveDate(currentSection, date)}
        onAddDate={(iso) => addDateForSection(currentSection, iso)}
        onStartNewCabin={startNewCabin}
        onEditCabin={startEditCabin}
        onDeleteCabin={deleteCabin}
        selectedDateHasNoCabins={selectedDateHasNoCabins}
        expertTypes={expertTypes}
      />

      <ImportSlotDetailModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        startDate={startDate}
        endDate={endDate}
        organizationId={organizationId}
        currentEngagementId={currentEngagementId}
        slotDetail={slotDetail}
        sections={activeSections}
        onImportComplete={handleImportComplete}
        onEditImportedCabin={openImportedCabinEditor}
      />

      <Modal
        open={editingCabin != null}
        onClose={closeCabinModal}
        title={
          editingCabin?.isNew
            ? editingCabin.section === "blood_collection"
              ? "Add Blood-Test Cabin"
              : "Add Consultation Cabin"
            : "Edit cabin"
        }
        maxWidthClassName="max-w-lg"
        zIndexClassName="z-[60]"
      >
        {editingCabin && (
          <CabinEditor
            editing={editingCabin}
            error={cabinError}
            expertTypes={expertTypes}
            onChange={updateEditingCabin}
            onNameChange={updateCabinName}
            onKeyChange={updateCabinKey}
            onSave={saveCabin}
            onCancel={closeCabinModal}
            onAddBreak={startAddBreak}
            onEditBreak={startEditBreak}
            onRemoveBreak={removeBreakAt}
            editingBreak={editingBreak}
            onBreakChange={(breakValue) =>
              setEditingBreak((prev) => (prev ? { ...prev, breakValue } : prev))
            }
            onSaveBreak={saveBreak}
            onCancelBreak={() => setEditingBreak(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function SectionSchedulePanel({
  section,
  sortedDates,
  selectedDate,
  setSelectedDate,
  slotDetail,
  dateError,
  calendarOpen,
  setCalendarOpen,
  calendarMonth,
  setCalendarMonth,
  calendarRef,
  addBtnRef,
  minDate,
  maxDate,
  onRemoveDate,
  onAddDate,
  onStartNewCabin,
  onEditCabin,
  onDeleteCabin,
  selectedDateHasNoCabins,
  expertTypes = [],
}: {
  section: CabinSectionKey;
  sortedDates: string[];
  selectedDate: string | null;
  setSelectedDate: (d: string) => void;
  slotDetail: SlotDetail;
  dateError: string | null;
  calendarOpen: boolean;
  setCalendarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  calendarMonth: Date;
  setCalendarMonth: (month: Date) => void;
  calendarRef: RefObject<HTMLDivElement | null>;
  addBtnRef: RefObject<HTMLButtonElement | null>;
  minDate: string | null;
  maxDate: string | null;
  onRemoveDate: (date: string) => void;
  onAddDate: (iso: string) => void;
  onStartNewCabin: (section: CabinSectionKey, date: string) => void;
  onEditCabin: (section: CabinSectionKey, date: string, cabin: CabinSlotConfig) => void;
  onDeleteCabin: (section: CabinSectionKey, date: string, cabinKey: string) => void;
  selectedDateHasNoCabins: boolean;
  expertTypes?: ExpertTypeItem[];
}) {
  const addCabinLabel =
    section === "blood_collection" ? "Add Blood-Test Cabin" : "Add Consultation Cabin";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        {sortedDates.map((date) => {
          const selected = date === selectedDate;
          const cabinCount = getCabinsForDate(slotDetail, section, date).length;
          return (
            <div
              key={date}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedDate(date)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedDate(date);
                }
              }}
              className={`relative min-w-[9.5rem] rounded-lg border px-3 py-2 pr-8 cursor-pointer ${
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : cabinCount === 0
                    ? "border-amber-300 bg-amber-50 text-zinc-900 hover:border-amber-400"
                    : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400"
              }`}
            >
              <p className="text-sm font-medium">{formatDateLabel(date)}</p>
              <p
                className={`text-xs mt-0.5 ${
                  selected ? "text-white/70" : cabinCount === 0 ? "text-amber-700" : "text-zinc-500"
                }`}
              >
                {cabinCount === 0
                  ? "No cabins"
                  : `${cabinCount} cabin${cabinCount === 1 ? "" : "s"}`}
              </p>
              <button
                type="button"
                aria-label={`Remove ${formatDateLabel(date)}`}
                className={`absolute top-1.5 right-1.5 p-0.5 rounded ${
                  selected ? "text-white/80 hover:bg-white/10" : "text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveDate(date);
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        <div className="relative">
          <button
            ref={addBtnRef}
            type="button"
            onClick={() => setCalendarOpen((open) => !open)}
            className="h-full min-h-[2.75rem] px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Date
          </button>
        </div>
      </div>

      {calendarOpen && (
        <DateCalendarPopover
          anchorRef={addBtnRef}
          popoverRef={calendarRef}
          month={calendarMonth}
          addedDates={sortedDates}
          minDate={minDate}
          maxDate={maxDate}
          onMonthChange={setCalendarMonth}
          onSelectDate={onAddDate}
        />
      )}

      {dateError && <p className="text-sm text-red-600">{dateError}</p>}

      {sortedDates.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
          <Calendar className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-700">No dates yet</p>
          <p className="text-xs text-zinc-500 mt-1">
            Add your first {sectionTitle(section).toLowerCase()} date to configure cabins.
          </p>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="mt-3 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Date
          </button>
        </div>
      )}

      {selectedDate && (
        <div className="rounded-lg border border-zinc-200 p-4 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">{formatDateLabel(selectedDate)}</h4>
            {selectedDateHasNoCabins && (
              <p className="text-xs text-amber-700 mt-1">
                This date won&apos;t be saved until you add at least one cabin.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onStartNewCabin(section, selectedDate)}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            {addCabinLabel}
          </button>

          <CabinList
            title={`${sectionTitle(section)} Cabins`}
            cabins={getCabinsForDate(slotDetail, section, selectedDate)}
            expertTypes={expertTypes}
            showExpertType={section === "consultation"}
            onEdit={(cabin) => onEditCabin(section, selectedDate, cabin)}
            onDelete={(key) => onDeleteCabin(section, selectedDate, key)}
          />
        </div>
      )}
    </div>
  );
}

function DateCalendarPopover({
  anchorRef,
  popoverRef,
  month,
  addedDates,
  minDate,
  maxDate,
  onMonthChange,
  onSelectDate,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  popoverRef: Ref<HTMLDivElement>;
  month: Date;
  addedDates: string[];
  minDate: string | null;
  maxDate: string | null;
  onMonthChange: (month: Date) => void;
  onSelectDate: (iso: string) => void;
}) {
  const added = useMemo(() => new Set(addedDates), [addedDates]);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayIso = toIsoDate(new Date());
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length < 42) cells.push(null);

  const innerRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  const setRefs = (el: HTMLDivElement | null) => {
    innerRef.current = el;
    if (typeof popoverRef === "function") popoverRef(el);
    else if (popoverRef) (popoverRef as MutableRefObject<HTMLDivElement | null>).current = el;
  };

  const isDateDisabled = (iso: string): boolean => {
    if (added.has(iso)) return true;
    if (minDate && iso < minDate) return true;
    if (maxDate && iso > maxDate) return true;
    return false;
  };

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const cal = innerRef.current;
    if (!anchor || !cal) return;
    const gap = 8;
    const pad = 8;
    const rect = anchor.getBoundingClientRect();
    const width = cal.offsetWidth || 288;
    const height = cal.offsetHeight || 320;
    let left = rect.left;
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let top: number;
    if (spaceBelow >= height || spaceBelow >= spaceAbove) {
      top = rect.bottom + gap;
      if (top + height > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - height - pad);
      }
    } else {
      top = rect.top - gap - height;
      if (top < pad) top = pad;
    }
    setPos({ top, left, ready: true });
  }, [anchorRef]);

  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place, month]);

  return createPortal(
    <div
      ref={setRefs}
      style={{ top: pos.top, left: pos.left, visibility: pos.ready ? "visible" : "hidden" }}
      className="fixed z-[55] w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg"
    >
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          className="p-1 rounded-lg hover:bg-zinc-100"
          onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-zinc-900">{formatMonthYear(month)}</p>
        <button
          type="button"
          className="p-1 rounded-lg hover:bg-zinc-100"
          onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {(minDate || maxDate) && (
        <p className="text-[10px] text-zinc-400 text-center mb-2">
          {minDate && maxDate
            ? `Within ${formatDateLabel(minDate)} – ${formatDateLabel(maxDate)}`
            : minDate
              ? `From ${formatDateLabel(minDate)}`
              : `Until ${formatDateLabel(maxDate!)}`}
        </p>
      )}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 py-1">
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day == null) {
            return <div key={`e-${idx}`} className="h-9" />;
          }
          const iso = toIsoDate(new Date(year, monthIndex, day));
          const disabled = isDateDisabled(iso);
          const already = added.has(iso);
          const isToday = iso === todayIso;
          const outOfRange = disabled && !already;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(iso)}
              className={`h-9 rounded-lg text-sm ${
                already
                  ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                  : outOfRange
                    ? "text-zinc-300 cursor-not-allowed"
                    : isToday
                      ? "font-semibold text-zinc-900 hover:bg-zinc-100 ring-1 ring-zinc-900"
                      : "text-zinc-800 hover:bg-zinc-100"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

function CabinList({
  title,
  cabins,
  onEdit,
  onDelete,
  expertTypes = [],
  showExpertType = false,
}: {
  title: string;
  cabins: CabinSlotConfig[];
  onEdit: (cabin: CabinSlotConfig) => void;
  onDelete: (cabinKey: string) => void;
  expertTypes?: ExpertTypeItem[];
  showExpertType?: boolean;
}) {
  if (cabins.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cabins.map((cabin) => {
          const typeLabel = expertTypeLabel(cabin.expert_type, expertTypes);
          return (
            <div
              key={cabin.cabin_key}
              role="button"
              tabIndex={0}
              onClick={() => onEdit(cabin)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEdit(cabin);
                }
              }}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 hover:border-zinc-400 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">{cabin.cabin_name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{cabinPreview(cabin)}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {cabin.cabin_key}
                    {showExpertType && typeLabel ? ` · ${typeLabel}` : ""}
                    {!cabin.is_active ? " · inactive" : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="text-xs text-zinc-700 hover:underline"
                    onClick={() => onEdit(cabin)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => onDelete(cabin.cabin_key)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CabinEditor({
  editing,
  error,
  expertTypes = [],
  onChange,
  onNameChange,
  onKeyChange,
  onSave,
  onCancel,
  onAddBreak,
  onEditBreak,
  onRemoveBreak,
  editingBreak,
  onBreakChange,
  onSaveBreak,
  onCancelBreak,
}: {
  editing: EditingCabin;
  error: string | null;
  expertTypes?: ExpertTypeItem[];
  onChange: (cabin: CabinSlotConfig) => void;
  onNameChange: (cabinName: string) => void;
  onKeyChange: (cabinKey: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onAddBreak: () => void;
  onEditBreak: (index: number) => void;
  onRemoveBreak: (index: number) => void;
  editingBreak: EditingBreak | null;
  onBreakChange: (value: CabinBreak) => void;
  onSaveBreak: () => void;
  onCancelBreak: () => void;
}) {
  const cabin = editing.cabin;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 mb-1">Cabin name</label>
          <input
            type="text"
            value={cabin.cabin_name}
            onChange={(e) => onNameChange(e.target.value)}
            className={inputClass}
          />
        </div>
        {editing.section === "consultation" && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Expert Type <span className="text-red-600">*</span>
            </label>
            <select
              value={cabin.expert_type ?? ""}
              onChange={(e) => onChange({ ...cabin, expert_type: e.target.value })}
              className={inputClass}
              required
            >
              <option value="">Select expert type</option>
              {expertTypes.map((et) => (
                <option key={et.type_key} value={et.type_key}>
                  {et.type}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 mb-1">Cabin key</label>
          <input
            type="text"
            value={cabin.cabin_key}
            onChange={(e) => onKeyChange(e.target.value)}
            className={inputClass}
            placeholder="e.g. room_2"
            spellCheck={false}
          />
          <p className="text-xs text-zinc-500 mt-1">
            Lowercase letters, numbers, and underscores only. Must be unique across all cabins.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Start time</label>
          <input
            type="time"
            value={cabin.start_time}
            onChange={(e) => onChange({ ...cabin, start_time: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">End time</label>
          <input
            type="time"
            value={cabin.end_time}
            onChange={(e) => onChange({ ...cabin, end_time: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Slot duration (min)</label>
          <input
            type="number"
            min={1}
            max={480}
            value={cabin.slot_duration}
            onChange={(e) => onChange({ ...cabin, slot_duration: Number(e.target.value) })}
            className={inputClass}
          />
          <p className="text-xs text-zinc-500 mt-1">
            Per-cabin slot length. Engagement-level duration is a separate default.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Capacity per slot</label>
          <input
            type="number"
            min={1}
            value={cabin.capacity_per_slot}
            onChange={(e) => onChange({ ...cabin, capacity_per_slot: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div className="md:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={cabin.is_active}
              onChange={(e) => onChange({ ...cabin, is_active: e.target.checked })}
              className="w-4 h-4"
            />
            Active
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-700">Breaks</p>
          <button
            type="button"
            onClick={onAddBreak}
            className="text-xs font-medium text-zinc-800 hover:underline"
          >
            Add Break
          </button>
        </div>
        {cabin.breaks.length === 0 && (
          <p className="text-xs text-zinc-400">No breaks configured.</p>
        )}
        {cabin.breaks.map((br, index) => (
          <div
            key={`${br.start_time}-${br.end_time}-${index}`}
            className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-sm"
          >
            <button type="button" className="text-left hover:underline" onClick={() => onEditBreak(index)}>
              {br.start_time} – {br.end_time}
            </button>
            <button
              type="button"
              className="text-xs text-red-600 hover:underline"
              onClick={() => onRemoveBreak(index)}
            >
              Remove
            </button>
          </div>
        ))}

        {editingBreak && (
          <div className="rounded border border-zinc-300 p-3 space-y-2 bg-zinc-50">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Break start</label>
                <input
                  type="time"
                  value={editingBreak.breakValue.start_time}
                  onChange={(e) =>
                    onBreakChange({ ...editingBreak.breakValue, start_time: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Break end</label>
                <input
                  type="time"
                  value={editingBreak.breakValue.end_time}
                  onChange={(e) =>
                    onBreakChange({ ...editingBreak.breakValue, end_time: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSaveBreak}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium"
              >
                Save break
              </button>
              <button
                type="button"
                onClick={onCancelBreak}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
