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
import { ChevronLeft, ChevronRight, Home, Info, Plus, X, Download } from "lucide-react";
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
  showBloodCabinsInSchedule,
  showBloodModeUnsetPanel,
  showConsultationCabinsInSchedule,
  showHomeCollectionPanel,
} from "./engagementTypeConfig";
import {
  type CabinSectionKey,
  cabinKeyFromName,
  createEmptyCabin,
  getCabinsForDate,
  normalizeCabinTimes,
  removeCabin,
  removeDate,
  uniqueCabinKey,
  upsertCabin,
  validateBreak,
  validateCabin,
} from "./slotDetailUtils";
import { ImportSlotDetailModal } from "./ImportSlotDetailModal";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Props = {
  kind: EngagementKind | null;
  bloodCollectionType: BloodCollectionType | string | null | undefined;
  consultationMode?: ConsultationMode | string | null | undefined;
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
};

type EditingBreak = {
  breakIndex: number | null;
  breakValue: CabinBreak;
};

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

function cabinCountForDate(slotDetail: SlotDetail, date: string): { blood: number; consult: number } {
  return {
    blood: getCabinsForDate(slotDetail, "blood_collection", date).length,
    consult: getCabinsForDate(slotDetail, "consultation", date).length,
  };
}

function expertTypeLabel(typeKey: string | undefined, expertTypes: ExpertTypeItem[]): string {
  if (!typeKey) return "";
  return expertTypes.find((et) => et.type_key === typeKey)?.type ?? typeKey;
}

