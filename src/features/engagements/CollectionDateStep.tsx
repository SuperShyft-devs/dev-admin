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
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import type { CabinBreak, CabinSlotConfig, EngagementKind, SlotDetail } from "../../lib/api";
import { Modal } from "../../shared/ui/Modal";
import {
  type CabinSectionKey,
  cabinKeyFromName,
  createEmptyCabin,
  getCabinsForDate,
  needsBloodCabins,
  needsConsultationCabins,
  normalizeCabinTimes,
  removeCabin,
  removeDate,
  uniqueCabinKey,
  upsertCabin,
  validateBreak,
  validateCabin,
} from "./slotDetailUtils";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Props = {
  kind: EngagementKind | null;
  slotDetail: SlotDetail;
  dates: string[];
  onDatesChange: (dates: string[]) => void;
  onSlotDetailChange: (next: SlotDetail) => void;
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

export function CollectionDateStep({
  kind,
  slotDetail,
  dates,
  onDatesChange,
  onSlotDetailChange,
}: Props) {
  const showBlood = needsBloodCabins(kind);
  const showConsult = needsConsultationCabins(kind);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingCabin, setEditingCabin] = useState<EditingCabin | null>(null);
  const [editingBreak, setEditingBreak] = useState<EditingBreak | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [cabinError, setCabinError] = useState<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const sortedDates = useMemo(() => [...dates].sort(), [dates]);

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
    const err = validateCabin(withKey);
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

  if (!showBlood && !showConsult) {
    return (
      <p className="text-sm text-zinc-500">
        Cabin scheduling is not used for this engagement type. You can skip this step.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Optional: add collection dates and cabins. Skip if not needed.
      </p>

      <div className="flex flex-wrap items-stretch gap-2">
        {sortedDates.map((date) => {
          const selected = date === selectedDate;
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
                  : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400"
              }`}
            >
              <p className="text-sm font-medium">{formatDateLabel(date)}</p>
              <button
                type="button"
                aria-label={`Remove ${formatDateLabel(date)}`}
                className={`absolute top-1.5 right-1.5 p-0.5 rounded ${
                  selected ? "text-white/80 hover:bg-white/10" : "text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveDate(date);
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
          addedDates={dates}
          onMonthChange={setCalendarMonth}
          onSelectDate={addDateFromCalendar}
        />
      )}

      {dateError && <p className="text-sm text-red-600">{dateError}</p>}

      {sortedDates.length === 0 && (
        <p className="text-sm text-zinc-400">No dates yet. Add a date to configure cabins.</p>
      )}

      {selectedDate && (
        <div className="rounded-lg border border-zinc-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">{formatDateLabel(selectedDate)}</h3>

          <div className="flex flex-wrap gap-2">
            {showBlood && (
              <button
                type="button"
                onClick={() => startNewCabin("blood_collection", selectedDate)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Add Blood-Test Cabin
              </button>
            )}
            {showConsult && (
              <button
                type="button"
                onClick={() => startNewCabin("consultation", selectedDate)}
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
              onEdit={(cabin) => startEditCabin("blood_collection", selectedDate, cabin)}
              onDelete={(key) => deleteCabin("blood_collection", selectedDate, key)}
            />
          )}

          {showConsult && (
            <CabinList
              title="Consultation Cabins"
              cabins={getCabinsForDate(slotDetail, "consultation", selectedDate)}
              onEdit={(cabin) => startEditCabin("consultation", selectedDate, cabin)}
              onDelete={(key) => deleteCabin("consultation", selectedDate, key)}
            />
          )}
        </div>
      )}

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

function DateCalendarPopover({
  anchorRef,
  popoverRef,
  month,
  addedDates,
  onMonthChange,
  onSelectDate,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  popoverRef: Ref<HTMLDivElement>;
  month: Date;
  addedDates: string[];
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
          const already = added.has(iso);
          const isToday = iso === todayIso;
          return (
            <button
              key={iso}
              type="button"
              disabled={already}
              onClick={() => onSelectDate(iso)}
              className={`h-9 rounded-lg text-sm ${
                already
                  ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
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
}: {
  title: string;
  cabins: CabinSlotConfig[];
  onEdit: (cabin: CabinSlotConfig) => void;
  onDelete: (cabinKey: string) => void;
}) {
  if (cabins.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cabins.map((cabin) => (
          <div
            key={cabin.cabin_key}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 cursor-pointer hover:border-zinc-400"
            onDoubleClick={() => onEdit(cabin)}
            title="Double-click to edit"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-zinc-900">{cabin.cabin_name}</p>
                <p className="text-xs text-zinc-500">
                  {cabin.cabin_key} · {cabin.start_time}–{cabin.end_time}
                  {!cabin.is_active ? " · inactive" : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(cabin.cabin_key);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CabinEditor({
  editing,
  error,
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
