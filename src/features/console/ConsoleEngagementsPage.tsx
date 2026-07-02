import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2, Users, Calendar } from "lucide-react";
import { ConsoleLayout } from "../../layouts/ConsoleLayout";
import { useAuth } from "../../contexts/AuthContext";
import {
  consoleApi,
  getApiError,
  type ConsoleEngagementListItem,
} from "../../lib/api";

function engagementLabel(eng: ConsoleEngagementListItem): string {
  return eng.engagement_name || eng.engagement_code || `Engagement ${eng.engagement_id}`;
}

export function ConsoleEngagementsPage() {
  const { employeeRole } = useAuth();
  const isAdmin = employeeRole === "admin";

  const [engagements, setEngagements] = useState<ConsoleEngagementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    consoleApi
      .listEngagements()
      .then((res) => {
        if (!cancelled) setEngagements(res.data.data);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ConsoleLayout
      backHref={isAdmin ? "/engagements" : undefined}
      backLabel={isAdmin ? "Back to Engagements" : undefined}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            {isAdmin ? "Engagement Console" : "Your Engagements"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isAdmin
              ? "All running engagements."
              : "Running engagements assigned to you as an onboarding assistant."}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        ) : engagements.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-500">
            {isAdmin
              ? "No running engagements."
              : "No running engagements assigned to you."}
          </div>
        ) : (
          <ul className="space-y-3">
            {engagements.map((eng) => (
              <li key={eng.engagement_id}>
                <Link
                  to={`/engagements/${eng.engagement_id}/console`}
                  className="block p-4 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 truncate">
                        {engagementLabel(eng)}
                      </p>
                      {eng.engagement_code && (
                        <p className="text-xs text-zinc-500 mt-0.5">{eng.engagement_code}</p>
                      )}
                      {(eng.start_date || eng.end_date) && (
                        <p className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {eng.start_date ?? "—"} — {eng.end_date ?? "—"}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 shrink-0">
                      <Users className="w-3.5 h-3.5" />
                      <span>{eng.participant_count ?? 0}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ConsoleLayout>
  );
}
