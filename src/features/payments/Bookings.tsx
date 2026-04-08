import { useState, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import {
  paymentsApi,
  type BookingListItem,
  getApiError,
} from "../../lib/api";
import { BookingDetailModal } from "./BookingDetailModal";

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

function formatPaymentMethod(m: string | null): string {
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

function paymentStatusBadge(status: string | null) {
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

function bookedByCell(row: BookingListItem) {
  const name = row.payer_user_name;
  if (name == null || name === "" || name === "—") {
    return <span className="text-zinc-400">—</span>;
  }
  const n = row.checkout_line_count ?? 1;
  const selfPay = row.payer_user_id != null && row.payer_user_id === row.user_id;
  return (
    <div className="flex flex-col gap-0.5 max-w-[200px]">
      <span className="font-medium text-zinc-900 leading-tight">{name}</span>
      <span className="text-xs text-zinc-600 leading-snug">
        Paying for{" "}
        <span className="font-semibold text-zinc-800 tabular-nums">{n}</span>{" "}
        {n === 1 ? "member" : "members"}
        {selfPay && n === 1 ? (
          <span className="text-zinc-500 font-normal"> (self)</span>
        ) : null}
      </span>
    </div>
  );
}

export function Bookings() {
  const [data, setData] = useState<BookingListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "confirmed" | "cancelled">("");
  const [sortKey, setSortKey] = useState("booking_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await paymentsApi.listBookings({
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        sort_key: sortKey,
        sort_dir: sortDir,
      });
      setData(res.data.data.items);
      setTotal(res.data.data.total);
    } catch (err) {
      setError(getApiError(err));
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, sortKey, sortDir]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const openView = (row: BookingListItem) => {
    setSelectedBookingId(row.booking_id);
    setModalOpen(true);
  };

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "desc"));
    setSortKey(key);
  };

  const columns: Column<BookingListItem>[] = [
    {
      key: "booking_id",
      label: "Booking ID",
      sortable: true,
      render: (row) => (
        <span className="font-medium text-zinc-900 tabular-nums">{row.booking_id}</span>
      ),
    },
    {
      key: "user_name",
      label: "Member",
      render: (row) => (
        <div className="flex flex-col gap-0.5 max-w-[160px]">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">
            Package for
          </span>
          <span className="text-zinc-900 font-medium leading-tight">{row.user_name}</span>
        </div>
      ),
    },
    {
      key: "payer_user_name",
      label: "Booked by",
      render: (row) => bookedByCell(row),
    },
    {
      key: "entity_name",
      label: "Package",
      render: (row) => <span className="text-zinc-700">{row.entity_name}</span>,
    },
    {
      key: "razorpay_order_id",
      label: "Razorpay order",
      hideOnMobile: true,
      render: (row) => {
        const multi =
          row.checkout_line_count != null && row.checkout_line_count > 1;
        if (!row.razorpay_order_id) {
          return <span className="text-zinc-400">—</span>;
        }
        return (
          <div className="flex flex-col gap-0.5">
            <span
              className="text-zinc-700 font-mono text-xs truncate max-w-[140px]"
              title={row.razorpay_order_id}
            >
              {row.razorpay_order_id}
            </span>
            {multi ? (
              <span className="text-[10px] uppercase tracking-wide text-teal-700 font-medium">
                Same checkout · {row.checkout_line_count} members
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "amount_paise",
      label: "Amount",
      render: (row) => (
        <span className="text-zinc-900 tabular-nums">{formatAmount(row.amount_paise)}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => bookingStatusBadge(row.status),
    },
    {
      key: "payment_status",
      label: "Payment",
      hideOnMobile: true,
      render: (row) => paymentStatusBadge(row.payment_status),
    },
    {
      key: "payment_method",
      label: "Method",
      hideOnTablet: true,
      render: (row) => (
        <span className="text-zinc-600">{formatPaymentMethod(row.payment_method)}</span>
      ),
    },
    {
      key: "booked_at",
      label: "Booked at",
      hideOnTablet: true,
      render: (row) => (
        <span className="text-zinc-600 whitespace-nowrap">{formatBookedDate(row.booked_at)}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Bookings</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          Each row is one member&apos;s package. <strong className="text-zinc-800">Booked by</strong>{" "}
          shows who paid and how many members are included in that Razorpay checkout.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by user or package name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "" | "pending" | "confirmed" | "cancelled")
          }
          className="sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={data}
            keyExtractor={(r) => r.booking_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={openView}
            firstColumnClickableView={false}
            pagination={{
              page,
              limit,
              total,
              onPageChange: setPage,
            }}
          />
        )}
      </div>

      <BookingDetailModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedBookingId(null);
        }}
        bookingId={selectedBookingId}
      />
    </div>
  );
}
