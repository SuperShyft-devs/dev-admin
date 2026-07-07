import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Search,
  Loader2,
  MoreVertical,
  Eye,
  Users,
  CheckCircle2,
} from "lucide-react";
import { ConsoleLayout } from "../../layouts/ConsoleLayout";
import { Modal } from "../../shared/ui/Modal";
import { useAuth } from "../../contexts/AuthContext";
import {
  consoleApi,
  getApiError,
  getApiErrorDetails,
  type Participant,
  type ConsoleEngagementListItem,
  type ConsoleParticipantBookResponse,
} from "../../lib/api";
import { fetchAllPages } from "../../lib/fetchAllPages";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(p: Participant): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
}

function formatBool(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function isParticipantBooked(p: Participant): boolean {
  return Boolean(p.booking_id?.trim());
}

function applyBookingToParticipant(
  p: Participant,
  result: ConsoleParticipantBookResponse
): Participant {
  return {
    ...p,
    booking_id: result.booking_id ?? p.booking_id,
    barcode: result.barcode ?? p.barcode,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

type ModalMode = "detail" | "book" | "cancel" | null;

export function EngagementConsolePage() {
  const { engagementId } = useParams<{ engagementId: string }>();
  const { employeeRole } = useAuth();
  const isAdmin = employeeRole === "admin";
  const isOrgManager = employeeRole === "organization_manager";
  const engId = Number(engagementId);

  const consoleListPath = isAdmin ? "/engagements" : "/engagements/console";
  const consoleListLabel = isAdmin
    ? "Back to Engagements"
    : isOrgManager
      ? "Back to your organization engagements"
      : "Back to your engagements";

  const [engagement, setEngagement] = useState<ConsoleEngagementListItem | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"not_running" | "forbidden" | "generic" | null>(null);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");

  const [actionMenuRow, setActionMenuRow] = useState<number | null>(null);
  const [selectedParticipant, setSelectedParticipant] =
    useState<Participant | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [barcode, setBarcode] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!engId || isNaN(engId)) return;
    setLoading(true);
    setError(null);
    setErrorKind(null);
    try {
      const [engRes, parts] = await Promise.all([
        consoleApi.getEngagement(engId),
        fetchAllPages<Participant>(
          (page, limit) =>
            consoleApi.listParticipants(engId, { page, limit }) as any,
          100
        ),
      ]);
      setEngagement(engRes.data.data);
      setParticipants(parts);
    } catch (err) {
      const details = getApiErrorDetails(err);
      if (details.code === "ENGAGEMENT_NOT_RUNNING") {
        setErrorKind("not_running");
        setError(
          "This engagement is not running. The console is only available while the engagement status is Running."
        );
      } else if (details.status === 403) {
        setErrorKind("forbidden");
        setError(
          isOrgManager
            ? "You must be assigned to this engagement and be the organization's contact person."
            : "You must be an onboarding assistant assigned to this engagement."
        );
      } else {
        setErrorKind("generic");
        setError(details.message);
      }
    } finally {
      setLoading(false);
    }
  }, [engId, isOrgManager]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dateOptions = useMemo(() => {
    const dates = new Set<string>();
    participants.forEach((p) => {
      if (p.engagement_date) dates.add(p.engagement_date);
    });
    return Array.from(dates).sort();
  }, [participants]);

  const departmentOptions = useMemo(() => {
    const deps = new Set<string>();
    participants.forEach((p) => {
      if (p.participant_department) deps.add(p.participant_department);
    });
    return Array.from(deps).sort();
  }, [participants]);

  const filtered = useMemo(() => {
    let rows = participants;

    if (dateFilter) {
      rows = rows.filter((p) => (p.engagement_date ?? "") === dateFilter);
    }
    if (departmentFilter) {
      rows = rows.filter(
        (p) => (p.participant_department ?? "") === departmentFilter
      );
    }

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          fullName(p).toLowerCase().includes(q) ||
          (p.phone ?? "").includes(q) ||
          (p.email ?? "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [participants, search, dateFilter, departmentFilter]);

  const openDetail = (p: Participant) => {
    setSelectedParticipant(p);
    setModalMode("detail");
    setActionMenuRow(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedParticipant(null);
    setBarcode("");
    setBookingError(null);
    setCancelRemarks("");
    setCancelError(null);
  };

  const openCancelModal = () => {
    setCancelRemarks("");
    setCancelError(null);
    setModalMode("cancel");
  };

  const openBookModal = () => {
    setBarcode("");
    setBookingError(null);
    setModalMode("book");
  };

  const isEngagementRunning =
    (engagement?.status ?? "").toLowerCase() === "running";

  const canBookParticipant = (p: Participant | null) =>
    Boolean(p && isEngagementRunning && !isParticipantBooked(p));

  const handleCreateBooking = async () => {
    if (!selectedParticipant || !engId) return;
    const trimmed = barcode.trim();
    if (!trimmed) {
      setBookingError("Barcode is required.");
      return;
    }
    setBookingLoading(true);
    setBookingError(null);
    const userId = selectedParticipant.user_id;
    try {
      const res = await consoleApi.bookParticipant(engId, userId, {
        barcode: trimmed,
      });
      const result = res.data.data;

      setParticipants((prev) =>
        prev.map((p) =>
          p.user_id === userId ? applyBookingToParticipant(p, result) : p
        )
      );
      setSelectedParticipant((prev) =>
        prev ? applyBookingToParticipant(prev, result) : prev
      );
      setBarcode("");
      setModalMode("detail");

      void fetchAllPages<Participant>(
        (page, limit) => consoleApi.listParticipants(engId, { page, limit }) as any,
        100
      ).then((parts) => {
        setParticipants(parts);
        const updated = parts.find((p) => p.user_id === userId);
        if (updated) setSelectedParticipant(updated);
      });
    } catch (err) {
      setBookingError(getApiError(err));
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedParticipant || !engId) return;
    const trimmed = cancelRemarks.trim();
    if (!trimmed) {
      setCancelError("Remarks are required.");
      return;
    }
    setCancelLoading(true);
    setCancelError(null);
    const userId = selectedParticipant.user_id;
    try {
      await consoleApi.cancelParticipantBooking(engId, userId, trimmed);
      setParticipants((prev) =>
        prev.map((p) =>
          p.user_id === userId
            ? { ...p, booking_id: null, barcode: null }
            : p
        )
      );
      setSelectedParticipant((prev) =>
        prev ? { ...prev, booking_id: null, barcode: null } : prev
      );
      setCancelRemarks("");
      setModalMode("detail");

      void fetchAllPages<Participant>(
        (page, limit) => consoleApi.listParticipants(engId, { page, limit }) as any,
        100
      ).then((parts) => {
        setParticipants(parts);
        const updated = parts.find((p) => p.user_id === userId);
        if (updated) setSelectedParticipant(updated);
      });
    } catch (err) {
      setCancelError(getApiError(err));
    } finally {
      setCancelLoading(false);
    }
  };

  useEffect(() => {
    if (actionMenuRow === null) return;
    const handleClick = () => setActionMenuRow(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [actionMenuRow]);

  if (!engId || isNaN(engId)) {
    return (
      <ConsoleLayout
        backHref={isAdmin ? "/engagements" : isOrgManager ? "/organisations" : undefined}
        backLabel={
          isAdmin ? "Back to Engagements" : isOrgManager ? "Back to Organisations" : undefined
        }
      >
        <div className="flex items-center justify-center h-64 text-zinc-500">
          Invalid engagement.
        </div>
      </ConsoleLayout>
    );
  }

  const isNotRunning =
    isAdmin &&
    engagement &&
    (engagement.status ?? "").toLowerCase() !== "running";

  return (
    <ConsoleLayout
      engagementName={engagement?.engagement_name ?? undefined}
      backHref={isAdmin ? "/engagements" : "/engagements/console"}
      backLabel={
        isAdmin
          ? "Back to Engagements"
          : isOrgManager
            ? "Your organization engagements"
            : "Your engagements"
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3 px-4">
          <p className="text-red-600 max-w-md">{error}</p>
          {(errorKind === "not_running" || errorKind === "forbidden") && (
            <Link
              to={consoleListPath}
              className="text-sm font-medium text-zinc-700 hover:text-zinc-900 underline"
            >
              {consoleListLabel}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {isNotRunning && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              This engagement is not running — read-only view.
            </div>
          )}
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Users className="w-4 h-4" />
              <span>
                {filtered.length}
                {filtered.length !== participants.length &&
                  ` / ${participants.length}`}{" "}
                participant{participants.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, email..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                />
              </div>
              {dateOptions.length > 1 && (
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="">All dates</option>
                  {dateOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              {departmentOptions.length > 1 && (
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="">All departments</option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600">
                    Name
                  </th>
                  <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600">
                    Phone
                  </th>
                  <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600 hidden sm:table-cell">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden xl:table-cell">
                    Age
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden lg:table-cell">
                    Collection Date
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden lg:table-cell">
                    Slot Time
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden md:table-cell">
                    Department
                  </th>
                  <th className="px-2 sm:px-4 py-3 font-medium text-zinc-600 w-10 sm:w-12">
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-zinc-400"
                    >
                      No participants found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr
                      key={
                        p.engagement_participant_id ??
                        `${p.user_id}-${p.engagement_id}`
                      }
                      onClick={() => openDetail(p)}
                      className="hover:bg-zinc-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 sm:px-4 py-3 font-medium text-zinc-900 truncate">
                        {fullName(p)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-zinc-600 truncate">
                        {p.phone ?? "—"}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-zinc-600 truncate hidden sm:table-cell">
                        {p.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden xl:table-cell">
                        {p.age ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                        {p.engagement_date ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                        {p.slot_start_time ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 truncate hidden md:table-cell">
                        {p.participant_department ?? "—"}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center relative">
                        <div className="flex items-center justify-center gap-1">
                          {isParticipantBooked(p) && (
                            <span
                              title="Booking complete"
                              aria-label="Booking complete"
                              className="inline-flex"
                            >
                              <CheckCircle2
                                className="w-4 h-4 text-emerald-600 shrink-0"
                                aria-hidden="true"
                              />
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionMenuRow(
                                actionMenuRow ===
                                  (p.engagement_participant_id ?? p.user_id)
                                  ? null
                                  : (p.engagement_participant_id ?? p.user_id)
                              );
                            }}
                            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                            aria-label="Actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                        {actionMenuRow ===
                          (p.engagement_participant_id ?? p.user_id) && (
                          <div className="absolute right-2 sm:right-4 top-full z-20 mt-0.5 w-36 bg-white border border-zinc-200 rounded-lg shadow-lg py-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail(p);
                              }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Participant modals */}
      <Modal
        open={modalMode === "detail"}
        onClose={closeModal}
        title="Participant Details"
        maxWidthClassName="max-w-lg"
      >
        {selectedParticipant && (
          <div className="space-y-4">
            <ParticipantDetail participant={selectedParticipant} />
            {canBookParticipant(selectedParticipant) && (
              <div className="flex justify-end pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={openBookModal}
                  className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
                >
                  Book
                </button>
              </div>
            )}
            {isParticipantBooked(selectedParticipant) && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
                  <span className="text-sm font-medium text-emerald-700">Booking complete</span>
                </div>
                {isEngagementRunning && (
                  <button
                    type="button"
                    onClick={openCancelModal}
                    className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50"
                  >
                    Cancel booking
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={modalMode === "cancel"}
        onClose={closeModal}
        title="Cancel Booking"
        maxWidthClassName="max-w-md"
      >
        {selectedParticipant && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Cancel Healthians booking for {fullName(selectedParticipant)}.
            </p>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Remarks
              </label>
              <textarea
                value={cancelRemarks}
                onChange={(e) => setCancelRemarks(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="Reason for cancellation"
              />
            </div>
            {cancelError && (
              <p className="text-sm text-red-600">{cancelError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCancelBooking}
                disabled={cancelLoading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {cancelLoading ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modalMode === "book"}
        onClose={closeModal}
        title="Create Booking"
        maxWidthClassName="max-w-md"
      >
        {selectedParticipant && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Create a Healthians booking for{" "}
              <span className="font-medium text-zinc-900">{fullName(selectedParticipant)}</span>.
            </p>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Barcode</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Enter barcode"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            {bookingError && <p className="text-sm text-red-600">{bookingError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateBooking()}
                disabled={bookingLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
              >
                {bookingLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Booking
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConsoleLayout>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function ParticipantDetail({ participant: p }: { participant: Participant }) {
  const field = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm text-zinc-900">{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {field("Name", fullName(p))}
      {field("Phone", p.phone)}
      {field("Email", p.email)}
      {field("Age", p.age)}
      {field("Blood Collection Date", p.engagement_date)}
      {field("Slot Time", p.slot_start_time)}
      {field("Department", p.participant_department)}
      {field("Employee ID", p.participants_employee_id)}
      {field("Blood Group", p.participant_blood_group)}
      {field("Doctor Consultation", formatBool(p.want_doctor_consultation))}
      {field(
        "Nutritionist Consultation",
        formatBool(p.want_nutritionist_consultation)
      )}
      {field(
        "Doctor + Nutritionist",
        formatBool(p.want_doctor_and_nutritionist_consultation)
      )}
      {field("Barcode", p.barcode)}
      {field("Booking ID", p.booking_id)}
      {field("Booked by user ID", p.booked_by_user_id)}
    </div>
  );
}
