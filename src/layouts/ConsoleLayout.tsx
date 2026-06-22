import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface ConsoleLayoutProps {
  engagementName?: string;
  children: React.ReactNode;
}

export function ConsoleLayout({ engagementName, children }: ConsoleLayoutProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-zinc-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/super-shyft.png"
            alt="Super Shyft"
            className="h-7 w-7 rounded-sm object-contain shrink-0"
          />
          {engagementName && (
            <>
              <div className="w-px h-5 bg-zinc-300" />
              <span className="text-sm font-semibold text-zinc-800 truncate">
                {engagementName}
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 shrink-0"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </header>
      <main className="flex-1 p-4 sm:p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
