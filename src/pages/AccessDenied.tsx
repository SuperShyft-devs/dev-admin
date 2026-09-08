import { LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";

export function AccessDenied({
  title = "Access denied",
  description = "You do not have permission to view this area. Ask a full administrator to update your access.",
  showHome = true,
}: {
  title?: string;
  description?: string;
  showHome?: boolean;
}) {
  return (
    <div className="min-h-[55vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center">
          <LockKeyhole className="w-5 h-5 text-zinc-500" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
        {showHome && (
          <Link
            to="/"
            className="mt-5 inline-flex px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
          >
            Return to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
