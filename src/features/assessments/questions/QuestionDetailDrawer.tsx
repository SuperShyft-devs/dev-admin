import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { questionnaireQuestionsApi, type QuestionnaireQuestion, getApiError } from "../../../lib/api";
import { HealthyHabitRulesPanel } from "./HealthyHabitRulesPanel";
import { MetsightsSyncSummary } from "./MetsightsSyncSummary";
import { StatusBadge } from "./questionUi";
import { VisibilityRulesDisplay } from "./VisibilityRulesDisplay";

export type QuestionDrawerTab = "overview" | "visibility" | "habits" | "sync";

interface QuestionDetailDrawerProps {
  open: boolean;
  questionId: number | null;
  initialTab?: QuestionDrawerTab;
  onClose: () => void;
  onEdit: (question: QuestionnaireQuestion) => void;
  onConfigureSync: (question: QuestionnaireQuestion) => void;
  onUpdated?: (question: QuestionnaireQuestion) => void;
}

export function QuestionDetailDrawer({
  open,
  questionId,
  initialTab = "overview",
  onClose,
  onEdit,
  onConfigureSync,
  onUpdated,
}: QuestionDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<QuestionDrawerTab>(initialTab);
  const [question, setQuestion] = useState<QuestionnaireQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const fetchQuestion = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await questionnaireQuestionsApi.get(id);
      setQuestion(res.data.data);
    } catch (err) {
      setError(getApiError(err));
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !questionId) {
      setQuestion(null);
      setError(null);
      return;
    }
    setActiveTab(initialTab);
    void fetchQuestion(questionId);
  }, [open, questionId, initialTab, fetchQuestion]);

  const handleToggleStatus = async () => {
    if (!question) return;
    const next = question.status === "active" ? "inactive" : "active";
    setTogglingStatus(true);
    try {
      await questionnaireQuestionsApi.updateStatus(question.question_id, next);
      const updated = { ...question, status: next };
      setQuestion(updated);
      onUpdated?.(updated);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setTogglingStatus(false);
    }
  };

  if (!open) return null;

  const tabs: { key: QuestionDrawerTab; label: string; hidden?: boolean }[] = [
    { key: "overview", label: "Overview" },
    { key: "visibility", label: "Visibility" },
    { key: "habits", label: "Healthy habits", hidden: question?.question_type === "text" },
    { key: "sync", label: "Metsights sync" },
  ];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white shadow-xl border-l border-zinc-200 flex flex-col">
        <div className="px-4 sm:px-6 py-4 border-b border-zinc-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-900 line-clamp-2">
              {question?.question_text ?? "Question details"}
            </h2>
            {question?.question_key && (
              <p className="text-sm font-mono text-zinc-500 mt-0.5">{question.question_key}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 border-b border-zinc-200">
          <div
            className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {tabs
              .filter((tab) => !tab.hidden)
              .map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                    activeTab === tab.key
                      ? "border-zinc-900 text-zinc-900"
                      : "border-transparent text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-50"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}
          {loading ? (
            <div className="text-sm text-zinc-500">Loading...</div>
          ) : !question ? (
            <div className="text-sm text-zinc-500">Question not found.</div>
          ) : activeTab === "overview" ? (
            <div className="space-y-4">
              <div className="bg-white border border-zinc-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-zinc-500">Type</p>
                  <p className="font-mono text-xs text-zinc-900 mt-1">{question.question_type ?? "—"}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={question.status} />
                  </div>
                </div>
                <div>
                  <p className="text-zinc-500">Required</p>
                  <p className="text-zinc-900 mt-1">{question.is_required ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Read only</p>
                  <p className="text-zinc-900 mt-1">{question.is_read_only ? "Yes" : "No"}</p>
                </div>
                {question.help_text && (
                  <div className="sm:col-span-2">
                    <p className="text-zinc-500">Help text</p>
                    <p className="text-zinc-700 mt-1">{question.help_text}</p>
                  </div>
                )}
              </div>

              {question.options && question.options.length > 0 && (
                <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-medium text-zinc-900">
                    {question.question_type === "scale" ? "Accepted units" : "Options"}
                  </p>
                  <ul className="space-y-2">
                    {question.options.map((option, index) => (
                      <li
                        key={`${option.option_value}-${index}`}
                        className="p-2 rounded-lg border border-zinc-200 bg-zinc-50 text-sm"
                      >
                        <p className="text-zinc-900">
                          <span className="font-mono text-xs">{option.option_value}</span>
                          {" — "}
                          {option.display_name}
                        </p>
                        {option.tooltip_text && (
                          <p className="text-xs text-zinc-500 mt-0.5">{option.tooltip_text}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : activeTab === "visibility" ? (
            <VisibilityRulesDisplay question={question} />
          ) : activeTab === "habits" ? (
            <HealthyHabitRulesPanel question={question} />
          ) : (
            <MetsightsSyncSummary question={question} onConfigure={() => onConfigureSync(question)} />
          )}
        </div>

        {question && (
          <div className="px-4 sm:px-6 py-4 border-t border-zinc-200 bg-white flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => onEdit(question)}
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              Edit question
            </button>
            <button
              type="button"
              onClick={() => void handleToggleStatus()}
              disabled={togglingStatus}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              {togglingStatus ? "Updating..." : question.status === "active" ? "Deactivate" : "Activate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
