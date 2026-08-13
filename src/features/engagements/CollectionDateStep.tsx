import { useMemo, useState } from "react";
import type { CabinBreak, CabinSlotConfig, EngagementKind, SlotDetail } from "../../lib/api";
import {
  type CabinSectionKey,
  createEmptyCabin,
  getCabinsForDate,
  needsBloodCabins,
  needsConsultationCabins,
  normalizeCabinTimes,
  removeCabin,
  removeDate,
  upsertCabin,
  validateBreak,
  validateCabin,
} from "./slotDetailUtils";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900";

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
  isNew: boolean;
};

type EditingBreak = {
  section: CabinSectionKey;
  date: string;
  cabinKey: string;
  breakIndex: number | null;
  breakValue: CabinBreak;
};

export function CollectionDateStep({
  kind,
  slotDetail,
  dates,
  onDatesChange,
  onSlotDetailChange,
}: Props) {
  const showBlood = needsBloodCabins(kind);
  const showConsult = needsConsultationCabins(kind);
  const [datePicker, setDatePicker] = useState("");
  const [editingCabin, setEditingCabin] = useState<EditingCabin | null>(null);
  const [editingBreak, setEditingBreak] = useState<EditingBreak | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const sortedDates = useMemo(() => [...dates].sort(), [dates]);

  const addSelectedDate = () => {
    if (!datePicker) {
      setLocalError("Select a date first");
      return;
    }
    if (dates.includes(datePicker)) {
      setLocalError("Date already added");
      return;
    }
    setLocalError(null);
    onDatesChange([...dates, datePicker].sort());
    setDatePicker("");
  };

  const handleRemoveDate = (date: string) => {
    onDatesChange(dates.filter((d) => d !== date));
    onSlotDetailChange(removeDate(slotDetail, date));
    setEditingCabin((prev) => (prev?.date === date ? null : prev));
    setEditingBreak((prev) => (prev?.date === date ? null : prev));
  };

  const startNewCabin = (section: CabinSectionKey, date: string) => {
    setLocalError(null);
    setEditingBreak(null);
    setEditingCabin({
      section,
      date,
      cabin: createEmptyCabin(slotDetail, section, date),
      isNew: true,
    });
  };

  const startEditCabin = (section: CabinSectionKey, date: string, cabin: CabinSlotConfig) => {
    setLocalError(null);
    setEditingBreak(null);
    setEditingCabin({
      section,
      date,
      cabin: { ...cabin, breaks: cabin.breaks.map((b) => ({ ...b })) },
      isNew: false,
    });
  };

  const saveCabin = () => {
    if (!editingCabin) return;
    const cabin = normalizeCabinTimes(editingCabin.cabin);
    const err = validateCabin(cabin);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    onSlotDetailChange(upsertCabin(slotDetail, editingCabin.section, editingCabin.date, cabin));
    setEditingCabin(null);
  };

  const deleteCabin = (section: CabinSectionKey, date: string, cabinKey: string) => {
    onSlotDetailChange(removeCabin(slotDetail, section, date, cabinKey));
    setEditingCabin((prev) =>
      prev && prev.section === section && prev.date === date && prev.cabin.cabin_key === cabinKey
        ? null
        : prev
    );
  };

  const startAddBreak = () => {
    if (!editingCabin) return;
    setLocalError(null);
    setEditingBreak({
      section: editingCabin.section,
      date: editingCabin.date,
      cabinKey: editingCabin.cabin.cabin_key,
      breakIndex: null,
      breakValue: { start_time: "13:00", end_time: "14:00" },
    });
  };

  const startEditBreak = (index: number) => {
    if (!editingCabin) return;
    const br = editingCabin.cabin.breaks[index];
    if (!br) return;
    setLocalError(null);
    setEditingBreak({
      section: editingCabin.section,
      date: editingCabin.date,
      cabinKey: editingCabin.cabin.cabin_key,
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
      setLocalError(err);
      return;
    }
    const breaks = [...cabin.breaks];
    if (editingBreak.breakIndex == null) breaks.push(normalizedBreak);
    else breaks[editingBreak.breakIndex] = normalizedBreak;
    const nextCabin = { ...cabin, breaks };
    setEditingCabin({ ...editingCabin, cabin: nextCabin });
    onSlotDetailChange(
      upsertCabin(slotDetail, editingCabin.section, editingCabin.date, nextCabin)
    );
    setEditingBreak(null);
    setLocalError(null);
  };

  const removeBreakAt = (index: number) => {
    if (!editingCabin) return;
    const breaks = editingCabin.cabin.breaks.filter((_, i) => i !== index);
    const nextCabin = { ...editingCabin.cabin, breaks };
    setEditingCabin({ ...editingCabin, cabin: nextCabin });
    onSlotDetailChange(
      upsertCabin(slotDetail, editingCabin.section, editingCabin.date, nextCabin)
    );
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

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-zinc-700 mb-1">Add Date</label>
          <input
            type="date"
            value={datePicker}
            onChange={(e) => setDatePicker(e.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={addSelectedDate}
          className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          Add Date
        </button>
      </div>

      {localError && <p className="text-sm text-red-600">{localError}</p>}

      {sortedDates.length === 0 && (
        <p className="text-sm text-zinc-400">No dates yet. Add a date to configure cabins.</p>
      )}

      {sortedDates.map((date) => (
        <div key={date} className="rounded-lg border border-zinc-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{date}</h3>
            <button
              type="button"
              onClick={() => handleRemoveDate(date)}
              className="text-xs text-red-600 hover:underline"
            >
              Remove date
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {showBlood && (
              <button
                type="button"
                onClick={() => startNewCabin("blood_collection", date)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Add Blood-Test-Cabin
              </button>
            )}
            {showConsult && (
              <button
                type="button"
                onClick={() => startNewCabin("consultation", date)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Add Consultation-Cabin
              </button>
            )}
          </div>

          {showBlood && (
            <CabinList
              title="Blood Test Cabins"
              section="blood_collection"
              date={date}
              cabins={getCabinsForDate(slotDetail, "blood_collection", date)}
              onEdit={(cabin) => startEditCabin("blood_collection", date, cabin)}
              onDelete={(key) => deleteCabin("blood_collection", date, key)}
            />
          )}

          {showConsult && (
            <CabinList
              title="Consultation Cabins"
              section="consultation"
              date={date}
              cabins={getCabinsForDate(slotDetail, "consultation", date)}
              onEdit={(cabin) => startEditCabin("consultation", date, cabin)}
              onDelete={(key) => deleteCabin("consultation", date, key)}
            />
          )}

          {editingCabin && editingCabin.date === date && (
            <CabinEditor
              editing={editingCabin}
              onChange={(cabin) => setEditingCabin({ ...editingCabin, cabin })}
              onSave={saveCabin}
              onCancel={() => {
                setEditingCabin(null);
                setEditingBreak(null);
                setLocalError(null);
              }}
              onAddBreak={startAddBreak}
              onEditBreak={startEditBreak}
              onRemoveBreak={removeBreakAt}
              editingBreak={
                editingBreak &&
                editingBreak.cabinKey === editingCabin.cabin.cabin_key &&
                editingBreak.date === date
                  ? editingBreak
                  : null
              }
              onBreakChange={(breakValue) =>
                setEditingBreak((prev) => (prev ? { ...prev, breakValue } : prev))
              }
              onSaveBreak={saveBreak}
              onCancelBreak={() => setEditingBreak(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CabinList({
  title,
  cabins,
  onEdit,
  onDelete,
}: {
  title: string;
  section: CabinSectionKey;
  date: string;
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
            onClick={() => onEdit(cabin)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onEdit(cabin);
            }}
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
  onChange,
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
  onChange: (cabin: CabinSlotConfig) => void;
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
    <div className="rounded-lg border border-zinc-300 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900">
          {editing.isNew ? "New cabin" : "Edit cabin"}
        </h4>
        <span className="text-xs text-zinc-500">{cabin.cabin_key}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 mb-1">Cabin name</label>
          <input
            type="text"
            value={cabin.cabin_name}
            onChange={(e) => onChange({ ...cabin, cabin_name: e.target.value })}
            className={inputClass}
          />
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

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          Save cabin
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
