import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  CalendarCheck,
  Users,
  ClipboardList,
  FlaskConical,
  UserRound,
  Menu,
  LogOut,
  X,
  LifeBuoy,
  ClipboardCheck,
  Activity,
  Inbox,
  Library,
  ChevronDown,
  CreditCard,
  // Settings,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePendingTaskCount } from "../hooks/usePendingTaskCount";

const primaryNavItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true as const },
  { to: "/users", icon: UserRound, label: "Users" },
  { to: "/organisations", icon: Building2, label: "Organisations" },
  { to: "/engagements", icon: CalendarCheck, label: "Engagements" },
  { to: "/support", icon: LifeBuoy, label: "Support" },
  // { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/employees", icon: Users, label: "Employees" },
];

const libraryNavItems = [
  { to: "/assessments/packages", icon: ClipboardList, label: "Assessments" },
  { to: "/diagnostics/packages", icon: FlaskConical, label: "Diagnostics" },
  { to: "/payments/bookings", icon: CreditCard, label: "Payments" },
  { to: "/checklists", icon: ClipboardCheck, label: "Checklist templates" },
  { to: "/library/health-metrics", icon: Activity, label: "Health Metrics" },
];

function isLibraryPath(pathname: string) {
  return (
    pathname.startsWith("/assessments") ||
    pathname.startsWith("/diagnostics") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/checklists") ||
    pathname.startsWith("/library")
  );
}

export function AdminLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout, userProfile, userId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingTaskCount = usePendingTaskCount(location.pathname);
  const [libraryOpen, setLibraryOpen] = useState(() => isLibraryPath(location.pathname));

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isLibraryPath(location.pathname)) setLibraryOpen(true);
  }, [location.pathname]);

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const toggleMobileMenu = () => setMobileMenuOpen((o) => !o);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
    }`;

  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeMobileMenu}
          aria-hidden
        />
      )}

      {/* Sidebar: drawer on mobile, fixed on desktop */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          flex flex-col bg-white border-r border-zinc-200 transition-transform duration-200 ease-out
          ${sidebarCollapsed ? "w-16" : "w-56"}
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-200 shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <img
                src="/super-shyft.png"
                alt="Super Shyft"
                className="h-7 w-7 rounded-sm object-contain"
              />
              <span className="font-semibold text-zinc-900 tracking-tight">
                Admin
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="hidden lg:block p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={closeMobileMenu}
              className="lg:hidden p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {primaryNavItems.slice(0, 4).map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? false}
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                `${navLinkClass({ isActive })} ${sidebarCollapsed ? "justify-center" : ""}`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </NavLink>
          ))}

          {sidebarCollapsed ? (
            libraryNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={closeMobileMenu}
                title={label}
                className={({ isActive }) =>
                  `${navLinkClass({ isActive })} justify-center`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
              </NavLink>
            ))
          ) : (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setLibraryOpen((o) => !o)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isLibraryPath(location.pathname)
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
                aria-expanded={libraryOpen}
              >
                <Library className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">Library</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-zinc-400 transition-transform ${
                    libraryOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>
              {libraryOpen && (
                <div className="mt-0.5 ml-2 pl-2 border-l border-zinc-200 space-y-0.5">
                  {libraryNavItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={closeMobileMenu}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-zinc-100 text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0 opacity-80" />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {primaryNavItems.slice(4).map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? false}
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                `${navLinkClass({ isActive })} ${sidebarCollapsed ? "justify-center" : ""}`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-zinc-200 shrink-0">
          <button
            onClick={toggleMobileMenu}
            className="lg:hidden p-2 -ml-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0" />
          <NavLink
            to="/my-tasks"
            className={({ isActive }) =>
              `relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                isActive
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`
            }
            title="My tasks"
            aria-label={
              pendingTaskCount != null && pendingTaskCount > 0
                ? `My tasks, ${pendingTaskCount} pending`
                : "My tasks"
            }
          >
            <Inbox className="w-5 h-5 shrink-0" />
            <span className="hidden sm:inline">Tasks</span>
            {pendingTaskCount != null && pendingTaskCount > 0 ? (
              <span className="min-w-[1.125rem] h-5 px-1 rounded-full bg-zinc-900 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums leading-none">
                {pendingTaskCount > 99 ? "99+" : pendingTaskCount}
              </span>
            ) : null}
          </NavLink>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <span className="text-sm text-zinc-600 truncate max-w-[120px] sm:max-w-none">
              {userProfile?.first_name || userProfile?.last_name
                ? `${userProfile?.first_name ?? ""} ${userProfile?.last_name ?? ""}`.trim()
                : userId ?? "—"}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 shrink-0"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
