import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarCheck,
  Users,
  UserRound,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  TrendingUp,
  ClipboardList,
} from "lucide-react";
import {
  organizationsApi,
  engagementsApi,
  employeesApi,
  usersApi,
  type EngagementListItem,
  getApiError,
} from "../../lib/api";

interface StatCardProps {
  label: string;
  total: number | null;
  active: number | null;
  icon: React.ElementType;
  color: string;
  to: string;
  loading: boolean;
}

function StatCard({ label, total, active, icon: Icon, color, to, loading }: StatCardProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="group bg-white rounded-xl border border-zinc-200 p-4 sm:p-5 text-left hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer w-full"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 group-hover:translate-x-0.5 transition-all mt-0.5 shrink-0" />
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-16 bg-zinc-100 rounded animate-pulse" />
          <div className="h-4 w-20 bg-zinc-100 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <p className="text-2xl sm:text-3xl font-bold text-zinc-900 tabular-nums leading-none mb-1">
            {total ?? "—"}
          </p>
          <p className="text-xs sm:text-sm text-zinc-500 font-medium">{label}</p>
          {active !== null && total !== null && (
            <p className="mt-1.5 text-xs text-emerald-600 font-medium">
              {active} active
            </p>
          )}
        </>
      )}
    </button>
  );
}

interface Stats {
  totalOrgs: number;
  activeOrgs: number;
  totalEngagements: number;
  activeEngagements: number;
  totalEmployees: number;
  activeEmployees: number;
  totalUsers: number;
  activeUsers: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentEngagements, setRecentEngagements] = useState<EngagementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgsAll, orgsActive, engsAll, engsActive, empsAll, empsActive, usersAll, usersActive] =
        await Promise.all([
          organizationsApi.list({ limit: 1 }),
          organizationsApi.list({ limit: 1, status: "active" }),
          engagementsApi.list({ limit: 5 }),
          engagementsApi.list({ limit: 1, status: "active" }),
          employeesApi.list({ limit: 1 }),
          employeesApi.list({ limit: 1, status: "active" }),
          usersApi.list({ limit: 1 }),
          usersApi.list({ limit: 1, status: "active" }),
        ]);

      setStats({
        totalOrgs: orgsAll.data.meta.total,
        activeOrgs: orgsActive.data.meta.total,
        totalEngagements: engsAll.data.meta.total,
        activeEngagements: engsActive.data.meta.total,
        totalEmployees: empsAll.data.meta.total,
        activeEmployees: empsActive.data.meta.total,
        totalUsers: usersAll.data.meta.total,
        activeUsers: usersActive.data.meta.total,
      });

      // Top 5 most recent engagements from the first call
      setRecentEngagements(engsAll.data.data.slice(0, 5));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const statCards = [
    {
      label: "Organisations",
      total: stats?.totalOrgs ?? null,
      active: stats?.activeOrgs ?? null,
      icon: Building2,
      color: "bg-blue-50 text-blue-600",
      to: "/organisations",
    },
    {
      label: "Engagements",
      total: stats?.totalEngagements ?? null,
      active: stats?.activeEngagements ?? null,
      icon: CalendarCheck,
      color: "bg-violet-50 text-violet-600",
      to: "/engagements",
    },
    {
      label: "Employees",
      total: stats?.totalEmployees ?? null,
      active: stats?.activeEmployees ?? null,
      icon: Users,
      color: "bg-amber-50 text-amber-600",
      to: "/employees",
    },
    {
      label: "Users",
      total: stats?.totalUsers ?? null,
      active: stats?.activeUsers ?? null,
      icon: UserRound,
      color: "bg-emerald-50 text-emerald-600",
      to: "/users",
    },
  ];

  const quickLinks = [
    { label: "Users", icon: UserRound, to: "/users" },
    { label: "Organisations", icon: Building2, to: "/organisations" },
    { label: "Engagements", icon: CalendarCheck, to: "/engagements" },
    { label: "Assessments", icon: ClipboardList, to: "/assessments/packages" },
    { label: "Employees", icon: Users, to: "/employees" },
  ];

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Overview of your admin panel
          </p>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            aria-label="Refresh stats"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">Refresh</span>
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Failed to load stats</p>
            <p className="text-red-500 text-xs mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} loading={loading} />
        ))}
      </div>

      {/* Bottom section: Quick Links + Recent Engagements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Links */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-900">Quick Links</h2>
          </div>
          <div className="space-y-1">
            {quickLinks.map(({ label, icon: Icon, to }) => (
              <button
                key={to}
                type="button"
                onClick={() => navigate(to)}
                className="group w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0" />
                  <span className="text-sm text-zinc-700 font-medium">{label}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Recent Engagements */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-900">Recent Engagements</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/engagements")}
              className="text-xs text-zinc-500 hover:text-zinc-700 font-medium flex items-center gap-1 shrink-0"
            >
              View all
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 flex-1 bg-zinc-100 rounded animate-pulse" />
                  <div className="h-4 w-16 bg-zinc-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : recentEngagements.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarCheck className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">No engagements yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recentEngagements.map((eng) => {
                const isActive = (eng.status ?? "").toLowerCase() === "active";
                return (
                  <button
                    key={eng.engagement_id}
                    type="button"
                    onClick={() => navigate("/engagements")}
                    className="group w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">
                        {eng.engagement_name ?? `Engagement #${eng.engagement_id}`}
                      </p>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">
                        {eng.city ? `${eng.city} · ` : ""}
                        {eng.start_date
                          ? new Date(eng.start_date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                        {eng.end_date
                          ? ` – ${new Date(eng.end_date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {eng.participant_count != null && (
                        <span className="hidden sm:inline text-xs text-zinc-400">
                          {eng.participant_count} participants
                        </span>
                      )}
                      <span
                        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          isActive ? "bg-emerald-400" : "bg-zinc-300"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

