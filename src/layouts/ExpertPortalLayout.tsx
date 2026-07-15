import { Link, useNavigate } from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface ExpertPortalLayoutProps {
  children: React.ReactNode;
}

export function ExpertPortalLayout({ children }: ExpertPortalLayoutProps) {
  const { logout, userProfile, userId } = useAuth();
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-zinc-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
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
      <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
    </div>
  );
}
