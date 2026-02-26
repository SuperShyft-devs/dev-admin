import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  CalendarCheck,
  Menu,
  LogOut,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/organisations", icon: Building2, label: "Organisations" },
  { to: "/engagements", icon: CalendarCheck, label: "Engagements" },
];

export function AdminLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { logout, userId } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-zinc-50">
      <aside
        className={`${
          sidebarCollapsed ? "w-16" : "w-56"
        } flex flex-col bg-white border-r border-zinc-200 transition-all duration-200`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-200">
          {!sidebarCollapsed && (
            <span className="font-semibold text-zinc-900 tracking-tight">
              Admin
            </span>
          )}
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                } ${sidebarCollapsed ? "justify-center" : ""}`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-zinc-200">
          <div />
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600">
              User ID: {userId ?? "—"}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
