import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Download, Loader2, Save } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  assessmentsApi,
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
  const [metsightsProfileInput, setMetsightsProfileInput] = useState("");
  const [metsightsProfileSaving, setMetsightsProfileSaving] = useState(false);
  const [metsightsProfileError, setMetsightsProfileError] = useState<string | null>(null);
  const [metsightsProfileSuccess, setMetsightsProfileSuccess] = useState<string | null>(null);
  const [importingInstanceId, setImportingInstanceId] = useState<number | null>(null);
  const [importFeedback, setImportFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const loadSummary = useCallback(async () => {
    if (!Number.isFinite(userId)) return;
    setLoading(true);
    setError(null);
    try {
      const [userRes, journeyRes] = await Promise.all([
        usersApi.get(userId),
        participantJourneyApi.summary(userId, { page: 1, limit: 100 }),
      ]);
      const userData = userRes.data.data;
      setUser(userData);
      setMetsightsProfileInput(userData.metsights_profile_id ?? "");
      setMetsightsProfileError(null);
      setMetsightsProfileSuccess(null);
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

  const refreshDetailIfOpen = async (instanceId: number) => {
    if (!detailOpen || detail?.assessment_instance_id !== instanceId || !Number.isFinite(userId)) return;
    try {
      const res = await participantJourneyApi.detail(userId, instanceId);
      setDetail(res.data.data);
    } catch {
      // Keep existing detail if refresh fails after import.
    }
  };

  const handleImportAnswers = async (instanceId: number) => {
    setImportingInstanceId(instanceId);
    setImportFeedback(null);
    try {
      const res = await assessmentsApi.importMetsightsAnswers(instanceId);
      const result = res.data.data;
      const skipped = result.skipped_questions.length;
      setImportFeedback({
        type: "success",
        message: `Imported ${result.responses_upserted} answer${result.responses_upserted === 1 ? "" : "s"} from Metsights${
          skipped > 0 ? ` (${skipped} field${skipped === 1 ? "" : "s"} skipped)` : ""
        }.`,
      });
      await loadSummary();
      await refreshDetailIfOpen(instanceId);
    } catch (err) {
      setImportFeedback({ type: "error", message: getApiError(err) });
    } finally {
      setImportingInstanceId(null);
    }
  };

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

  const saveMetsightsProfileId = async (value: string) => {
    if (!Number.isFinite(userId)) return;
    setMetsightsProfileSaving(true);
    setMetsightsProfileError(null);
    setMetsightsProfileSuccess(null);
    try {
      const res = await usersApi.updateMetsightsProfileId(userId, value);
      const saved = res.data.data.metsights_profile_id ?? "";
      setMetsightsProfileInput(saved);
      setUser((prev) =>
        prev ? { ...prev, metsights_profile_id: res.data.data.metsights_profile_id } : prev
      );
      setMetsightsProfileSuccess(
        saved ? "Metsights profile ID saved." : "Metsights profile ID cleared."
      );
    } catch (err) {
      setMetsightsProfileError(getApiError(err));
    } finally {
      setMetsightsProfileSaving(false);
    }
  };

  const handleSaveMetsightsProfileId = () => saveMetsightsProfileId(metsightsProfileInput.trim());

  const handleClearMetsightsProfileId = () => saveMetsightsProfileId("");

  const metsightsProfileDirty =
    (metsightsProfileInput.trim() || "") !== ((user?.metsights_profile_id ?? "").trim() || "");

  const renderImportButton = (row: ParticipantJourneyInstanceSummary, className = "") => {
    const hasRecord = Boolean((row.metsights_record_id ?? "").trim());
    const isImporting = importingInstanceId === row.assessment_instance_id;
    const isBusy = importingInstanceId !== null;

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void handleImportAnswers(row.assessment_instance_id);
        }}
        disabled={!hasRecord || isBusy}
        className={`p-1.5 rounded-lg text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-zinc-400 ${className}`}
        title={
          hasRecord
            ? "Import questionnaire answers from Metsights"
            : "No Metsights record linked to this assessment"
        }
      >
        {isImporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>
    );
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

      {!loading && user && (
        <div className="mb-4 sm:mb-6 bg-white rounded-xl border border-zinc-200 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="metsights-profile-id"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                Metsights profile ID
              </label>
              <input
                id="metsights-profile-id"
                type="text"
                value={metsightsProfileInput}
                onChange={(e) => {
                  setMetsightsProfileInput(e.target.value);
                  setMetsightsProfileSuccess(null);
                  setMetsightsProfileError(null);
                }}
                placeholder="Paste Metsights profile UUID"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Links this user to Metsights for records, Bio AI reports, and imports. Leave empty and
                save to clear.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleSaveMetsightsProfileId()}
                disabled={metsightsProfileSaving || !metsightsProfileDirty}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 min-w-[5.5rem]"
              >
                {metsightsProfileSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {metsightsProfileSaving ? "Saving…" : "Save"}
              </button>
              {(user.metsights_profile_id ?? "").trim() ? (
                <button
                  type="button"
                  onClick={() => void handleClearMetsightsProfileId()}
                  disabled={metsightsProfileSaving}
                  className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          {metsightsProfileError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{metsightsProfileError}</div>
          )}
          {metsightsProfileSuccess && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">
              {metsightsProfileSuccess}
            </div>
          )}
        </div>
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

          {importFeedback && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                importFeedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {importFeedback.message}
            </div>
          )}

          {/* Mobile: cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {instances.length === 0 ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-6 text-center text-sm text-zinc-500">
                No assessments found for this user.
              </div>
            ) : (
              instances.map((row) => (
                <div
                  key={row.assessment_instance_id}
                  className="bg-white rounded-xl border border-zinc-200 p-4 hover:border-zinc-300 hover:shadow-sm transition-shadow w-full"
                >
                  <button
                    type="button"
                    onClick={() => void openDetail(row.assessment_instance_id)}
                    className="text-left w-full"
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
                  <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-end">
                    {renderImportButton(row)}
                  </div>
                </div>
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
                  <th className="px-4 py-3 font-medium w-36"> </th>
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
                        <div className="flex items-center justify-end gap-1">
                          {renderImportButton(row)}
                          <button
                            type="button"
                            onClick={() => void openDetail(row.assessment_instance_id)}
                            className="text-zinc-900 font-medium text-xs hover:underline px-1.5 py-1"
                          >
                            View detail
                          </button>
                        </div>
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
