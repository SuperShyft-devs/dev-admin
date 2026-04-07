import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { paymentsApi, type BookingDetail, getApiError } from "../../lib/api";

function formatAmount(paise: number): string {
  const rupees = paise / 100;
  return "₹" + rupees.toLocaleString("en-IN");
}

function formatBookedDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatPaymentMethod(m: string | null | undefined): string {
  if (m == null || m === "") return "—";
  const key = m.toLowerCase();
  const map: Record<string, string> = {
    upi: "UPI",
    card: "Card",
    netbanking: "Net Banking",
    wallet: "Wallet",
  };
  return map[key] ?? m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
}

function bookingStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "pending") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800">
        Pending
      </span>
    );
  }
  if (s === "confirmed") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">
        Confirmed
      </span>
    );
  }
  if (s === "cancelled") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-800">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700">
      {status}
    </span>
  );
}

function paymentStatusBadge(status: string | null | undefined) {
  if (status == null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-600">
        Awaiting
      </span>
    );
  }
  const s = status.toLowerCase();
  if (s === "success") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">
        Success
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-800">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700">
      {status}
    </span>
  );
}

interface BookingDetailModalProps {
  open: boolean;
  onClose: () => void;
  bookingId: number | null;
}

export function BookingDetailModal({ open, onClose, bookingId }: BookingDetailModalProps) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || bookingId == null) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    paymentsApi
      .getBooking(bookingId)
      .then((res) => {
        setDetail(res.data);
      })
      .catch((err) => {
        setError(getApiError(err));
        setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [open, bookingId]);

  const field = (label: string, value: ReactNode) => (
    <div>
      <span className="text-zinc-500 text-xs uppercase tracking-wide">{label}</span>
      <div className="text-zinc-900 mt-0.5 text-sm">{value}</div>
    </div>
  );

  const paymentFailed = (detail?.payment_status ?? "").toLowerCase() === "failed";

  return (
    <Modal open={open} onClose={onClose} title="Booking details" maxWidthClassName="max-w-2xl">
      {loading && (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      )}
      {!loading && error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}
      {!loading && !error && detail && (
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Booking info
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("Booking ID", String(detail.booking_id))}
              {field("User name", detail.user_name ?? "—")}
              {field("Package name", detail.entity_name)}
              {field("Amount", formatAmount(detail.amount_paise))}
              {field("Currency", detail.currency || "INR")}
              {field("Booking status", bookingStatusBadge(detail.booking_status))}
              {field("Booked at", formatBookedDate(detail.booked_at))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Payment info
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("Payment status", paymentStatusBadge(detail.payment_status))}
              {field("Payment method", formatPaymentMethod(detail.payment_method))}
              {field("Razorpay payment ID", detail.razorpay_payment_id ?? "—")}
              {field(
                "Signature verified",
                detail.signature_verified === true ? (
                  <span className="text-emerald-600 font-medium">Yes ✓</span>
                ) : detail.signature_verified === false ? (
                  <span className="text-red-600 font-medium">No</span>
                ) : (
                  "—"
                )
              )}
              {field("Paid at", detail.paid_at ? formatBookedDate(detail.paid_at) : "—")}
              {paymentFailed && detail.failure_reason ? (
                <div className="sm:col-span-2">{field("Failure reason", detail.failure_reason)}</div>
              ) : null}
            </div>
          </div>
          <div className="pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
