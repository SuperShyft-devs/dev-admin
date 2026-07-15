import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, X, Copy, Eraser } from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import {
  expertAvailabilityPortalApi,
  expertsPortalApi,
  getApiError,
  type AvailabilityBlock,
  type AvailabilityBlockPayload,
  type AvailabilityOverride,
  type ExpertDetail,
} from "../../lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_START_MINS = 6 * 60;
const DAY_END_MINS = 22 * 60;
const DEFAULT_BUFFER = 5;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number): string {
  const hh = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function generateTimeOptions(stepMinutes: number = 15): string[] {
  const opts: string[] = [];
  for (let m = 0; m < 24 * 60; m += stepMinutes) {
    opts.push(minutesToTime(m));
  }
  return opts;
}

function generateSlotStarts(slotDuration: number): number[] {
  const step = Math.max(5, slotDuration);
  const slots: number[] = [];
  for (let m = DAY_START_MINS; m < DAY_END_MINS; m += step) {
    slots.push(m);
  }
  return slots;
}

function formatTimeDisplay(t: string): string {
  const mins = timeToMinutes(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatMinutesDisplay(mins: number): string {
  return formatTimeDisplay(minutesToTime(mins));
}

type LocalBlock = AvailabilityBlockPayload & { _tempId: string; id?: number };

type OverridePopoverState = {
  open: boolean;
  date: string;
  available: boolean;
  startTime: string;
  endTime: string;
  bufferTime: number;
};

const INITIAL_OVERRIDE_POPOVER: OverridePopoverState = {
  open: false,
  date: "",
  available: false,
  startTime: "09:00",
  endTime: "17:00",
  bufferTime: 5,
};

export function ExpertAvailabilityPage() {
  const [expert, setExpert] = useState<ExpertDetail | null>(null);
  const [blocks, setBlocks] = useState<LocalBlock[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [overridePopover, setOverridePopover] = useState<OverridePopoverState>(INITIAL_OVERRIDE_POPOVER);
  const overridePopoverRef = useRef<HTMLDivElement>(null);

  const slotDuration = expert?.session_duration_mins ?? 30;
  const slotStarts = useMemo(() => generateSlotStarts(slotDuration), [slotDuration]);
  const timeOptions = generateTimeOptions(15);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expertRes, blocksRes, overridesRes] = await Promise.all([
        expertsPortalApi.me(),
        expertAvailabilityPortalApi.listBlocks(),
        expertAvailabilityPortalApi.listOverrides(),
      ]);
      setExpert(expertRes.data.data);
      setBlocks(
        blocksRes.data.data.map((b: AvailabilityBlock) => ({
          ...b,
          _tempId: `srv-${b.id}`,
        }))
      );
      setOverrides(overridesRes.data.data);
      setDirty(false);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overridePopoverRef.current && !overridePopoverRef.current.contains(e.target as Node)) {
        setOverridePopover(INITIAL_OVERRIDE_POPOVER);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isSlotOccupied = (day: number, slotStartMins: number) => {
    const slotEnd = slotStartMins + slotDuration;
    return blocks.some((b) => {
      if (b.day_of_week !== day) return false;
      const bStart = timeToMinutes(b.start_time);
      const bEnd = timeToMinutes(b.end_time);
      return bStart < slotEnd && bEnd > slotStartMins;
    });
  };

  const addSlot = (dayOfWeek: number, startMins: number) => {
    const endMins = Math.min(startMins + slotDuration, DAY_END_MINS);
    if (endMins <= startMins) return;
    if (isSlotOccupied(dayOfWeek, startMins)) return;
    setError(null);
    setBlocks((prev) => [
      ...prev,
      {
        _tempId: `tmp-${Date.now()}-${Math.random()}`,
        day_of_week: dayOfWeek,
        start_time: minutesToTime(startMins),
        end_time: minutesToTime(endMins),
        slot_duration: slotDuration,
        buffer_time: DEFAULT_BUFFER,
      },
    ]);
    setDirty(true);
  };

  const removeBlock = (index: number) => {
    setError(null);
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleCopyMondayToWeekdays = () => {
    const mondayBlocks = blocks.filter((b) => b.day_of_week === 1);
    if (mondayBlocks.length === 0) return;
    const weekdayIndices = [2, 3, 4, 5];
    const filtered = blocks.filter((b) => b.day_of_week === 0 || b.day_of_week === 1 || b.day_of_week === 6);
    const copies = weekdayIndices.flatMap((day) =>
      mondayBlocks.map((b) => ({
        ...b,
        day_of_week: day,
        _tempId: `tmp-${Date.now()}-${day}-${Math.random()}`,
        id: undefined,
      }))
    );
    setBlocks([...filtered, ...copies]);
    setDirty(true);
  };

  const handleClearWeek = () => {
    setBlocks([]);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: AvailabilityBlockPayload[] = blocks.map((b) => ({
        day_of_week: b.day_of_week,
        start_time: b.start_time,
        end_time: b.end_time,
        slot_duration: b.slot_duration,
        buffer_time: b.buffer_time,
      }));
      const res = await expertAvailabilityPortalApi.bulkSave(payload);
      setBlocks(
        res.data.data.map((b: AvailabilityBlock) => ({
          ...b,
          _tempId: `srv-${b.id}`,
        }))
      );
      setDirty(false);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddOverride = async () => {
    if (!overridePopover.date) return;
    setError(null);
    try {
      const payload = {
        override_date: overridePopover.date,
        availability: overridePopover.available,
        start_time: overridePopover.available ? overridePopover.startTime : undefined,
        end_time: overridePopover.available ? overridePopover.endTime : undefined,
        buffer_time: overridePopover.available ? overridePopover.bufferTime : undefined,
      };
      await expertAvailabilityPortalApi.createOverride(payload);
      const res = await expertAvailabilityPortalApi.listOverrides();
      setOverrides(res.data.data);
      setOverridePopover(INITIAL_OVERRIDE_POPOVER);
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const handleDeleteOverride = async (id: number) => {
    setError(null);
    try {
      await expertAvailabilityPortalApi.deleteOverride(id);
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const blocksForDay = (day: number) => blocks.filter((b) => b.day_of_week === day);

  const getBlockStyle = (block: LocalBlock) => {
    const startMins = timeToMinutes(block.start_time);
    const endMins = timeToMinutes(block.end_time);
    const totalMins = DAY_END_MINS - DAY_START_MINS;
    const top = ((startMins - DAY_START_MINS) / totalMins) * 100;
    const height = ((endMins - startMins) / totalMins) * 100;
    return { top: `${top}%`, height: `${height}%` };
  };

  if (loading) {
    return (
      <ExpertPortalLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      </ExpertPortalLayout>
    );
  }

  return (
    <ExpertPortalLayout>
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1">Availability</p>
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">Set your consultation hours</h1>
          <p className="text-sm text-zinc-500 mt-1">
            One weekly rhythm. Adjust individual dates when life happens.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <dl className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">Effective from</dt>
              <dd className="text-zinc-900">{expert?.effective_from ?? "—"}</dd>
            </div>
            <div className="text-zinc-300 hidden sm:block pb-0.5" aria-hidden>
              →
            </div>
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">Effective until</dt>
              <dd className="text-zinc-900">{expert?.effective_until ?? "No end date"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">Session duration</dt>
              <dd className="text-zinc-900">{slotDuration} min</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 mb-0.5">Timezone</dt>
              <dd className="text-zinc-900">{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        <div className="mb-4 bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-zinc-200">
                <div className="p-2" />
                {DAYS.map((day, i) => {
                  const today = new Date().getDay();
                  return (
                    <div
                      key={day}
                      className="p-2 text-center text-sm font-medium text-zinc-700 border-l border-zinc-200"
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {day}
                        {i === today && (
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 inline-block" />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-[64px_repeat(7,1fr)] relative">
                <div className="relative">
                  {slotStarts.map((mins) => (
                    <div key={mins} className="h-8 flex items-start justify-end pr-2 pt-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400 leading-none">
                        {formatMinutesDisplay(mins)}
                      </span>
                    </div>
                  ))}
                </div>

                {DAYS.map((_, dayIndex) => (
                  <div key={dayIndex} className="relative border-l border-zinc-200">
                    {slotStarts.map((mins) => {
                      const occupied = isSlotOccupied(dayIndex, mins);
                      return (
                        <div
                          key={mins}
                          className={`h-8 border-b border-zinc-100 ${
                            !occupied ? "cursor-pointer hover:bg-zinc-50" : ""
                          }`}
                          onClick={() => {
                            if (!occupied) addSlot(dayIndex, mins);
                          }}
                        />
                      );
                    })}

                    {blocksForDay(dayIndex).map((block) => {
                      const style = getBlockStyle(block);
                      const blockIndex = blocks.findIndex((b) => b._tempId === block._tempId);
                      return (
                        <div
                          key={block._tempId}
                          title="Click to remove"
                          className="absolute left-0.5 right-0.5 bg-zinc-900 text-white rounded-sm px-1 py-0.5 text-[10px] cursor-pointer hover:bg-zinc-700 transition-colors duration-150 overflow-hidden z-10"
                          style={style}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBlock(blockIndex);
                          }}
                        >
                          <div className="font-medium leading-tight truncate">
                            {formatTimeDisplay(block.start_time)}–{formatTimeDisplay(block.end_time)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-8 text-sm">
          <button
            type="button"
            onClick={handleCopyMondayToWeekdays}
            className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-900 hover:underline"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Monday to weekdays
          </button>
          <button
            type="button"
            onClick={handleClearWeek}
            className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-800 hover:underline"
          >
            <Eraser className="w-3.5 h-3.5" />
            Clear week
          </button>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-zinc-900">Date overrides</h2>
            <button
              type="button"
              onClick={() =>
                setOverridePopover((p) => ({ ...INITIAL_OVERRIDE_POPOVER, open: !p.open }))
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <Plus className="w-4 h-4" />
              Add override
            </button>
          </div>

          {overridePopover.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
              <div
                ref={overridePopoverRef}
                className="bg-white rounded-xl border border-zinc-200 shadow-lg p-5 w-full max-w-sm mx-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-zinc-900">Add date override</h3>
                  <button
                    type="button"
                    onClick={() => setOverridePopover(INITIAL_OVERRIDE_POPOVER)}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Date</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm"
                      value={overridePopover.date}
                      onChange={(e) =>
                        setOverridePopover((p) => ({ ...p, date: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Status</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOverridePopover((p) => ({ ...p, available: false }))}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          !overridePopover.available
                            ? "bg-zinc-900 text-white border-zinc-900"
                            : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        Unavailable
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverridePopover((p) => ({ ...p, available: true }))}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          overridePopover.available
                            ? "bg-zinc-900 text-white border-zinc-900"
                            : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        Available
                      </button>
                    </div>
                  </div>
                  {overridePopover.available && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Start time</label>
                          <select
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm"
                            value={overridePopover.startTime}
                            onChange={(e) =>
                              setOverridePopover((p) => ({ ...p, startTime: e.target.value }))
                            }
                          >
                            {timeOptions.map((t) => (
                              <option key={t} value={t}>{formatTimeDisplay(t)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">End time</label>
                          <select
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm"
                            value={overridePopover.endTime}
                            onChange={(e) =>
                              setOverridePopover((p) => ({ ...p, endTime: e.target.value }))
                            }
                          >
                            {timeOptions.map((t) => (
                              <option key={t} value={t}>{formatTimeDisplay(t)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Buffer (min)</label>
                        <select
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm"
                          value={overridePopover.bufferTime}
                          onChange={(e) =>
                            setOverridePopover((p) => ({
                              ...p,
                              bufferTime: Number(e.target.value),
                            }))
                          }
                        >
                          {[0, 5, 10, 15, 20, 30].map((v) => (
                            <option key={v} value={v}>{v} min</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => setOverridePopover(INITIAL_OVERRIDE_POPOVER)}
                    className="px-4 py-2 rounded-lg border border-zinc-300 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddOverride}
                    disabled={!overridePopover.date}
                    className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Add override
                  </button>
                </div>
              </div>
            </div>
          )}

          {overrides.length === 0 ? (
            <p className="text-sm text-zinc-500">No date overrides configured yet.</p>
          ) : (
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              {overrides.map((o, idx) => (
                <div
                  key={o.id}
                  className={`flex items-center justify-between px-4 py-3 text-sm ${
                    idx > 0 ? "border-t border-zinc-100" : ""
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="font-medium text-zinc-900 shrink-0">
                      {new Date(o.override_date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {o.availability ? (
                      <span className="text-zinc-600 truncate">
                        {o.start_time && o.end_time
                          ? `${formatTimeDisplay(o.start_time)} – ${formatTimeDisplay(o.end_time)}`
                          : "Available"}
                        {o.buffer_time != null ? ` · ${o.buffer_time} min buffer` : ""}
                      </span>
                    ) : (
                      <span className="text-zinc-500">Unavailable</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteOverride(o.id)}
                    className="p-1.5 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                    aria-label="Remove override"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ExpertPortalLayout>
  );
}
