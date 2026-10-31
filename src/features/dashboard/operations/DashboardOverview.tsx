import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CreditCard,
  MapPin,
  Ticket,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { NotificationItem } from "../../../lib/api";
import type {
  EngagementBuckets,
  ParticipantIssueBuckets,
  PaymentStatusTotals,
  PendingPaymentRow,
  SectionState,
  ServiceabilityIssueRow,
  TicketBuckets,
} from "./operationsTypes";
import { pieSlices, type MonthPoint } from "./overviewChartUtils";

export type OverviewUsersStats = {
  show: boolean;
  total: number | null;
  active: number | null;
  growth: MonthPoint[];
  loading: boolean;
  error: string | null;
};

const ISSUE_SERIES = [
  { key: "questionnaire" as const, label: "Questionnaire", barClass: "bg-amber-500" },
  { key: "bloodReport" as const, label: "Blood report", barClass: "bg-orange-500" },
  { key: "bioAi" as const, label: "Bio-AI", barClass: "bg-red-500" },
];

const CARD =
  "bg-white rounded-xl border border-zinc-200 p-3 sm:p-4 h-full min-h-[13rem] flex flex-col";

function ViewAllButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 self-start text-xs font-medium text-zinc-600 hover:text-zinc-900 disabled:text-zinc-300 disabled:cursor-not-allowed whitespace-nowrap"
    >
      View all
    </button>
  );
}

