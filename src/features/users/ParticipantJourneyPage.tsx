import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  participantJourneyApi,
  usersApi,
  getApiError,
  type ParticipantJourneyDetail,
  type ParticipantJourneyInstanceSummary,
  type UserDetail,
} from "../../lib/api";

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function AnswerStateBadge({ state }: { state: string }) {
  if (state === "submitted") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-100">
        Submitted
      </span>
    );
  }
  if (state === "draft") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-900 border border-amber-100">
        Draft
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
      Empty
    </span>
  );
}

export function ParticipantJourneyPage() {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const userId = userIdParam ? Number(userIdParam) : NaN;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [instances, setInstances] = useState<ParticipantJourneyInstanceSummary[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ParticipantJourneyDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<number, boolean>>({});

  const loadSummary = useCallback(async () => {
    if (!Number.isFinite(userId)) return;
    setLoading(true);
    setError(null);
    try {
      const [userRes, journeyRes] = await Promise.all([
        usersApi.get(userId),
        participantJourneyApi.summary(userId, { page: 1, limit: 100 }),
      ]);
      setUser(userRes.data.data);
      setInstances(journeyRes.data.data.instances ?? []);
      setMeta(journeyRes.data.meta);
    } catch (err) {
      setError(getApiError(err));
      setUser(null);
      setInstances([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const openDetail = async (instanceId: number) => {
    if (!Number.isFinite(userId)) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setOpenCategories({});
    try {
      const res = await participantJourneyApi.detail(userId, instanceId);
      setDetail(res.data.data);
    } catch (err) {
      setDetailError(getApiError(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleCategory = (id: number) => {
    setOpenCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const fullName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || "—"
    : "—";

  if (!Number.isFinite(userId)) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <p className="text-sm text-red-600">Invalid user id.</p>
        <Link to="/users" className="text-sm text-zinc-600 underline mt-2 inline-block">
          Back to users
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <div className="mb-4 sm:mb-6">
        <Link
          to="/users"
          className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 mb-3"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Back to users
        </Link>
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Participant journey</h1>
        <p className="text-sm text-zinc-500 mt-1 break-words">
          {fullName}
          {user?.phone ? (
            <span className="text-zinc-400"> · {user.phone}</span>
          ) : null}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-zinc-500">
            <span>
              {meta ? `${meta.total} assessment${meta.total === 1 ? "" : "s"}` : "No data"}
            </span>
          </div>

          {/* Mobile: cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {instances.length === 0 ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-6 text-center text-sm text-zinc-500">
                No assessments found for this user.
              </div>
            ) : (
              instances.map((row) => (
                <button
                  key={row.assessment_instance_id}
                  type="button"
                  onClick={() => void openDetail(row.assessment_instance_id)}
                  className="text-left bg-white rounded-xl border border-zinc-200 p-4 hover:border-zinc-300 hover:shadow-sm transition-shadow w-full"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 truncate">
                        {row.package_display_name || row.package_code || `Package #${row.package_id}`}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1 truncate">
                        {row.engagement_name || row.engagement_code || `Engagement #${row.engagement_id}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-zinc-600 capitalize">
                      {(row.status || "—").replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700">
                      Drafts: {row.questionnaire.draft_count}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800">
                      Submitted: {row.questionnaire.submitted_count}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* md+: table */}
          <div className="hidden md:block bg-white rounded-xl border border-zinc-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="px-4 py-3 font-medium">Package</th>
                  <th className="px-4 py-3 font-medium">Engagement</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Questionnaire</th>
                  <th className="px-4 py-3 font-medium w-28"> </th>
                </tr>
              </thead>
              <tbody>
                {instances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                      No assessments found for this user.
                    </td>
                  </tr>
                ) : (
                  instances.map((row) => (
                    <tr key={row.assessment_instance_id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-4 py-3 text-zinc-900">
                        <div className="font-medium">
                          {row.package_display_name || row.package_code || `Package #${row.package_id}`}
                        </div>
                        <div className="text-xs text-zinc-500">#{row.assessment_instance_id}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {row.engagement_name || row.engagement_code || `—`}
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-700">
                        {(row.status || "—").replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 text-xs">
                        {row.questionnaire.response_count} responses · {row.questionnaire.draft_count} draft ·{" "}
                        {row.questionnaire.submitted_count} submitted
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void openDetail(row.assessment_instance_id)}
                          className="text-zinc-900 font-medium text-xs hover:underline"
                        >
                          View detail
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
          setDetailError(null);
        }}
        title="Assessment detail"
        maxWidthClassName="max-w-2xl w-[calc(100vw-1.5rem)] sm:w-full"
      >
        <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1">
          {detailLoading && (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          )}
          {detailError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{detailError}</div>
          )}
          {detail && !detailLoading && (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Package</span>
                  <p className="font-medium text-zinc-900 mt-0.5">
                    {detail.package.package_display_name || detail.package.package_code || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Engagement</span>
                  <p className="font-medium text-zinc-900 mt-0.5">
                    {detail.engagement.engagement_name || detail.engagement.engagement_code || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Instance status</span>
                  <p className="text-zinc-800 mt-0.5 capitalize">{(detail.status || "—").replace(/_/g, " ")}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Progress</span>
                  <ul className="mt-1 space-y-1 text-zinc-700 text-xs">
                    {detail.category_progress.length === 0 ? (
                      <li>—</li>
                    ) : (
                      detail.category_progress.map((c) => (
                        <li key={c.category_id}>
                          {c.display_name || c.category_key || c.category_id}:{" "}
                          <span className="font-medium">{c.status}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Questionnaire
                </h3>
                <div className="space-y-2">
                  {detail.categories.map((cat) => {
                    const expanded = openCategories[cat.category_id] ?? true;
                    return (
                      <div
                        key={cat.category_id}
                        className="border border-zinc-200 rounded-lg overflow-hidden bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.category_id)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-50 text-left text-zinc-900 font-medium text-sm hover:bg-zinc-100"
                        >
                          {expanded ? (
                            <ChevronDown className="w-4 h-4 shrink-0 text-zinc-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 shrink-0 text-zinc-500" />
                          )}
                          <span className="truncate">
                            {cat.display_name || cat.category_key || `Category ${cat.category_id}`}
                          </span>
                          <span className="ml-auto text-xs font-normal text-zinc-500">
                            {cat.questions.length} questions
                          </span>
                        </button>
                        {expanded && (
                          <ul className="divide-y divide-zinc-100">
                            {cat.questions.map((q) => (
                              <li key={q.question_id} className="px-3 py-3 space-y-1.5">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                  <p className="text-zinc-900 font-medium text-sm break-words">
                                    {q.question_text || q.question_key || `Question ${q.question_id}`}
                                  </p>
                                  <AnswerStateBadge state={q.answer_state} />
                                </div>
                                {q.help_text ? (
                                  <p className="text-xs text-zinc-500 break-words">{q.help_text}</p>
                                ) : null}
                                <pre className="text-xs text-zinc-700 whitespace-pre-wrap break-words bg-zinc-50 rounded-md p-2 border border-zinc-100 max-h-40 overflow-y-auto">
                                  {formatAnswer(q.answer)}
                                </pre>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
