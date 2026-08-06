import { useState, useMemo } from "react";
import { Loader2, CheckCircle2, MapPin, Calendar, Lock, Package } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { consoleApi, getApiError, type Participant } from "../../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  engagementId: number;
  participant: Participant;
  onBooked: (bookingId: string) => void;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = [
  { step: 1 as Step, label: "Address", icon: MapPin },
  { step: 2 as Step, label: "Slot", icon: Calendar },
  { step: 3 as Step, label: "Book", icon: Package },
  { step: 4 as Step, label: "Done", icon: CheckCircle2 },
];

interface SlotItem {
  end_time?: string;
  slot_date?: string;
  slot_time?: string;
  stm_id?: string;
}

function fullName(p: Participant): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
}

function getNextDates(count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function HomeCollectionBookingModal({ open, onClose, engagementId, participant, onBooked }: Props) {
  const [step, setStep] = useState<Step>(1);

  const [addressLine, setAddressLine] = useState(participant.address ?? "");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState(participant.city ?? "");
  const [pincode, setPincode] = useState(participant.pin_code ?? "");
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  const availableDates = useMemo(() => getNextDates(10), []);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const [bookingId, setBookingId] = useState<string | null>(null);

  const handleCheckServiceability = async () => {
    if (!addressLine.trim()) { setStep1Error("Address is required."); return; }
    if (!city.trim()) { setStep1Error("City is required."); return; }
    if (!pincode.trim()) { setStep1Error("Pincode is required."); return; }

    setStep1Loading(true);
    setStep1Error(null);
    try {
      await consoleApi.checkHomeCollectionServiceAvailability(engagementId, participant.user_id, {
        address_line: addressLine.trim(),
        landmark: landmark.trim() || undefined,
        city: city.trim(),
        pincode: pincode.trim(),
      });
      setStep(2);
    } catch (err) {
      setStep1Error(getApiError(err));
    } finally {
      setStep1Loading(false);
    }
  };

  const handleFetchSlots = async (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setSlotsLoading(true);
    setSlotsError(null);
    setSlots([]);
    try {
      const res = await consoleApi.getHomeCollectionAvailableSlots(engagementId, participant.user_id, {
        blood_collection_date: dateStr,
      });
      setSlots(res.data.data.slots ?? []);
    } catch (err) {
      setSlotsError(getApiError(err));
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleLockSlot = async () => {
    if (!selectedSlot || !selectedDate) return;
    setLockLoading(true);
    setLockError(null);
    try {
      await consoleApi.lockHomeCollectionSlot(engagementId, participant.user_id, {
        blood_collection_date: selectedDate,
        blood_collection_time_slot_id: selectedSlot.stm_id ?? "",
        blood_collection_time_slot: selectedSlot.slot_time ?? "",
      });
      setStep(3);
    } catch (err) {
      setLockError(getApiError(err));
    } finally {
      setLockLoading(false);
    }
  };

  const handleBook = async () => {
    setBookLoading(true);
    setBookError(null);
    try {
      const res = await consoleApi.bookHomeCollection(engagementId, participant.user_id);
      const bid = res.data.data.booking_id ?? "";
      setBookingId(bid);
      setStep(4);
      onBooked(bid);
    } catch (err) {
      setBookError(getApiError(err));
    } finally {
      setBookLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setStep1Error(null);
    setSlotsError(null);
    setLockError(null);
    setBookError(null);
    setSlots([]);
    setSelectedDate(null);
    setSelectedSlot(null);
    setBookingId(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Home Collection Booking" maxWidthClassName="max-w-xl">
      <div className="space-y-5">
        <p className="text-sm text-zinc-600">
          Booking for <span className="font-medium text-zinc-900">{fullName(participant)}</span>
        </p>

        {/* Progress bar */}
        <div className="flex items-center gap-1">
          {STEP_LABELS.map(({ step: s, label, icon: Icon }, idx) => {
            const isComplete = step > s;
            const isCurrent = step === s;
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      isComplete
                        ? "bg-emerald-600 text-white"
                        : isCurrent
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {isComplete ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span
                    className={`mt-1 text-xs ${isCurrent ? "font-medium text-zinc-900" : "text-zinc-400"}`}
                  >
                    {label}
                  </span>
                </div>
                {idx < STEP_LABELS.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 -mt-4 ${step > s ? "bg-emerald-600" : "bg-zinc-200"}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Address */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
              <input
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Enter full address"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Landmark</label>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="Near..."
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Pincode</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="Pincode"
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>
            {step1Error && <p className="text-sm text-red-600">{step1Error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCheckServiceability()}
                disabled={step1Loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
              >
                {step1Loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Check Availability
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Date & Slot Selection */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Select Date</label>
              <div className="flex flex-wrap gap-2">
                {availableDates.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => void handleFetchSlots(d)}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      selectedDate === d
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {formatDate(d)}
                  </button>
                ))}
              </div>
            </div>

            {slotsLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            )}

            {slotsError && <p className="text-sm text-red-600">{slotsError}</p>}

            {!slotsLoading && slots.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Available Slots</label>
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {slots.map((slot) => (
                    <button
                      key={slot.stm_id}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`px-3 py-2 rounded-lg border text-sm text-center transition-colors ${
                        selectedSlot?.stm_id === slot.stm_id
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {slot.slot_time ?? "—"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!slotsLoading && selectedDate && slots.length === 0 && !slotsError && (
              <p className="text-sm text-zinc-500 text-center py-4">No slots available for this date.</p>
            )}

            {lockError && <p className="text-sm text-red-600">{lockError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleLockSlot()}
                disabled={!selectedSlot || lockLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
              >
                {lockLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <Lock className="w-4 h-4" />
                Lock Slot
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm & Book */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
              <h4 className="text-sm font-medium text-zinc-900">Booking Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-zinc-500">Participant</span>
                <span className="text-zinc-900">{fullName(participant)}</span>
                <span className="text-zinc-500">Address</span>
                <span className="text-zinc-900">{addressLine || "—"}</span>
                <span className="text-zinc-500">City</span>
                <span className="text-zinc-900">{city || "—"}</span>
                <span className="text-zinc-500">Pincode</span>
                <span className="text-zinc-900">{pincode || "—"}</span>
                <span className="text-zinc-500">Date</span>
                <span className="text-zinc-900">{selectedDate ? formatDate(selectedDate) : "—"}</span>
                <span className="text-zinc-500">Slot</span>
                <span className="text-zinc-900">{selectedSlot?.slot_time ?? "—"}</span>
              </div>
            </div>
            {bookError && <p className="text-sm text-red-600">{bookError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBook()}
                disabled={bookLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
              >
                {bookLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Booking
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <div>
              <h4 className="text-lg font-medium text-zinc-900">Booking Created</h4>
              <p className="text-sm text-zinc-600 mt-1">
                Healthians booking has been placed successfully.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Booking ID</span>
              <p className="text-lg font-mono font-semibold text-emerald-900 mt-0.5">{bookingId}</p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