function HistogramLineChart({ points }: { points: MonthPoint[] }) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const width = 320;
  const chartH = 88;
  const labelH = 16;
  const height = chartH + labelH;
  const padX = 4;
  const padY = 8;
  if (points.length === 0) {
    return <p className="text-xs text-zinc-500">No yearly user data yet.</p>;
  }
  const added = points.map((p, i) =>
    p.count != null
      ? Math.max(0, p.count)
      : i === 0
        ? Math.max(0, p.value)
        : Math.max(0, p.value - points[i - 1].value)
  );
  const maxBar = Math.max(...added, 1);
  const maxLine = Math.max(...points.map((p) => p.value), 1);
  const innerW = width - padX * 2;
  const slot = points.length === 1 ? innerW : innerW / points.length;
  const gap = Math.min(2, slot * 0.08);
  const barW = Math.max(4, slot - gap);
  const coords = points.map((p, i) => {
    const x0 = padX + slot * i;
    const x = x0 + slot / 2;
    const barH = (added[i] / maxBar) * (chartH - padY * 2);
    const lineY = chartH - padY - (p.value / maxLine) * (chartH - padY * 2);
    return { x0, x, barH, lineY, added: added[i], ...p };
  });
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.lineY.toFixed(1)}`).join(" ");
  const hovered = coords.find((c) => c.key === hoverKey) ?? null;

  return (
    <div className="relative w-full">
      {hovered ? (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-1 z-10 rounded-md border border-zinc-200 bg-white px-2 py-1 shadow-sm text-[10px] text-zinc-700 whitespace-nowrap">
          <p className="font-semibold text-zinc-900">{hovered.label}</p>
          <p>
            New {hovered.added.toLocaleString()} · Total {hovered.value.toLocaleString()}
          </p>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[104px]"
        onMouseLeave={() => setHoverKey(null)}
      >
        {coords.map((c) => (
          <g key={c.key}>
            <rect
              x={c.x0}
              y={0}
              width={slot}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoverKey(c.key)}
            />
            <rect
              x={c.x0 + gap / 2}
              y={chartH - padY - c.barH}
              width={barW}
              height={Math.max(c.barH, c.added > 0 ? 2 : 0)}
              fill={hoverKey === c.key ? "#34d399" : "#a7f3d0"}
              className="pointer-events-none"
            />
            <text
              x={c.x}
              y={height - 2}
              textAnchor="middle"
              className="fill-zinc-400"
              style={{ fontSize: points.length > 10 ? 8 : 10 }}
            >
              {c.label}
            </text>
          </g>
        ))}
        <path
          d={line}
          fill="none"
          stroke="#059669"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="pointer-events-none"
        />
        {coords.map((c) => (
          <circle
            key={`${c.key}-pt`}
            cx={c.x}
            cy={c.lineY}
            r={hoverKey === c.key ? 3.5 : 2.5}
            fill="#059669"
            className="pointer-events-none"
          />
        ))}
      </svg>
      <div className="flex justify-center gap-3 text-[10px] text-zinc-400 mt-0.5">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-emerald-200" />
          New
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-px bg-emerald-600" />
          Total
        </span>
      </div>
    </div>
  );
}

/** Issue buckets; bar heights are % of participants in the scanned engagement set. */
function ComparisonColumns({
  participantsInScope,
  items,
}: {
  participantsInScope: number;
  items: { key: string; label: string; count: number; barClass: string }[];
}) {
  const denom = Math.max(participantsInScope, 1);
  return (
    <div className="flex-1 flex items-end justify-around gap-2 pt-1 min-h-[8rem]">
      {items.map((item) => {
        const pct = Math.round((item.count / denom) * 100);
        return (
          <div key={item.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-zinc-800 tabular-nums">
              {item.count.toLocaleString()}
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">{pct}%</span>
            <div className="w-full max-w-[2.25rem] h-[5.5rem] rounded-t-md bg-zinc-100 flex items-end overflow-hidden">
              <div
                className={`w-full rounded-t-md transition-all ${item.barClass}`}
                style={{ height: `${Math.max(item.count > 0 ? 8 : 0, pct)}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-600 text-center leading-tight">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusPie({
  slices,
}: {
  slices: { key: string; label: string; value: number; color: string; pct: number }[];
}) {
  const size = 96;
  const r = 36;
  const cx = size / 2;
  const cy = size / 2;
  const total = slices.reduce((s, x) => s + x.value, 0);
  let angle = -Math.PI / 2;
  const paths: { d: string; color: string; key: string }[] = [];

  if (total <= 0) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-24 h-24 rounded-full border-[10px] border-zinc-100 shrink-0" />
        <p className="text-xs text-zinc-500">No payments to chart.</p>
      </div>
    );
  }

  for (const slice of slices) {
    if (slice.value <= 0) continue;
    const sweep = (slice.value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    paths.push({
      key: slice.key,
      color: slice.color,
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
    });
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill={p.color} />
        ))}
        <circle cx={cx} cy={cy} r={18} fill="white" />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          className="fill-zinc-900"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {total.toLocaleString()}
        </text>
      </svg>
      <ul className="space-y-1 min-w-0">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="truncate">
              {s.label}{" "}
              <span className="font-semibold text-zinc-800 tabular-nums">{s.value.toLocaleString()}</span>
              <span className="text-zinc-400"> ({s.pct}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 flex-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-24 bg-zinc-100 rounded animate-pulse" />
          <div className="h-2.5 w-full bg-zinc-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function DashboardOverview({
  users,
  engagements,
  participants,
  payments,
  paymentStatusTotals,
  notifications,
  tickets,
  bookingIssues,
  showEngagements,
  showParticipants,
  showPayments,
  showNotifications,
  showTickets,
  showBookingIssues,
  onViewAllEngagements,
  onViewAllIssues,
  onViewAllPayments,
  onViewAllNotifications,
  onViewAllTickets,
  onViewAllBookingIssues,
}: {
  users: OverviewUsersStats;
  engagements: SectionState<EngagementBuckets>;
  participants: SectionState<ParticipantIssueBuckets>;
  payments: SectionState<PendingPaymentRow[]>;
  paymentStatusTotals: SectionState<PaymentStatusTotals>;
  notifications: SectionState<NotificationItem[]>;
  tickets: SectionState<TicketBuckets>;
  bookingIssues: SectionState<ServiceabilityIssueRow[]>;
  showEngagements: boolean;
  showParticipants: boolean;
  showPayments: boolean;
  showNotifications: boolean;
  showTickets: boolean;
  showBookingIssues: boolean;
  onViewAllEngagements: () => void;
  onViewAllIssues: () => void;
  onViewAllPayments: () => void;
  onViewAllNotifications: () => void;
  onViewAllTickets: () => void;
  onViewAllBookingIssues: () => void;
}) {
  const navigate = useNavigate();

  const engLoading = engagements.status === "loading";
  const engReady = engagements.status === "ready";
  const engError = engagements.status === "error" ? engagements.message : null;
  const weekCount = engReady ? engagements.data.runningThisWeek.length : 0;
  const todayCount = engReady ? engagements.data.runningToday.length : 0;

  const anyCard =
    users.show ||
    showEngagements ||
    showParticipants ||
    showPayments ||
    showNotifications ||
    showTickets ||
    showBookingIssues;
  if (!anyCard) return null;

  const partLoading = participants.status === "loading";
  const partReady = participants.status === "ready";
  const partError = participants.status === "error" ? participants.message : null;
  const issueSummary = partReady ? participants.data.summary : null;
  const issueCounts = issueSummary
    ? {
        questionnaire: issueSummary.missingQuestionnaire,
        bloodReport: issueSummary.missingBloodReport,
        bioAi: issueSummary.missingBioAiReport,
      }
    : partReady
      ? {
          questionnaire: participants.data.missingQuestionnaire.length,
          bloodReport: participants.data.missingBloodReport.length,
          bioAi: participants.data.missingBioAiReport.length,
        }
      : { questionnaire: 0, bloodReport: 0, bioAi: 0 };
  const totalIssues =
    issueCounts.questionnaire + issueCounts.bloodReport + issueCounts.bioAi;
  const totalParticipants = partReady ? participants.data.totalParticipants : 0;
  const participantsInScope = issueSummary?.participantsInScope ?? 0;

  const payAttentionCount = payments.status === "ready" ? payments.data.length : 0;
  const totalsLoading = paymentStatusTotals.status === "loading";
  const totalsReady = paymentStatusTotals.status === "ready";
  const totalsError =
    paymentStatusTotals.status === "error" ? paymentStatusTotals.message : null;
  const paySlices = totalsReady
    ? pieSlices([
        {
          key: "pending",
          label: "Pending",
          value: paymentStatusTotals.data.pending,
          color: "#f59e0b",
        },
        {
          key: "confirmed",
          label: "Confirmed",
          value: paymentStatusTotals.data.confirmed,
          color: "#10b981",
        },
        {
          key: "cancelled",
          label: "Cancelled",
          value: paymentStatusTotals.data.cancelled,
          color: "#a1a1aa",
        },
      ])
    : [];

  const notifLoading = notifications.status === "loading";
  const notifReady = notifications.status === "ready";
  const notifError = notifications.status === "error" ? notifications.message : null;
  const notifCount = notifReady ? notifications.data.length : 0;

  const ticketLoading = tickets.status === "loading";
  const ticketReady = tickets.status === "ready";
  const ticketError = tickets.status === "error" ? tickets.message : null;
  const openTicketCount = ticketReady ? tickets.data.openCount : 0;
  const resolvedTicketCount = ticketReady ? tickets.data.resolvedCount : 0;
  const closedTicketCount = ticketReady ? tickets.data.closedCount : 0;
  const ticketTotal = openTicketCount + resolvedTicketCount + closedTicketCount;

  const bookingLoading = bookingIssues.status === "loading";
  const bookingReady = bookingIssues.status === "ready";
  const bookingError = bookingIssues.status === "error" ? bookingIssues.message : null;
  const bookingCount = bookingReady ? bookingIssues.data.length : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
      {users.show ? (
        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 shrink-0">
                <UserRound className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900">Users</h2>
                {!users.loading && !users.error ? (
                  <>
                    <p className="text-[11px] text-zinc-400 tabular-nums">
                      {(users.total ?? 0).toLocaleString()} total · {(users.active ?? 0).toLocaleString()}{" "}
                      active
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {users.growth.length > 0 && users.growth[0].key.includes("-")
                        ? "Users by month"
                        : "Users by year"}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
            <ViewAllButton
              onClick={() => navigate("/users")}
              disabled={users.loading || Boolean(users.error)}
            />
          </div>
          {users.error ? (
            <p className="text-xs text-red-600">{users.error}</p>
          ) : users.loading ? (
            <CardSkeleton rows={2} />
          ) : (
            <HistogramLineChart points={users.growth} />
          )}
        </div>
      ) : null}

      {showEngagements ? (
        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-700 shrink-0">
                <CalendarCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900">Engagements</h2>
              </div>
            </div>
            <ViewAllButton
              onClick={onViewAllEngagements}
              disabled={engLoading || Boolean(engError) || (todayCount === 0 && weekCount === 0)}
            />
          </div>
          {engError ? (
            <p className="text-xs text-red-600">{engError}</p>
          ) : engLoading ? (
            <CardSkeleton rows={2} />
          ) : todayCount === 0 && weekCount === 0 ? (
            <p className="text-sm text-zinc-500">No running or scheduled engagements.</p>
          ) : (
            <div className="flex-1 flex flex-col justify-center gap-3">
              <div>
                <p className="text-[11px] text-zinc-400">Running today</p>
                <p className="text-3xl font-semibold text-zinc-900 tabular-nums leading-none mt-0.5">
                  {todayCount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-400">Running this week</p>
                <p className="text-3xl font-semibold text-zinc-900 tabular-nums leading-none mt-0.5">
                  {weekCount.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showTickets ? (
        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-amber-50 text-amber-700 shrink-0">
                <Ticket className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900">Tickets</h2>
                {!ticketLoading && !ticketError ? (
                  <p className="text-[11px] text-zinc-400 tabular-nums">
                    {ticketTotal.toLocaleString()} total raised
                  </p>
                ) : null}
              </div>
            </div>
            <ViewAllButton
              onClick={onViewAllTickets}
              disabled={ticketLoading || Boolean(ticketError) || openTicketCount === 0}
            />
          </div>
          {ticketError ? (
            <p className="text-xs text-red-600">{ticketError}</p>
          ) : ticketLoading ? (
            <CardSkeleton />
          ) : ticketTotal === 0 ? (
            <p className="text-sm text-zinc-500">No tickets right now.</p>
          ) : (
            <StatusPie
              slices={pieSlices([
                { key: "open", label: "Open", value: openTicketCount, color: "#f59e0b" },
                { key: "resolved", label: "Resolved", value: resolvedTicketCount, color: "#10b981" },
                { key: "closed", label: "Closed", value: closedTicketCount, color: "#a1a1aa" },
              ])}
            />
          )}
        </div>
      ) : null}

      {showPayments ? (
        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-amber-50 text-amber-700 shrink-0">
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900">Payments</h2>
                <p className="text-[11px] text-zinc-400">
                  Status mix
                  {payAttentionCount > 0
                    ? ` · ${payAttentionCount.toLocaleString()} pending >15m`
                    : ""}
                </p>
              </div>
            </div>
            <ViewAllButton
              onClick={onViewAllPayments}
              disabled={
                payments.status === "loading" ||
                payments.status === "error" ||
                payAttentionCount === 0
              }
            />
          </div>
          {totalsError ? (
            <p className="text-xs text-red-600">{totalsError}</p>
          ) : totalsLoading ? (
            <CardSkeleton rows={2} />
          ) : (
            <StatusPie slices={paySlices} />
          )}
        </div>
      ) : null}

      {showBookingIssues ? (
        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-red-50 text-red-700 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-zinc-900">Booking issues</h2>
            </div>
            <ViewAllButton
              onClick={onViewAllBookingIssues}
              disabled={bookingLoading || Boolean(bookingError) || bookingCount === 0}
            />
          </div>
          {bookingError ? (
            <p className="text-xs text-red-600">{bookingError}</p>
          ) : bookingLoading ? (
            <CardSkeleton rows={2} />
          ) : (
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-3xl font-semibold text-zinc-900 tabular-nums leading-none">
                {bookingCount.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                Serviceability sync failures that need follow-up.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {showParticipants ? (
        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-900">Participant issues</h2>
              {!partLoading && !partError ? (
                <p className="text-[11px] text-zinc-400 tabular-nums mt-0.5">
                  {totalParticipants.toLocaleString()} participants
                  <span className="text-zinc-400"> · running and scheduled engagements</span>
                  {issueSummary ? (
                    <span className="text-zinc-400">
                      {" "}
                      · chart from {issueSummary.engagementsInScope.toLocaleString()} engagement
                      {issueSummary.engagementsInScope === 1 ? "" : "s"}
                      {issueSummary.limitReached ? " (first 20)" : ""}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <ViewAllButton
              onClick={onViewAllIssues}
              disabled={partLoading || Boolean(partError) || totalIssues === 0}
            />
          </div>
          {partError ? (
            <p className="text-xs text-red-600">{partError}</p>
          ) : partLoading ? (
            <CardSkeleton />
          ) : totalParticipants === 0 ? (
            <p className="text-sm text-zinc-500">No participants in running or scheduled engagements.</p>
          ) : issueSummary == null ? (
            <p className="text-sm text-zinc-500">
              Issue breakdown is unavailable (overview operations data did not load). Refresh or open
              View all for participant details.
            </p>
          ) : participantsInScope === 0 ? (
            <p className="text-sm text-zinc-500">No participants in the scanned running or scheduled engagements.</p>
          ) : (
            <ComparisonColumns
              participantsInScope={participantsInScope}
              items={ISSUE_SERIES.map((series) => ({
                key: series.key,
                label: series.label,
                count: issueCounts[series.key],
                barClass: series.barClass,
              }))}
            />
          )}
        </div>
      ) : null}

      {showNotifications ? (
        <div className={CARD}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-red-50 text-red-700 shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-zinc-900">Notifications</h2>
            </div>
            <ViewAllButton
              onClick={onViewAllNotifications}
              disabled={notifLoading || Boolean(notifError) || notifCount === 0}
            />
          </div>
          {notifError ? (
            <p className="text-xs text-red-600">{notifError}</p>
          ) : notifLoading ? (
            <CardSkeleton rows={2} />
          ) : (
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-3xl font-semibold text-zinc-900 tabular-nums leading-none">
                {notifCount.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 mt-2">Failed notifications that need attention.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className={CARD}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-sky-50 text-sky-700 shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-900">Serviceability checker</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate("/serviceability")}
            className="shrink-0 self-start text-xs font-medium text-zinc-600 hover:text-zinc-900 whitespace-nowrap"
          >
            Open tool
          </button>
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-sm text-zinc-600 leading-relaxed">
            Public page to check Healthians, Orange Health, and Redcliffe coverage by address, pincode, or Redcliffe area search.
          </p>
          <button
            type="button"
            onClick={() => navigate("/serviceability")}
            className="mt-3 self-start text-xs font-medium text-zinc-900 underline hover:no-underline"
          >
            Go to serviceability page
          </button>
        </div>
      </div>
    </div>
  );
}
