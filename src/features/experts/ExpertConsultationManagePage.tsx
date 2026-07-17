import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import { Modal } from "../../shared/ui/Modal";
import {
  expertsPortalApi,
  getApiError,
  uploadsApi,
  type ConsultationManageDetail,
  type ConsultationQuestionnaireCategory,
  type ConsultationQuestionnairePayload,
} from "../../lib/api";

type PdfKind = "bio_ai" | "blood_report";

function formatName(detail: ConsultationManageDetail): string {
  const name = [detail.first_name, detail.last_name].filter(Boolean).join(" ").trim();
  return name || `User #${detail.user_id}`;
}

function formatType(typeKey: string): string {
  if (!typeKey) return "—";
  return typeKey.charAt(0).toUpperCase() + typeKey.slice(1).replace(/_/g, " ");
}

function attachmentLabel(url: string): string {
  try {
    const path = url.split("?")[0];
    const parts = path.split("/");
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}

function formatAnswer(answer: unknown): string {
  if (answer == null) return "—";
  if (typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean") {
    return String(answer);
  }
  try {
    return JSON.stringify(answer);
  } catch {
    return String(answer);
  }
}

export function ExpertConsultationManagePage() {
  const { consultationId: consultationIdParam } = useParams<{ consultationId: string }>();
  const consultationId = Number(consultationIdParam);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<ConsultationManageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [meetLink, setMeetLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [doing, setDoing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [activePdf, setActivePdf] = useState<PdfKind | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [questionnaireLoading, setQuestionnaireLoading] = useState(false);
  const [questionnaireError, setQuestionnaireError] = useState<string | null>(null);
  const [questionnaire, setQuestionnaire] = useState<ConsultationQuestionnairePayload | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ConsultationQuestionnaireCategory | null>(
    null
  );

  const load = useCallback(async () => {
    if (!Number.isFinite(consultationId) || consultationId <= 0) {
      setError("Invalid consultation id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await expertsPortalApi.getConsultation(consultationId);
      const data = res.data.data;
      setDetail(data);
      setSummary(data.consultation_summary ?? "");
      setAttachments(data.attachments ?? []);
      setMeetLink(data.meet_link ?? "");
    } catch (err) {
      setError(getApiError(err));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [consultationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const canMarkDone = Boolean(detail && !detail.done && detail.slot_reached);

  const shared = detail?.shared_resources;

  const loadPdf = async (kind: PdfKind) => {
    if (!detail) return;
    const state = shared?.[kind];
    if (!state?.consent) {
      setPdfError("Patient has not shared this report");
      return;
    }
    if (!state.available) {
      setPdfError("Report is not available yet");
      return;
    }

    setActivePdf(kind);
    setPdfLoading(true);
    setPdfError(null);
    try {
      const blob = await expertsPortalApi.fetchConsultationPdfBlob(consultationId, kind);
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      setPdfError(getApiError(err));
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setPdfLoading(false);
    }
  };

  const openQuestionnaire = async () => {
    if (!detail || !shared?.questionnaire.consent) return;
    setQuestionnaireOpen(true);
    setSelectedCategory(null);
    setQuestionnaireError(null);
    setQuestionnaireLoading(true);
    try {
      const res = await expertsPortalApi.getConsultationQuestionnaire(consultationId);
      setQuestionnaire(res.data.data);
    } catch (err) {
      setQuestionnaireError(getApiError(err));
      setQuestionnaire(null);
    } finally {
      setQuestionnaireLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await expertsPortalApi.updateConsultation(consultationId, {
        consultation_summary: summary,
        attachments,
        meet_link: meetLink.trim() || null,
      });
      const data = res.data.data;
      setDetail(data);
      setSummary(data.consultation_summary ?? "");
      setAttachments(data.attachments ?? []);
      setMeetLink(data.meet_link ?? "");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadsApi.uploadConsultationAttachments(Array.from(files));
      const urls = res.data.data.urls ?? [];
      setAttachments((prev) => [...prev, ...urls]);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDone = async () => {
    if (!canMarkDone) return;
    if (!window.confirm("Mark this consultation as done?")) return;
    setDoing(true);
    setError(null);
    try {
      await expertsPortalApi.markConsultationDoneById(consultationId);
      navigate("/experts/upcoming");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setDoing(false);
    }
  };

  const categories = useMemo(() => {
    if (!questionnaire) return [];
    const out: ConsultationQuestionnaireCategory[] = [];
    for (const assessment of questionnaire.assessments) {
      out.push(...assessment.categories);
    }
    return out;
  }, [questionnaire]);

  return (
    <ExpertPortalLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <Link
              to="/experts/upcoming"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Upcoming
            </Link>
            {detail ? (
              <>
                <h1 className="text-xl font-semibold text-zinc-900 truncate">{formatName(detail)}</h1>
                <p className="text-sm text-zinc-500 mt-1">
                  {formatType(detail.expert_type)}
                  {detail.date ? ` · ${detail.date}` : ""}
                  {detail.slot ? ` · ${detail.slot}` : ""}
                  {detail.engagement_code ? ` · ${detail.engagement_code}` : ""}
                </p>
              </>
            ) : (
              <h1 className="text-xl font-semibold text-zinc-900">Consultation</h1>
            )}
          </div>
          <button
            type="button"
            disabled={!canMarkDone || doing || loading}
            onClick={() => void handleDone()}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 shrink-0"
            title={
              detail && !detail.slot_reached
                ? "Available after the scheduled slot time"
                : detail?.done
                  ? "Already marked done"
                  : undefined
            }
          >
            {doing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Done"}
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : !detail ? (
          <div className="text-sm text-zinc-500 py-12 text-center">Consultation not found</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col min-h-[28rem]">
              <div className="px-4 py-3 border-b border-zinc-100">
                <h2 className="text-sm font-semibold text-zinc-900">Shared records</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Visible only when the patient has given consent.
                </p>
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-zinc-100">
                <SharedButton
                  label="BioAI"
                  state={shared?.bio_ai}
                  active={activePdf === "bio_ai"}
                  onClick={() => void loadPdf("bio_ai")}
                />
                <SharedButton
                  label="Blood report"
                  state={shared?.blood_report}
                  active={activePdf === "blood_report"}
                  onClick={() => void loadPdf("blood_report")}
                />
                <SharedButton
                  label="Questionnaire"
                  state={shared?.questionnaire}
                  active={questionnaireOpen}
                  onClick={() => void openQuestionnaire()}
                />
              </div>
              <div className="flex-1 bg-zinc-50 relative min-h-[20rem]">
                {pdfLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
                  </div>
                ) : pdfError ? (
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-500">
                    {pdfError}
                  </div>
                ) : pdfBlobUrl ? (
                  <iframe
                    title={activePdf === "bio_ai" ? "BioAI report" : "Blood report"}
                    src={pdfBlobUrl}
                    className="absolute inset-0 w-full h-full border-0"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-2 px-6 text-center">
                    <FileText className="w-10 h-10" />
                    <p className="text-sm">Select BioAI or Blood report to view here</p>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Consultation notes</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Save a summary and attachments for this session.
                </p>
              </div>

              <div>
                <label className="text-xs text-zinc-500 block mb-1">Summary</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={8}
                  placeholder="Add consultation summary..."
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-y min-h-[10rem]"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500 block mb-1">Attachments</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachments.map((url) => (
                    <span
                      key={url}
                      className="inline-flex items-center gap-1.5 max-w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700"
                    >
                      <Paperclip className="w-3 h-3 shrink-0" />
                      <span className="truncate">{attachmentLabel(url)}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((u) => u !== url))}
                        className="text-zinc-400 hover:text-zinc-700"
                        aria-label="Remove attachment"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer">
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="w-3.5 h-3.5" />
                  )}
                  Add files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.txt,application/pdf"
                    disabled={uploading}
                    onChange={(e) => {
                      void handleUpload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div>
                <label className="text-xs text-zinc-500 block mb-1">Google Meet link (optional)</label>
                <input
                  type="url"
                  value={meetLink}
                  onChange={(e) => setMeetLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      <Modal
        open={questionnaireOpen}
        onClose={() => {
          setQuestionnaireOpen(false);
          setSelectedCategory(null);
        }}
        title={selectedCategory ? selectedCategory.display_name || "Category" : "Questionnaire"}
        maxWidthClassName="max-w-2xl"
      >
        {questionnaireLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : questionnaireError ? (
          <p className="text-sm text-red-600">{questionnaireError}</p>
        ) : selectedCategory ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="text-xs text-zinc-500 hover:text-zinc-800"
            >
              ← All categories
            </button>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {selectedCategory.questions.length === 0 ? (
                <p className="text-sm text-zinc-500">No questions in this category</p>
              ) : (
                selectedCategory.questions.map((q) => (
                  <div key={q.question_id} className="border-b border-zinc-100 pb-3">
                    <div className="text-sm font-medium text-zinc-900">
                      {String(q.question_text || q.question_key || `Question #${q.question_id}`)}
                    </div>
                    <div className="text-sm text-zinc-600 mt-1 whitespace-pre-wrap">
                      {formatAnswer(q.answer)}
                    </div>
                    {q.answer_state && q.answer_state !== "empty" && (
                      <div className="text-[11px] text-zinc-400 mt-1 capitalize">{q.answer_state}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : categories.length === 0 ? (
          <p className="text-sm text-zinc-500">No questionnaire data available</p>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => (
              <button
                key={cat.category_id}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-zinc-200 hover:bg-zinc-50"
              >
                <div className="text-sm font-medium text-zinc-900">
                  {cat.display_name || cat.category_key || `Category #${cat.category_id}`}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {cat.questions.filter((q) => q.answer_state && q.answer_state !== "empty").length}/
                  {cat.questions.length} answered
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </ExpertPortalLayout>
  );
}

function SharedButton({
  label,
  state,
  active,
  onClick,
}: {
  label: string;
  state?: { consent: boolean; available: boolean };
  active?: boolean;
  onClick: () => void;
}) {
  const consented = Boolean(state?.consent);
  const available = Boolean(state?.available);
  const disabled = !consented;
  let title = "";
  if (!consented) title = "Patient has not shared this";
  else if (!available) title = "Not available yet";

  return (
    <button
      type="button"
      disabled={disabled}
      title={title || undefined}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        active
          ? "bg-zinc-900 text-white border-zinc-900"
          : disabled
            ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
            : "bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50"
      }`}
    >
      {label}
      {consented && !available ? " · N/A" : ""}
    </button>
  );
}