export function EngagementScheduleStep({
  kind,
  bloodCollectionType,
  consultationMode,
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
  const showBlood = showBloodCabinsInSchedule(kind, bloodCollectionType);
  const showConsult = showConsultationCabinsInSchedule(kind, consultationMode);
  const showHomePanel = showHomeCollectionPanel(kind, bloodCollectionType);
  const showUnsetPanel = showBloodModeUnsetPanel(kind, bloodCollectionType);
  const title = getScheduleTitle(kind, bloodCollectionType, consultationMode);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (startDate) return parseIsoDate(startDate.slice(0, 10));
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingCabin, setEditingCabin] = useState<EditingCabin | null>(null);
  const [editingBreak, setEditingBreak] = useState<EditingBreak | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [cabinError, setCabinError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const sortedDates = useMemo(() => [...dates].sort(), [dates]);
  const minDate = startDate?.slice(0, 10) || null;
  const maxDate = endDate?.slice(0, 10) || null;

  useEffect(() => {
    if (selectedDate && dates.includes(selectedDate)) return;
    setSelectedDate(sortedDates[0] ?? null);
  }, [dates, selectedDate, sortedDates]);

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

  const addDateFromCalendar = (iso: string) => {
    if (dates.includes(iso)) {
      setDateError("Date already added");
      setSelectedDate(iso);
      setCalendarOpen(false);
      return;
    }
    setDateError(null);
    onDatesChange([...dates, iso].sort());
    setSelectedDate(iso);
    setCalendarOpen(false);
  };

  const handleRemoveDate = (date: string) => {
    const remaining = dates.filter((d) => d !== date);
    onDatesChange(remaining);
    onSlotDetailChange(removeDate(slotDetail, date));
    setEditingCabin((prev) => (prev?.date === date ? null : prev));
    setEditingBreak(null);
    if (selectedDate === date) {
      setSelectedDate([...remaining].sort()[0] ?? null);
    }
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
    });
  };

  const openImportedCabinEditor = (section: CabinSectionKey, date: string, cabinKey: string) => {
    const cabin = getCabinsForDate(slotDetail, section, date).find((c) => c.cabin_key === cabinKey);
    if (!cabin) return;
    setSelectedDate(date);
    startEditCabin(section, date, cabin);
  };

  const updateEditingCabin = (cabin: CabinSlotConfig) => {
    setEditingCabin((prev) => (prev ? { ...prev, cabin } : prev));
  };

  const updateCabinName = (cabinName: string) => {
    setEditingCabin((prev) => {
      if (!prev) return prev;
      const cabin_key = uniqueCabinKey(
        slotDetail,
        cabinKeyFromName(cabinName),
        prev.originalKey || undefined
      );
      return { ...prev, cabin: { ...prev.cabin, cabin_name: cabinName, cabin_key } };
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
    const withKey = {
      ...cabin,
      cabin_key: uniqueCabinKey(
        slotDetail,
        cabinKeyFromName(cabin.cabin_name),
        editingCabin.originalKey || undefined
      ),
    };
    const err = validateCabin(withKey, editingCabin.section);
    if (err) {
      setCabinError(err);
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

  const selectedDateCounts =
    selectedDate != null ? cabinCountForDate(slotDetail, selectedDate) : null;
  const selectedDateHasNoCabins =
    selectedDateCounts != null &&
    selectedDateCounts.blood + selectedDateCounts.consult === 0;

  if (showHomePanel) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex gap-3">
          <Home className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900">Home collection selected</p>
            <p className="text-sm text-blue-800">
              Blood collection slots are chosen per participant via Healthians when they enroll.
              No on-site cabins are needed for this engagement.
            </p>
          </div>
        </div>
        {showConsult && (
          <ConsultationScheduleSection
            title={title}
            showBlood={false}
            showConsult={showConsult}
            sortedDates={sortedDates}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
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
            onDatesChange={onDatesChange}
            onRemoveDate={handleRemoveDate}
            onAddDate={addDateFromCalendar}
            onStartNewCabin={startNewCabin}
            onEditCabin={startEditCabin}
            onDeleteCabin={deleteCabin}
            selectedDateHasNoCabins={selectedDateHasNoCabins}
            expertTypes={expertTypes}
            onOpenImport={() => setImportOpen(true)}
          />
        )}
        <ImportSlotDetailModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          startDate={startDate}
          endDate={endDate}
          organizationId={organizationId}
          currentEngagementId={currentEngagementId}
          slotDetail={slotDetail}
          dates={dates}
          onDatesChange={onDatesChange}
          onSlotDetailChange={onSlotDetailChange}
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

  if (showUnsetPanel && !showConsult) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-900">Blood collection mode not set</p>
            <p className="text-sm text-amber-800">
              Choose <strong>Camp Collection</strong> in Offerings to configure on-site blood test
              dates and cabins, or <strong>Home Collection</strong> for Healthians home visits.
              You can also skip and configure later when editing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!showBlood && !showConsult) {
    return null;
  }

  return (
    <div className="space-y-4">
      <ConsultationScheduleSection
        title={title}
        showBlood={showBlood}
        showConsult={showConsult}
        sortedDates={sortedDates}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
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
        onDatesChange={onDatesChange}
        onRemoveDate={handleRemoveDate}
        onAddDate={addDateFromCalendar}
        onStartNewCabin={startNewCabin}
        onEditCabin={startEditCabin}
        onDeleteCabin={deleteCabin}
        selectedDateHasNoCabins={selectedDateHasNoCabins}
        unsetBloodPanel={showUnsetPanel}
        expertTypes={expertTypes}
        onOpenImport={() => setImportOpen(true)}
      />

      <ImportSlotDetailModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        startDate={startDate}
        endDate={endDate}
        organizationId={organizationId}
        currentEngagementId={currentEngagementId}
        slotDetail={slotDetail}
        dates={dates}
        onDatesChange={onDatesChange}
        onSlotDetailChange={onSlotDetailChange}
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

function ConsultationScheduleSection({
  title,
  showBlood,
  showConsult,
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
  unsetBloodPanel,
  expertTypes = [],
  onOpenImport,
}: {
  title: string;
  showBlood: boolean;
  showConsult: boolean;
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
  onDatesChange: (dates: string[]) => void;
  onRemoveDate: (date: string) => void;
  onAddDate: (iso: string) => void;
  onStartNewCabin: (section: CabinSectionKey, date: string) => void;
  onEditCabin: (section: CabinSectionKey, date: string, cabin: CabinSlotConfig) => void;
  onDeleteCabin: (section: CabinSectionKey, date: string, cabinKey: string) => void;
  selectedDateHasNoCabins: boolean;
  unsetBloodPanel?: boolean;
  expertTypes?: ExpertTypeItem[];
  onOpenImport?: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          <p className="text-sm text-zinc-500 mt-1">
            Add dates and cabins now, or skip and configure later when editing.
          </p>
        </div>
        {onOpenImport && (
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
          >
            <Download className="w-4 h-4" />
            Import from engagement
          </button>
        )}
      </div>

      {unsetBloodPanel && showConsult && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Set blood collection to Camp Collection in Offerings to add blood test cabins. Consultation
            cabins can still be configured below.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-stretch gap-2">
        {sortedDates.map((date) => {
          const selected = date === selectedDate;
          const counts = cabinCountForDate(slotDetail, date);
          const totalCabins = counts.blood + counts.consult;
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
                  : totalCabins === 0
                    ? "border-amber-300 bg-amber-50 text-zinc-900 hover:border-amber-400"
                    : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400"
              }`}
            >
              <p className="text-sm font-medium">{formatDateLabel(date)}</p>
              <p
                className={`text-xs mt-0.5 ${
                  selected ? "text-white/70" : totalCabins === 0 ? "text-amber-700" : "text-zinc-500"
                }`}
              >
                {totalCabins === 0
                  ? "No cabins"
                  : [
                      counts.blood > 0 ? `${counts.blood} blood` : null,
                      counts.consult > 0 ? `${counts.consult} consult` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
        <p className="text-sm text-zinc-400">No dates yet. Add a date to configure cabins.</p>
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

          <div className="flex flex-wrap gap-2">
            {showBlood && (
              <button
                type="button"
                onClick={() => onStartNewCabin("blood_collection", selectedDate)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Add Blood-Test Cabin
              </button>
            )}
            {showConsult && (
              <button
                type="button"
                onClick={() => onStartNewCabin("consultation", selectedDate)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Add Consultation Cabin
              </button>
            )}
          </div>

          {showBlood && (
            <CabinList
              title="Blood Test Cabins"
              cabins={getCabinsForDate(slotDetail, "blood_collection", selectedDate)}
              onEdit={(cabin) => onEditCabin("blood_collection", selectedDate, cabin)}
              onDelete={(key) => onDeleteCabin("blood_collection", selectedDate, key)}
            />
          )}

          {showConsult && (
            <CabinList
              title="Consultation Cabins"
              cabins={getCabinsForDate(slotDetail, "consultation", selectedDate)}
              expertTypes={expertTypes}
              onEdit={(cabin) => onEditCabin("consultation", selectedDate, cabin)}
              onDelete={(key) => onDeleteCabin("consultation", selectedDate, key)}
            />
          )}
        </div>
      )}
    </>
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
}: {
  title: string;
  cabins: CabinSlotConfig[];
  onEdit: (cabin: CabinSlotConfig) => void;
  onDelete: (cabinKey: string) => void;
  expertTypes?: ExpertTypeItem[];
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
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 hover:border-zinc-400"
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className="min-w-0 flex-1 cursor-pointer"
                onDoubleClick={() => onEdit(cabin)}
                title="Double-click to edit"
              >
                <p className="text-sm font-medium text-zinc-900">{cabin.cabin_name}</p>
                <p className="text-xs text-zinc-500">
                  {cabin.cabin_key} · {cabin.start_time}–{cabin.end_time}
                  {typeLabel ? ` · ${typeLabel}` : ""}
                  {!cabin.is_active ? " · inactive" : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
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
          <input type="text" value={cabin.cabin_key} readOnly className={`${inputClass} bg-zinc-50 text-zinc-500`} />
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