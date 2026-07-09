import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  consoleApi,
  getApiError,
  type ConsoleAssessmentCategoryStatus,
  type ConsoleQuestionnaireQuestion,
} from "../../lib/api";
import {
  getVisibleQuestions,
  isAnswerEmpty,
  normalizeAnswerForQuestion,
} from "./consoleQuestionnaireUtils";
import { QuestionInput } from "./QuestionInput";

type QuestionnaireQuestionWizardProps = {
  engagementId: number;
  userId: number;
  assessmentInstanceId: number;
  category: ConsoleAssessmentCategoryStatus;
  readOnly?: boolean;
  onBack: () => void;
  onSubmitted: () => void;
};

export function QuestionnaireQuestionWizard({
  engagementId,
  userId,
  assessmentInstanceId,
  category,
  readOnly,
  onBack,
  onSubmitted,
}: QuestionnaireQuestionWizardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ConsoleQuestionnaireQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStepIndex(0);
  void consoleApi
      .getParticipantQuestionnaire(
        engagementId,
        userId,
        assessmentInstanceId,
        category.category_id
      )
      .then((res) => {
        if (cancelled) return;
        const payload = res.data.data;
        const visible = getVisibleQuestions(payload.questions ?? []);
        setQuestions(visible);
        const initial: Record<number, unknown> = {};
        visible.forEach((q) => {
          if (q.answer !== undefined && q.answer !== null) {
            initial[q.question_id] = q.answer;
          }
        });
        setAnswers(initial);
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
  }, [engagementId, userId, assessmentInstanceId, category.category_id]);

  const currentQuestion = questions[stepIndex] ?? null;
  const isLast = stepIndex >= questions.length - 1;
  const progressPct =
    questions.length > 0 ? Math.round(((stepIndex + 1) / questions.length) * 100) : 0;

  const currentAnswer = useMemo(() => {
    if (!currentQuestion) return undefined;
    return answers[currentQuestion.question_id];
  }, [answers, currentQuestion]);

  const setCurrentAnswer = (value: unknown) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.question_id]: value }));
    setValidationError(null);
  };

  const validateCurrent = (): boolean => {
    if (!currentQuestion) return true;
    if (!currentQuestion.is_required) return true;
    const normalized = normalizeAnswerForQuestion(currentQuestion, currentAnswer);
    if (isAnswerEmpty(normalized)) {
      setValidationError("This question is required.");
      return false;
    }
    return true;
  };

  const saveCurrentAnswer = async () => {
    if (!currentQuestion || readOnly) return;
    const normalized = normalizeAnswerForQuestion(currentQuestion, currentAnswer);
    if (isAnswerEmpty(normalized)) return;
    await consoleApi.upsertParticipantQuestionnaireResponses(
      engagementId,
      userId,
      assessmentInstanceId,
      category.category_id,
      {
        responses: [{ question_id: currentQuestion.question_id, answer: normalized }],
      }
    );
  };

  const handleNext = async () => {
    if (!validateCurrent()) return;
    setSaving(true);
    setError(null);
    try {
      await saveCurrentAnswer();
      if (isLast) {
        await consoleApi.submitParticipantAssessment(
          engagementId,
          userId,
          assessmentInstanceId,
          {
            category: String(category.category_key ?? "").trim(),
            category_of: String(category.category_of ?? "metsights").trim() || "metsights",
          }
        );
        onSubmitted();
      } else {
        setStepIndex((prev) => prev + 1);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
      setValidationError(null);
    } else {
      onBack();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error && questions.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to categories
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="space-y-4 text-center py-10">
        <p className="text-sm text-zinc-500">No visible questions in this category.</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to categories
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="w-4 h-4" />
          {stepIndex > 0 ? "Previous" : "Categories"}
        </button>
        <span className="text-xs text-zinc-500">
          Question {stepIndex + 1} of {questions.length}
        </span>
      </div>

      <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className="h-full bg-zinc-900 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {category.display_name}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-zinc-900">
            {currentQuestion?.question_text}
          </h3>
          {currentQuestion?.help_text && (
            <p className="mt-2 text-sm text-zinc-500 bg-zinc-50 rounded-lg px-3 py-2">
              {currentQuestion.help_text}
            </p>
          )}
        </div>

        {currentQuestion && (
          <QuestionInput
            question={currentQuestion}
            value={currentAnswer}
            onChange={setCurrentAnswer}
            disabled={readOnly || saving}
          />
        )}

        {validationError && (
          <p className="text-sm text-red-600">{validationError}</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleNext()}
          disabled={readOnly || saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLast ? "Submit category" : "Next"}
        </button>
      </div>
    </div>
  );
}
