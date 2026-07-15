import { useState, useEffect } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { LogOut, UserRound, LayoutDashboard, CalendarClock, Menu, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const portalNavItems = [
  { to: "/experts/portal", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/experts/portal/availability", icon: CalendarClock, label: "Availability", end: false },
];

interface ExpertPortalLayoutProps {
  children: React.ReactNode;
}

export function ExpertPortalLayout({ children }: ExpertPortalLayoutProps) {
  const { logout, userProfile, userId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const displayName =
    userProfile?.first_name || userProfile?.last_name
      ? `${userProfile?.first_name ?? ""} ${userProfile?.last_name ?? ""}`.trim()
      : userId != null
        ? String(userId)
        : "—";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-zinc-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link to="/experts/portal" className="flex items-center gap-2 min-w-0">
            <img
              src="/super-shyft.png"
              alt="Super Shyft"
              className="h-7 w-7 rounded-sm object-contain shrink-0"
            />
            <span className="text-sm font-semibold text-zinc-800 truncate hidden sm:inline">
              Expert Portal
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Link
            to="/experts/me"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 shrink-0 min-w-0"
            aria-label="Profile"
          >
            <UserRound className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[120px] sm:max-w-none">{displayName}</span>
          </Link>
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

      <div className="flex-1 flex min-h-0">
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden
          />
        )}

        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50
            flex flex-col bg-white border-r border-zinc-200 w-52 transition-transform duration-200 ease-out
            ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          <div className="h-14 flex items-center justify-end px-2 border-b border-zinc-200 shrink-0 lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {portalNavItems.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileMenuOpen(false)}
                className={navLinkClass}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
