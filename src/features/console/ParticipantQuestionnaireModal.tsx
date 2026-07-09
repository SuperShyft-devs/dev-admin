import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import {
  consoleApi,
  getApiError,
  type ConsoleAssessmentCategoryStatus,
  type ConsoleParticipantAssessment,
  type Participant,
} from "../../lib/api";
import {
  pickLatestMetsightsAssessment,
  sortCategories,
} from "./consoleQuestionnaireUtils";
import { QuestionnaireCategoryGrid } from "./QuestionnaireCategoryGrid";
import { QuestionnaireQuestionWizard } from "./QuestionnaireQuestionWizard";

type ParticipantQuestionnaireModalProps = {
  open: boolean;
  onClose: () => void;
  engagementId: number;
  participant: Participant;
  isEngagementRunning: boolean;
};

function participantName(p: Participant): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Participant";
}

export function ParticipantQuestionnaireModal({
  open,
  onClose,
  engagementId,
  participant,
  isEngagementRunning,
}: ParticipantQuestionnaireModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<ConsoleParticipantAssessment | null>(null);
  const [categories, setCategories] = useState<ConsoleAssessmentCategoryStatus[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<ConsoleAssessmentCategoryStatus | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const readOnly =
    !isEngagementRunning || String(assessment?.status ?? "").toLowerCase() === "completed";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSubmitSuccess(null);
    setSelectedCategory(null);
    try {
      const assessmentsRes = await consoleApi.listParticipantAssessments(
        engagementId,
        participant.user_id
      );
      const picked = pickLatestMetsightsAssessment(
        assessmentsRes.data.data ?? [],
        engagementId
      );
      if (!picked) {
        setAssessment(null);
        setCategories([]);
        return;
      }
      setAssessment(picked);
      const statusRes = await consoleApi.getParticipantAssessmentStatus(
        engagementId,
        participant.user_id,
        picked.assessment_instance_id,
        { category_of: "metsights" }
      );
      setCategories(sortCategories(statusRes.data.data ?? []));
    } catch (err) {
      setError(getApiError(err));
      setAssessment(null);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [engagementId, participant.user_id]);

  useEffect(() => {
    if (open) {
      void loadData();
    } else {
      setSelectedCategory(null);
      setSubmitSuccess(null);
      setError(null);
    }
  }, [open, loadData]);

  const handleCategorySubmitted = async () => {
    setSelectedCategory(null);
    setSubmitSuccess("Category submitted successfully.");
    await loadData();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Questionnaire for ${participantName(participant)}`}
      maxWidthClassName="max-w-5xl"
    >
      <div className="space-y-4">
        {assessment && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
            <ClipboardList className="w-4 h-4" />
            <span>
              {assessment.package_display_name || assessment.package_code || "Assessment"}
            </span>
            <span className="text-zinc-300">·</span>
            <span className="font-mono text-xs">#{assessment.assessment_instance_id}</span>
            {readOnly && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                Read-only
              </span>
            )}
          </div>
        )}

        {submitSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {submitSuccess}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-8 text-center">{error}</p>
        ) : !assessment ? (
          <div className="text-center py-16 space-y-2">
            <ClipboardList className="w-10 h-10 text-zinc-300 mx-auto" />
            <p className="text-sm text-zinc-600">
              No MetSights Basic or Pro assessment found for this participant in this engagement.
            </p>
          </div>
        ) : selectedCategory ? (
          <QuestionnaireQuestionWizard
            engagementId={engagementId}
            userId={participant.user_id}
            assessmentInstanceId={assessment.assessment_instance_id}
            category={selectedCategory}
            readOnly={readOnly}
            onBack={() => setSelectedCategory(null)}
            onSubmitted={() => void handleCategorySubmitted()}
          />
        ) : categories.length === 0 ? (
          <p className="text-sm text-zinc-500 py-12 text-center">
            No questionnaire categories available.
          </p>
        ) : (
          <QuestionnaireCategoryGrid
            categories={categories}
            readOnly={readOnly}
            onSelect={setSelectedCategory}
          />
        )}
      </div>
    </Modal>
  );
}
