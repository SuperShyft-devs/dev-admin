import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CloudCog,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { AssignParticipantsFromCsv } from "../../shared/ui/AssignParticipantsFromCsv";
import {
  assessmentPackagesApi,
  assessmentsApi,
  engagementAssessmentPackagesApi,
  engagementQuestionnaireStatusApi,
  engagementsApi,
  getApiError,
  getApiErrorDetails,
  type AssessmentPackage,
  type Engagement,
  type EngagementAssessmentPackageSummary,
  type EngagementQuestionnaireStatusResponse,
} from "../../lib/api";
import {
  METSIGHTS_BLOOD_PACKAGE_CODES,
  pushCategoriesForTypeCode,
} from "./engagementOperationsUtils";

type Props = {
  engagement: Engagement;
  active: boolean;
  onEngagementUpdated?: () => void;
};

export function EngagementOperationsPanel({ engagement, active, onEngagementUpdated }: Props) {

  const [qStatusOpen, setQStatusOpen] = useState(false);
  const [qStatusData, setQStatusData] = useState<EngagementQuestionnaireStatusResponse | null>(null);
  const [qStatusLoading, setQStatusLoading] = useState(false);
  const [qStatusError, setQStatusError] = useState<string | null>(null);
  const [assessmentsModalOpen, setAssessmentsModalOpen] = useState(false);
  const [assessmentsList, setAssessmentsList] = useState<EngagementAssessmentPackageSummary[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null);
  const [assessmentDeleteConfirm, setAssessmentDeleteConfirm] = useState<EngagementAssessmentPackageSummary | null>(null);
  const [assessmentDeleting, setAssessmentDeleting] = useState(false);
  const [assessmentAssignOpen, setAssessmentAssignOpen] = useState(false);
  const [assessmentAssigning, setAssessmentAssigning] = useState(false);
  const [assessmentAssignResult, setAssessmentAssignResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [assessmentSyncingPackageId, setAssessmentSyncingPackageId] = useState<number | null>(null);
  const [assessmentSyncResult, setAssessmentSyncResult] = useState<{
    package_id: number;
    package_name: string;
    created: number;
    skipped: number;
    errors: number;
  } | null>(null);
  const [assessmentSyncError, setAssessmentSyncError] = useState<string | null>(null);
  const [assessmentConnectingPackageId, setAssessmentConnectingPackageId] = useState<number | null>(null);
  const [assessmentConnectResult, setAssessmentConnectResult] = useState<{
    package_id: number;
    package_name: string;
    connected: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [assessmentConnectError, setAssessmentConnectError] = useState<string | null>(null);
  const [engagementAssignPackageCode, setSelectedAssignPackageCode] = useState("");
  const [allActivePackages, setAllActivePackages] = useState<AssessmentPackage[]>([]);
  const [pushConfirmPkg, setPushConfirmPkg] = useState<EngagementAssessmentPackageSummary | null>(null);
  const [pushSelectedCategories, setPushSelectedCategories] = useState<string[]>([]);
  const [pushing, setPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ current: number; total: number } | null>(null);
  const [pushResult, setPushResult] = useState<{ pushed: number; skipped: number; errors: number } | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [advSettingsPackages, setAdvSettingsPackages] = useState<EngagementAssessmentPackageSummary[]>([]);
  const [advSettingsLoading, setAdvSettingsLoading] = useState(false);
  const [draftBloodOpen, setDraftBloodOpen] = useState(false);
  const [draftingBlood, setDraftingBlood] = useState(false);
  const [draftBloodProgress, setDraftBloodProgress] = useState<{ current: number; total: number } | null>(null);
  const [draftBloodResult, setDraftBloodResult] = useState<{
    drafted: number;
    skipped: number;
    errors: number;
    messages: string[];
  } | null>(null);
  const [draftBloodError, setDraftBloodError] = useState<string | null>(null);
  const [createProfilesOpen, setCreateProfilesOpen] = useState(false);
  const [creatingProfiles, setCreatingProfiles] = useState(false);
  const [createProfilesMode, setCreateProfilesMode] = useState<"enrol_force" | "enrol" | "profile">("profile");
  const [createProfilesResult, setCreateProfilesResult] = useState<{
    created: number;
    skipped: number;
    failed: number;
    total: number;
  } | null>(null);
  const [createProfilesError, setCreateProfilesError] = useState<string | null>(null);

  useEffect(() => {
    setQStatusOpen(false);
    setQStatusData(null);
    setQStatusError(null);
    setAdvSettingsPackages([]);
  }, [engagement.engagement_id]);

  const loadAssessmentsForEngagement = useCallback(async (engagementId: number) => {
    setAssessmentsLoading(true);
    setAssessmentsError(null);
    try {
      const res = await engagementAssessmentPackagesApi.list(engagementId);
      setAssessmentsList(res.data.data);
    } catch (err) {
      setAssessmentsError(getApiError(err));
    } finally {
      setAssessmentsLoading(false);
    }
  }, []);

  const openAssessmentsModal = useCallback(async (engagementId: number) => {
    setAssessmentsModalOpen(true);
    setAssessmentDeleteConfirm(null);
    setAssessmentAssignOpen(false);
    setAssessmentAssignResult(null);
    setAssessmentSyncResult(null);
    setAssessmentSyncError(null);
    setAssessmentSyncingPackageId(null);
    setSelectedAssignPackageCode("");
    await loadAssessmentsForEngagement(engagementId);
  }, [loadAssessmentsForEngagement]);

  const handleAssessmentDelete = useCallback(async () => {
    if (!assessmentDeleteConfirm || !engagement) return;
    setAssessmentDeleting(true);
    try {
      await engagementAssessmentPackagesApi.remove(engagement.engagement_id, assessmentDeleteConfirm.package_code);
      setAssessmentDeleteConfirm(null);
      await loadAssessmentsForEngagement(engagement.engagement_id);
    } catch (err) {
      setAssessmentsError(getApiError(err));
      setAssessmentDeleteConfirm(null);
    } finally {
      setAssessmentDeleting(false);
    }
  }, [assessmentDeleteConfirm, engagement, loadAssessmentsForEngagement]);

  const handleAssessmentAssign = useCallback(async () => {
    if (!engagementAssignPackageCode || !engagement) return;
    setAssessmentAssigning(true);
    setAssessmentAssignResult(null);
    try {
      const res = await engagementAssessmentPackagesApi.add(engagement.engagement_id, engagementAssignPackageCode);
      const d = res.data.data;
      setAssessmentAssignResult({
        created: d.created.length,
        skipped: d.skipped.length,
        errors: d.errors.length,
      });
      await loadAssessmentsForEngagement(engagement.engagement_id);
    } catch (err) {
      setAssessmentsError(getApiError(err));
    } finally {
      setAssessmentAssigning(false);
    }
  }, [engagementAssignPackageCode, engagement, loadAssessmentsForEngagement]);

  const handleAssessmentSyncPackage = useCallback(async (pkg: EngagementAssessmentPackageSummary) => {
    if (!engagement) return;
    setAssessmentSyncingPackageId(pkg.package_id);
    setAssessmentSyncResult(null);
    setAssessmentSyncError(null);
    try {
      const res = await engagementAssessmentPackagesApi.add(engagement.engagement_id, pkg.package_code);
      const d = res.data.data;
      setAssessmentSyncResult({
        package_id: pkg.package_id,
        package_name: pkg.display_name,
        created: d.created.length,
        skipped: d.skipped.length,
        errors: d.errors.length,
      });
      await loadAssessmentsForEngagement(engagement.engagement_id);
    } catch (err) {
      setAssessmentSyncError(getApiError(err));
    } finally {
      setAssessmentSyncingPackageId(null);
    }
  }, [engagement, loadAssessmentsForEngagement]);

  const handleAssessmentConnectMetsights = useCallback(async (pkg: EngagementAssessmentPackageSummary) => {
    if (!engagement) return;
    setAssessmentConnectingPackageId(pkg.package_id);
    setAssessmentConnectResult(null);
    setAssessmentConnectError(null);
    try {
      const res = await engagementAssessmentPackagesApi.connectMetsightsRecords(
        engagement.engagement_id,
        pkg.package_id
      );
      const d = res.data.data;
      setAssessmentConnectResult({
        package_id: pkg.package_id,
        package_name: pkg.display_name,
        connected: d.connected,
        skipped: d.skipped,
        failed: d.failed,
      });
      await loadAssessmentsForEngagement(engagement.engagement_id);
    } catch (err) {
      setAssessmentConnectError(getApiError(err));
    } finally {
      setAssessmentConnectingPackageId(null);
    }
  }, [engagement, loadAssessmentsForEngagement]);

  const handlePushQuestionnaires = useCallback(async () => {
    if (!engagement || !pushConfirmPkg || pushSelectedCategories.length === 0) return;
    setPushing(true);
    setPushResult(null);
    setPushError(null);
    setPushProgress(null);
    try {
      const listRes = await engagementAssessmentPackagesApi.listInstances(
        engagement.engagement_id,
        pushConfirmPkg.package_id
      );
      const instances = listRes.data.data ?? [];
      const total = instances.length;
      let pushed = 0;
      let skipped = 0;
      let errors = 0;
      const errorMessages: string[] = [];

      if (total === 0) {
        setPushResult({ pushed: 0, skipped: 0, errors: 0 });
        return;
      }

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        setPushProgress({ current: i + 1, total });
        try {
          const res = await engagementAssessmentPackagesApi.pushQuestionnaires(
            engagement.engagement_id,
            pushConfirmPkg.package_id,
            inst.assessment_instance_id,
            pushSelectedCategories
          );
          const d = res.data.data;
          pushed += d.pushed ?? 0;
          skipped += d.skipped ?? 0;
          errors += d.errors ?? 0;
        } catch (err) {
          const details = getApiErrorDetails(err);
          if (details.status === 422) {
            skipped += 1;
          } else {
            errors += 1;
            if (errorMessages.length < 5) {
              errorMessages.push(
                `#${inst.assessment_instance_id}: ${details.message}`
              );
            }
          }
        }
      }

      setPushResult({ pushed, skipped, errors });
      if (errors > 0 && pushed === 0 && skipped === 0) {
        setPushError(errorMessages.join(" · ") || "Push failed for all participants");
      }
    } catch (err) {
      setPushError(getApiError(err));
    } finally {
      setPushing(false);
      setPushProgress(null);
    }
  }, [engagement, pushConfirmPkg, pushSelectedCategories]);

  const openPushConfirm = useCallback((pkg: EngagementAssessmentPackageSummary) => {
    const options = pushCategoriesForTypeCode(pkg.assessment_type_code);
    setPushConfirmPkg(pkg);
    setPushSelectedCategories(options.map((c) => c.key));
    setPushResult(null);
    setPushError(null);
    setPushProgress(null);
  }, []);

  const closePushConfirm = useCallback(() => {
    if (pushing) return;
    setPushConfirmPkg(null);
    setPushSelectedCategories([]);
    setPushResult(null);
    setPushError(null);
    setPushProgress(null);
  }, [pushing]);

  const togglePushCategory = useCallback((key: string) => {
    setPushSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const handleDraftBloodParameters = useCallback(async () => {
    if (!engagement) return;
    setDraftingBlood(true);
    setDraftBloodResult(null);
    setDraftBloodError(null);
    setDraftBloodProgress(null);
    try {
      const listRes = await engagementAssessmentPackagesApi.listInstances(
        engagement.engagement_id
      );
      const instances = (listRes.data.data ?? []).filter((row) =>
        METSIGHTS_BLOOD_PACKAGE_CODES.has((row.package_code ?? "").trim())
      );
      const total = instances.length;
      let drafted = 0;
      let skipped = 0;
      let errors = 0;
      const messages: string[] = [];

      if (total === 0) {
        setDraftBloodResult({ drafted: 0, skipped: 0, errors: 0, messages: [] });
        return;
      }

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        setDraftBloodProgress({ current: i + 1, total });
        try {
          const res = await assessmentsApi.draftBloodParameters(
            inst.assessment_instance_id
          );
          const count = res.data.data.responses_drafted ?? 0;
          if (count > 0) {
            drafted += 1;
          } else {
            skipped += 1;
          }
        } catch (err) {
          const details = getApiErrorDetails(err);
          if (details.status === 422) {
            skipped += 1;
          } else {
            errors += 1;
            if (messages.length < 5) {
              messages.push(`#${inst.assessment_instance_id}: ${details.message}`);
            }
          }
        }
      }

      setDraftBloodResult({ drafted, skipped, errors, messages });
      if (errors > 0 && drafted === 0 && skipped === 0) {
        setDraftBloodError(messages.join(" · ") || "Draft failed for all assessments");
      }
    } catch (err) {
      setDraftBloodError(getApiError(err));
    } finally {
      setDraftingBlood(false);
      setDraftBloodProgress(null);
    }
  }, [engagement]);

  const loadAdvSettingsPackages = useCallback(async (engagementId: number) => {
    setAdvSettingsLoading(true);
    try {
      const res = await engagementAssessmentPackagesApi.list(engagementId);
      setAdvSettingsPackages(res.data.data);
    } catch {
      setAdvSettingsPackages([]);
    } finally {
      setAdvSettingsLoading(false);
    }
  }, []);

  const handleCreateMetsightsProfiles = useCallback(async () => {
    if (!engagement) return;
    setCreatingProfiles(true);
    setCreateProfilesResult(null);
    setCreateProfilesError(null);
    try {
      const res = await engagementsApi.createMetsightsProfiles(engagement.engagement_id, createProfilesMode);
      const d = res.data.data;
      setCreateProfilesResult({
        created: d.created,
        skipped: d.skipped,
        failed: d.failed,
        total: d.total,
      });
    } catch (err) {
      setCreateProfilesError(getApiError(err));
    } finally {
      setCreatingProfiles(false);
    }
  }, [engagement, createProfilesMode]);


  if (!active) {
    return (
      <div className="text-sm text-zinc-500">Select this tab to load operations tools.</div>
    );
  }

  return (
    <>
      <div className="space-y-4">
{/* ── Questionnaire Status Section ── */}
          <div className="pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={async () => {
                if (qStatusOpen) {
                  setQStatusOpen(false);
                  return;
                }
                setQStatusOpen(true);
                if (!qStatusData && !qStatusLoading) {
                  setQStatusLoading(true);
                  setQStatusError(null);
                  try {
                    const res = await engagementQuestionnaireStatusApi.get(engagement.engagement_id);
                    setQStatusData(res.data.data);
                  } catch (err) {
                    setQStatusError(getApiError(err));
                  } finally {
                    setQStatusLoading(false);
                  }
                }
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-900"
            >
              {qStatusOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <ClipboardList className="w-4 h-4" />
              Questionnaire Status
            </button>

            {qStatusOpen && (
              <div className="mt-3">
                {qStatusLoading && (
                  <div className="py-6 flex flex-col items-center gap-2 text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs">Loading…</span>
                  </div>
                )}

                {!qStatusLoading && qStatusError && (
                  <p className="text-sm text-red-600">{qStatusError}</p>
                )}

                {!qStatusLoading && !qStatusError && qStatusData && qStatusData.participants.length === 0 && (
                  <p className="text-xs text-zinc-400 italic">
                    No assessment instances found for this engagement.
                  </p>
                )}

                {!qStatusLoading && !qStatusError && qStatusData && qStatusData.participants.length > 0 && (
                  <div className="space-y-3">
                    {/* Summary: 3 stat cards */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-center">
                        <div className="text-lg font-semibold text-amber-700">{qStatusData.summary.drafted}</div>
                        <div className="text-[11px] text-amber-600">Drafted</div>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
                        <div className="text-lg font-semibold text-emerald-700">{qStatusData.summary.submitted}</div>
                        <div className="text-[11px] text-emerald-600">Submitted</div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-center">
                        <div className="text-lg font-semibold text-zinc-500">{qStatusData.summary.not_started}</div>
                        <div className="text-[11px] text-zinc-500">Not Started</div>
                      </div>
                    </div>

                    {/* Participants table */}
                    <div className="overflow-x-auto rounded-lg border border-zinc-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-50">
                            <th className="px-3 py-2 text-left font-medium text-zinc-600">Participant</th>
                            <th className="px-3 py-2 text-center font-medium text-zinc-600">State</th>
                            <th className="px-3 py-2 text-center font-medium text-zinc-600">Responses</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qStatusData.participants.map((row) => {
                            const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || "—";
                            return (
                              <tr
                                key={row.user_id}
                                className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                              >
                                <td className="px-3 py-2">
                                  <div className="font-medium text-zinc-800">{name}</div>
                                  <div className="text-zinc-400">{row.phone || row.email || ""}</div>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${row.questionnaire_state === "submitted"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : row.questionnaire_state === "drafted"
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-zinc-100 text-zinc-500"
                                      }`}
                                  >
                                    {row.questionnaire_state === "submitted"
                                      ? "Submitted"
                                      : row.questionnaire_state === "drafted"
                                        ? "Drafted"
                                        : "Not Started"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center text-zinc-600">
                                  {row.total_responses || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Advanced Settings Section ── */}
          <div className="pt-2 border-t border-zinc-100">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 mb-2">
              <Settings className="w-4 h-4" />
              Advanced Settings
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openAssessmentsModal(engagement.engagement_id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition-colors"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Manage Assessments
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateProfilesOpen(true);
                  setCreateProfilesMode("profile");
                  setCreateProfilesResult(null);
                  setCreateProfilesError(null);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create Profiles
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftBloodOpen(true);
                  setDraftBloodResult(null);
                  setDraftBloodError(null);
                  setDraftBloodProgress(null);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition-colors"
              >
                <CloudCog className="w-3.5 h-3.5" />
                Draft Blood Parameters
              </button>
            </div>

            {/* ── Per-package Push Buttons ── */}
            {advSettingsPackages.length === 0 && !advSettingsLoading && (
              <button
                type="button"
                onClick={() => loadAdvSettingsPackages(engagement.engagement_id)}
                className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-700"
              >
                Load push options…
              </button>
            )}
            {advSettingsLoading && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading assessments…
              </div>
            )}
            {advSettingsPackages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {advSettingsPackages.map((pkg) => (
                  <button
                    key={pkg.package_id}
                    type="button"
                    onClick={() => openPushConfirm(pkg)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Push {pkg.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        <AssignParticipantsFromCsv
          engagementId={engagement.engagement_id}
          engagementName={engagement.engagement_name ?? engagement.engagement_code}
          onComplete={() => onEngagementUpdated?.()}
        />
      </div>
      {/* ── Engagement Assessments Modal ── */}
      <Modal
        open={assessmentsModalOpen}
        onClose={() => setAssessmentsModalOpen(false)}
        title={`Assessments — ${engagement?.engagement_name ?? ""}`}
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={async () => {
              setAssessmentAssignOpen(true);
              setAssessmentAssignResult(null);
              setSelectedAssignPackageCode("");
              try {
                const res = await assessmentPackagesApi.list({ status: "active" });
                setAllActivePackages(res.data.data);
              } catch (err) {
                setAssessmentsError(getApiError(err));
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Assign Assessment Package
          </button>

          {assessmentsLoading && (
            <div className="py-8 flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Loading…</span>
            </div>
          )}

          {!assessmentsLoading && assessmentsError && (
            <p className="text-sm text-red-600">{assessmentsError}</p>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentSyncError && (
            <p className="text-sm text-red-600">{assessmentSyncError}</p>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentSyncResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-zinc-700">
                Sync result for <span className="font-semibold">{assessmentSyncResult.package_name}</span>
              </div>
              <div className="text-emerald-700">Created: {assessmentSyncResult.created}</div>
              <div className="text-zinc-500">Skipped: {assessmentSyncResult.skipped}</div>
              {assessmentSyncResult.errors > 0 && (
                <div className="text-red-600">Errors: {assessmentSyncResult.errors}</div>
              )}
            </div>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentConnectError && (
            <p className="text-sm text-red-600">{assessmentConnectError}</p>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentConnectResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-zinc-700">
                Connect result for <span className="font-semibold">{assessmentConnectResult.package_name}</span>
              </div>
              <div className="text-emerald-700">Connected: {assessmentConnectResult.connected}</div>
              <div className="text-zinc-500">Skipped: {assessmentConnectResult.skipped}</div>
              {assessmentConnectResult.failed > 0 && (
                <div className="text-red-600">Failed: {assessmentConnectResult.failed}</div>
              )}
            </div>
          )}

          {!assessmentsLoading && !assessmentsError && assessmentsList.length === 0 && (
            <p className="text-xs text-zinc-400 italic py-4">
              No assessment packages assigned to this engagement.
            </p>
          )}

          {!assessmentsLoading && assessmentsList.length > 0 && (
            <div className="space-y-2">
              {assessmentsList.map((pkg) => (
                <div
                  key={pkg.package_id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-900">{pkg.display_name}</span>
                      <span className="text-[11px] text-zinc-400 font-mono">{pkg.package_code}</span>
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${pkg.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500"
                          }`}
                      >
                        {pkg.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Assigned: {pkg.assigned_count}/{pkg.total_participants}
                      </span>
                      <span className="flex items-center gap-1">
                        <CloudCog className="w-3 h-3" />
                        Synced: {pkg.synced_count}/{pkg.assigned_count}
                      </span>
                    </div>
                    <div className="flex gap-1 h-1.5">
                      <div className="flex-1 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-zinc-400 transition-all"
                          style={{ width: pkg.total_participants > 0 ? `${(pkg.assigned_count / pkg.total_participants) * 100}%` : "0%" }}
                        />
                      </div>
                      <div className="flex-1 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all"
                          style={{ width: pkg.assigned_count > 0 ? `${(pkg.synced_count / pkg.assigned_count) * 100}%` : "0%" }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleAssessmentConnectMetsights(pkg)}
                      disabled={
                        assessmentConnectingPackageId !== null ||
                        assessmentSyncingPackageId !== null
                      }
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                      title="Connect Metsights records for assigned participants"
                    >
                      <Link2
                        className={`w-4 h-4 ${assessmentConnectingPackageId === pkg.package_id ? "animate-pulse" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAssessmentSyncPackage(pkg)}
                      disabled={
                        assessmentSyncingPackageId !== null ||
                        assessmentConnectingPackageId !== null
                      }
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50"
                      title="Assign package to missing participants"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${assessmentSyncingPackageId === pkg.package_id ? "animate-spin" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssessmentDeleteConfirm(pkg)}
                      disabled={assessmentConnectingPackageId !== null || assessmentSyncingPackageId !== null}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Remove from engagement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Assessment Delete Confirmation Modal ── */}
      <Modal
        open={assessmentDeleteConfirm !== null}
        onClose={() => setAssessmentDeleteConfirm(null)}
        title="Remove Assessment Package"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            Remove <span className="font-semibold">{assessmentDeleteConfirm?.display_name}</span> from
            all participants of this engagement?
          </p>
          <p className="text-xs text-zinc-500">
            This will delete local assessment data (instances, responses, reports).
            Metsights records will not be affected.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={handleAssessmentDelete}
              disabled={assessmentDeleting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {assessmentDeleting ? "Removing…" : "Remove"}
            </button>
            <button
              type="button"
              onClick={() => setAssessmentDeleteConfirm(null)}
              disabled={assessmentDeleting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Assessment Assign Modal ── */}
      <Modal
        open={assessmentAssignOpen}
        onClose={() => {
          setAssessmentAssignOpen(false);
          setAssessmentAssignResult(null);
          setSelectedAssignPackageCode("");
        }}
        title="Assign Assessment Package"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            Select a package to assign to all participants of{" "}
            <span className="font-semibold">{engagement?.engagement_name ?? "this engagement"}</span>.
          </p>
          <select
            value={engagementAssignPackageCode}
            onChange={(e) => {
              setSelectedAssignPackageCode(e.target.value);
              setAssessmentAssignResult(null);
            }}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">Select a package…</option>
            {allActivePackages
              .filter((p) => p.package_code)
              .map((p) => (
                <option key={p.package_id} value={p.package_code!}>
                  {p.display_name ?? p.package_code} ({p.package_code})
                </option>
              ))}
          </select>

          {assessmentAssignResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-emerald-700">Created: {assessmentAssignResult.created}</div>
              <div className="text-zinc-500">Skipped (already exists): {assessmentAssignResult.skipped}</div>
              {assessmentAssignResult.errors > 0 && (
                <div className="text-red-600">Errors: {assessmentAssignResult.errors}</div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={handleAssessmentAssign}
              disabled={!engagementAssignPackageCode || assessmentAssigning}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {assessmentAssigning ? "Assigning…" : "Assign to All Participants"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAssessmentAssignOpen(false);
                setAssessmentAssignResult(null);
                setSelectedAssignPackageCode("");
              }}
              disabled={assessmentAssigning}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Create Metsights Profiles Confirmation Modal ── */}
      <Modal
        open={createProfilesOpen}
        onClose={() => {
          if (!creatingProfiles) {
            setCreateProfilesOpen(false);
            setCreateProfilesResult(null);
            setCreateProfilesError(null);
          }
        }}
        title="Create Profiles"
      >
        <div className="space-y-4">
          {!createProfilesResult && !createProfilesError && !creatingProfiles && (
            <>
              <p className="text-sm text-zinc-700 mb-3">
                Select a mode to create Metsights profiles for participants of{" "}
                <span className="font-semibold">{engagement?.engagement_name ?? "this engagement"}</span>.
              </p>
              <div className="space-y-3">
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    createProfilesMode === "enrol_force"
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 hover:bg-zinc-50"
                  } ${!(engagement?.metsights_engagement_id ?? "").trim() ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="create_profiles_mode"
                    value="enrol_force"
                    checked={createProfilesMode === "enrol_force"}
                    onChange={() => setCreateProfilesMode("enrol_force")}
                    disabled={!(engagement?.metsights_engagement_id ?? "").trim()}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium text-zinc-800">Enrol for engagement (Force)</div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Register <span className="font-semibold">all</span> participants via engagement registration,
                      even if they already have a Metsights profile ID.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    createProfilesMode === "enrol"
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 hover:bg-zinc-50"
                  } ${!(engagement?.metsights_engagement_id ?? "").trim() ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="create_profiles_mode"
                    value="enrol"
                    checked={createProfilesMode === "enrol"}
                    onChange={() => setCreateProfilesMode("enrol")}
                    disabled={!(engagement?.metsights_engagement_id ?? "").trim()}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium text-zinc-800">Enrol for engagement</div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Register only participants who do not already have a Metsights profile ID
                      via engagement registration. Existing profiles are skipped.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    createProfilesMode === "profile"
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="create_profiles_mode"
                    value="profile"
                    checked={createProfilesMode === "profile"}
                    onChange={() => setCreateProfilesMode("profile")}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium text-zinc-800">User Profile</div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Create standalone Metsights profiles for participants who do not already
                      have a Metsights profile ID. Existing profiles are skipped.
                    </p>
                  </div>
                </label>
              </div>

              {!(engagement?.metsights_engagement_id ?? "").trim() && (
                <p className="text-xs text-amber-600 mt-2">
                  Engagement enrolment options are disabled because no Metsights Engagement ID is set.
                </p>
              )}
            </>
          )}

          {creatingProfiles && (
            <div className="py-6 flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Creating Metsights profiles…</span>
            </div>
          )}

          {createProfilesError && <p className="text-sm text-red-600">{createProfilesError}</p>}

          {createProfilesResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-emerald-700">Created: {createProfilesResult.created}</div>
              <div className="text-zinc-500">
                Skipped (already linked): {createProfilesResult.skipped}
              </div>
              {createProfilesResult.failed > 0 && (
                <div className="text-red-600">Failed: {createProfilesResult.failed}</div>
              )}
              <div className="text-zinc-400">Total participants: {createProfilesResult.total}</div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            {!createProfilesResult && !createProfilesError && (
              <button
                type="button"
                onClick={handleCreateMetsightsProfiles}
                disabled={creatingProfiles}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {creatingProfiles ? "Creating…" : "Create Profiles"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCreateProfilesOpen(false);
                setCreateProfilesResult(null);
                setCreateProfilesError(null);
              }}
              disabled={creatingProfiles}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {createProfilesResult || createProfilesError ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Push Questionnaires Confirmation Modal ── */}
      <Modal
        open={pushConfirmPkg !== null}
        onClose={closePushConfirm}
        title={`Push ${pushConfirmPkg?.display_name ?? "Answers"} to Metsights`}
      >
        <div className="space-y-4">
          {!pushResult && !pushError && !pushing && (
            <>
              <p className="text-sm text-zinc-700">
                Push <span className="font-semibold">{pushConfirmPkg?.display_name}</span> answers for{" "}
                <span className="font-semibold">all participants</span> of{" "}
                <span className="font-semibold">{engagement?.engagement_name ?? "this engagement"}</span> to Metsights.
              </p>
              <div>
                <p className="text-xs font-medium text-zinc-700 mb-2">Categories to push</p>
                <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  {pushCategoriesForTypeCode(pushConfirmPkg?.assessment_type_code).map((cat) => {
                    const checked = pushSelectedCategories.includes(cat.key);
                    return (
                      <label
                        key={cat.key}
                        className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePushCategory(cat.key)}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        {cat.label}
                      </label>
                    );
                  })}
                </div>
                {pushSelectedCategories.length === 0 && (
                  <p className="mt-1.5 text-xs text-red-600">Select at least one category.</p>
                )}
              </div>
              <ul className="text-xs text-zinc-500 space-y-1 list-disc pl-4">
                <li>Participants who haven't filled any questions will be skipped.</li>
                <li>Partially filled questionnaires will push whatever answers exist.</li>
                <li>Answers from all assessment packages will be merged per participant.</li>
                <li>Each participant is processed one at a time to avoid timeouts.</li>
              </ul>
            </>
          )}

          {pushing && (
            <div className="py-6 flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">
                Pushing {pushConfirmPkg?.display_name} to Metsights
                {pushProgress
                  ? `… ${pushProgress.current}/${pushProgress.total}`
                  : "…"}
              </span>
            </div>
          )}

          {pushError && (
            <p className="text-sm text-red-600">{pushError}</p>
          )}

          {pushResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-emerald-700">Pushed: {pushResult.pushed}</div>
              <div className="text-zinc-500">Skipped (no answers / no Metsights record): {pushResult.skipped}</div>
              {pushResult.errors > 0 && (
                <div className="text-red-600">Errors: {pushResult.errors}</div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            {!pushResult && !pushError && (
              <button
                type="button"
                onClick={handlePushQuestionnaires}
                disabled={pushing || pushSelectedCategories.length === 0}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {pushing ? "Pushing…" : "Push Answers"}
              </button>
            )}
            <button
              type="button"
              onClick={closePushConfirm}
              disabled={pushing}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {pushResult || pushError ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Draft Blood Parameters Confirmation Modal ── */}
      <Modal
        open={draftBloodOpen}
        onClose={() => {
          if (!draftingBlood) {
            setDraftBloodOpen(false);
            setDraftBloodResult(null);
            setDraftBloodError(null);
            setDraftBloodProgress(null);
          }
        }}
        title="Draft Blood Parameters"
      >
        <div className="space-y-4">
          {!draftBloodResult && !draftBloodError && !draftingBlood && (
            <>
              <p className="text-sm text-zinc-700">
                Draft Metsights blood-parameter answers from each participant&apos;s individual health
                report into questionnaire responses for{" "}
                <span className="font-semibold">{engagement?.engagement_name ?? "this engagement"}</span>.
              </p>
              <ul className="text-xs text-zinc-500 space-y-1 list-disc pl-4">
                <li>Only Metsights Basic and Pro assessments are included.</li>
                <li>Participants without a blood report or Metsights record are skipped.</li>
                <li>Existing answers for matched parameters are overwritten as drafts.</li>
                <li>Each assessment is processed one at a time to avoid timeouts.</li>
              </ul>
            </>
          )}

          {draftingBlood && (
            <div className="py-6 flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">
                Drafting blood parameters
                {draftBloodProgress
                  ? `… ${draftBloodProgress.current}/${draftBloodProgress.total}`
                  : "…"}
              </span>
            </div>
          )}

          {draftBloodError && (
            <p className="text-sm text-red-600">{draftBloodError}</p>
          )}

          {draftBloodResult && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
              <div className="text-emerald-700">Drafted: {draftBloodResult.drafted}</div>
              <div className="text-zinc-500">
                Skipped (no blood report / ineligible / no values): {draftBloodResult.skipped}
              </div>
              {draftBloodResult.errors > 0 && (
                <div className="text-red-600">Errors: {draftBloodResult.errors}</div>
              )}
              {draftBloodResult.messages.length > 0 && (
                <div className="text-red-600 pt-1 space-y-0.5">
                  {draftBloodResult.messages.map((msg) => (
                    <div key={msg}>{msg}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            {!draftBloodResult && !draftBloodError && (
              <button
                type="button"
                onClick={handleDraftBloodParameters}
                disabled={draftingBlood}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {draftingBlood ? "Drafting…" : "Draft Blood Parameters"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDraftBloodOpen(false);
                setDraftBloodResult(null);
                setDraftBloodError(null);
                setDraftBloodProgress(null);
              }}
              disabled={draftingBlood}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {draftBloodResult || draftBloodError ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </Modal>

    </>
  );
}
