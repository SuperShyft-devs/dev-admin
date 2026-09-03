import {
  engagementAssessmentPackagesApi,
  getApiErrorDetails,
  type EngagementAssessmentInstanceRow,
} from "../../lib/api";

export type PushQuestionnairesBatchResult = {
  pushed: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
};

export type PushQuestionnairesBatchProgress = {
  current: number;
  total: number;
};

export async function runPushQuestionnairesBatch({
  engagementId,
  packageId,
  categories,
  instances,
  onProgress,
}: {
  engagementId: number;
  packageId: number;
  categories: string[];
  instances: EngagementAssessmentInstanceRow[];
  onProgress?: (progress: PushQuestionnairesBatchProgress) => void;
}): Promise<PushQuestionnairesBatchResult> {
  const total = instances.length;
  let pushed = 0;
  let skipped = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  if (total === 0) {
    return { pushed, skipped, errors, errorMessages };
  }

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    onProgress?.({ current: i + 1, total });
    try {
      const res = await engagementAssessmentPackagesApi.pushQuestionnaires(
        engagementId,
        packageId,
        inst.assessment_instance_id,
        categories
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
          errorMessages.push(`#${inst.assessment_instance_id}: ${details.message}`);
        }
      }
    }
  }

  return { pushed, skipped, errors, errorMessages };
}

export async function fetchInstancesForPush({
  engagementId,
  packageId,
  userIds,
}: {
  engagementId: number;
  packageId: number;
  userIds?: Set<number>;
}): Promise<EngagementAssessmentInstanceRow[]> {
  const listRes = await engagementAssessmentPackagesApi.listInstances(
    engagementId,
    packageId
  );
  const instances = listRes.data.data ?? [];
  if (userIds == null) {
    return instances;
  }
  return instances.filter((inst) => userIds.has(inst.user_id));
}
