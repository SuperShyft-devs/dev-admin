import {
  Bell,
  ExternalLink,
  MapPin,
  Pencil,
  ScrollText,
  Users,
} from "lucide-react";
import type {
  AssessmentPackage,
  ChecklistReadiness,
  DiagnosticPackageListItem,
  Engagement,
} from "../../lib/api";
import { ConsoleUrlActions } from "./consoleUrlActions";
import { Field, formatEngagementStatusLabel, isB2BEngagement } from "./engagementViewShared";

type SharedProps = {
  engagement: Engagement;
  orgName: string;
  assessmentPackages: AssessmentPackage[];
  diagnosticPackages: DiagnosticPackageListItem[];
  notificationServiceLabel: (serviceKey: string | null | undefined) => string;
};

type OverviewProps = SharedProps & {
  onEdit: () => void;
  onViewParticipants: () => void;
  onNotify: () => void;
  onSyncLogs?: () => void;
};

export function EngagementOverviewTab({
  engagement,
  orgName,
  onEdit,
  onViewParticipants,
  onNotify,
  onSyncLogs,
}: OverviewProps) {
  const b2b = isB2BEngagement(engagement.organization_id);
  const rd = (engagement as Engagement & { readiness?: ChecklistReadiness | null }).readiness;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-medium">
            {engagement.engagement_code ?? "—"}
          </span>
          <span className="inline-flex px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-medium">
            {engagement.engagement_type ?? "—"}
          </span>
          <span
            className={`inline-flex px-2 py-0.5 rounded-full font-medium ${
              b2b ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
            }`}
          >
            {b2b ? "B2B" : "B2C"}
          </span>
          <span
            className={`inline-flex px-2 py-0.5 rounded-full font-medium ${
              (engagement.status ?? "").toLowerCase() === "running"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {formatEngagementStatusLabel(engagement.status)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Audience">{b2b ? orgName : "Public user engagement"}</Field>
          <Field label="City">{engagement.city ?? "—"}</Field>
          <Field label="Start">{String(engagement.start_date ?? "—")}</Field>
          <Field label="End">{String(engagement.end_date ?? "—")}</Field>
          <Field label="Participants">{engagement.participant_count ?? 0}</Field>
          {b2b && engagement.camp_no != null ? (
            <Field label="Camp no">{String(engagement.camp_no)}</Field>
          ) : null}
        </div>

        {rd && rd.total > 0 ? (
          <div>
            <div className="text-xs font-medium text-zinc-500 mb-1">Readiness</div>
            <div className="text-sm font-medium text-zinc-900">
              {rd.done}/{rd.total} ({rd.percent}%)
            </div>
            <div className="mt-1 h-2 w-full bg-zinc-100 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded transition-all"
                style={{ width: `${rd.percent}%` }}
              />
            </div>
          </div>
        ) : null}

        <div>
          <div className="text-xs font-medium text-zinc-500 mb-1">Console</div>
          <ConsoleUrlActions engagementId={engagement.engagement_id} />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={onViewParticipants}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium"
          >
            <Users className="w-3.5 h-3.5" />
            Participants ({engagement.participant_count ?? 0})
          </button>
          <button
            type="button"
            onClick={onNotify}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium"
          >
            <Bell className="w-3.5 h-3.5" />
            Notification
          </button>
          {onSyncLogs ? (
            <button
              type="button"
              onClick={onSyncLogs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium"
            >
              <ScrollText className="w-3.5 h-3.5" />
              Sync Logs
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EngagementDetailsTab({
  engagement,
  orgName,
  assessmentPackages,
  diagnosticPackages,
}: SharedProps) {
  const b2b = isB2BEngagement(engagement.organization_id);

  const assessmentName =
    assessmentPackages.find((p) => p.package_id === engagement.assessment_package_id)
      ?.display_name ??
    assessmentPackages.find((p) => p.package_id === engagement.assessment_package_id)
      ?.package_code ??
    (engagement.assessment_package_id != null ? String(engagement.assessment_package_id) : "—");

  const diagnosticName =
    diagnosticPackages.find(
      (p) => p.diagnostic_package_id === engagement.diagnostic_package_id
    )?.package_name ??
    (engagement.diagnostic_package_id != null
      ? String(engagement.diagnostic_package_id)
      : "—");

  const hasCoords =
    engagement.latitude != null &&
    engagement.longitude != null &&
    !Number.isNaN(Number(engagement.latitude)) &&
    !Number.isNaN(Number(engagement.longitude));

  const mapsUrl = hasCoords
    ? `https://www.openstreetmap.org/?mlat=${engagement.latitude}&mlon=${engagement.longitude}#map=17/${engagement.latitude}/${engagement.longitude}`
    : null;

  const copyCoords = async () => {
    if (!hasCoords) return;
    try {
      await navigator.clipboard.writeText(`${engagement.latitude}, ${engagement.longitude}`);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-800">Location</h3>
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
          <div className="space-y-1 min-w-0">
            <div className="font-medium text-zinc-900">
              {engagement.address || "No address set"}
            </div>
            <div className="text-zinc-600 text-sm">
              {[
                engagement.landmark,
                engagement.sub_locality,
                engagement.city,
                engagement.state,
                engagement.pincode,
                engagement.country,
              ]
                .filter(Boolean)
                .join(", ") || "—"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <Field label="Landmark">{engagement.landmark ?? "—"}</Field>
          <Field label="Sub locality">{engagement.sub_locality ?? "—"}</Field>
          <Field label="City">{engagement.city ?? "—"}</Field>
          <Field label="Pincode">{engagement.pincode ?? "—"}</Field>
          <Field label="State">{engagement.state ?? "—"}</Field>
          <Field label="Country">{engagement.country ?? "—"}</Field>
          <Field label="Latitude">{engagement.latitude ?? "—"}</Field>
          <Field label="Longitude">{engagement.longitude ?? "—"}</Field>
        </div>
        {hasCoords ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={mapsUrl!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Maps
            </a>
            <button
              type="button"
              onClick={() => void copyCoords()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-medium"
            >
              Copy coordinates
            </button>
          </div>
        ) : null}
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-800">Schedule & packages</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {b2b ? <Field label="Organisation">{orgName}</Field> : null}
          <Field label="Metsights Engagement ID">
            {engagement.metsights_engagement_id ?? "—"}
          </Field>
          <Field label="Start">{String(engagement.start_date ?? "—")}</Field>
          <Field label="End">{String(engagement.end_date ?? "—")}</Field>
          <Field label="Slot duration">
            {engagement.slot_duration != null ? `${engagement.slot_duration} min` : "—"}
          </Field>
          <Field label="Assessment package">{assessmentName}</Field>
          <Field label="Diagnostic package">{diagnosticName}</Field>
          <Field label="Create profile on Metsights">
            {engagement.create_profile_on_metsights ? "Yes" : "No"}
          </Field>
          <Field label="Enroll for FitPrint Full">
            {engagement.enroll_for_fitprint_full ? "Yes" : "No"}
          </Field>
        </div>
      </div>
    </div>
  );
}

export function EngagementNotificationsTab({
  engagement,
  notificationServiceLabel,
}: Pick<SharedProps, "engagement" | "notificationServiceLabel">) {
  const formatServices = (value: string | null | undefined) =>
    value
      ? value
          .split(",")
          .map((k) => notificationServiceLabel(k.trim()))
          .join(", ")
      : "—";

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <div className="grid grid-cols-1 gap-3">
        <Field label="Onboarding notification service">
          {notificationServiceLabel(engagement.notification_service_key)}
        </Field>
        <Field label="Pretest Guidelines Notification">
          {formatServices(engagement.pretest_guidelines_notification)}
        </Field>
        <Field label="Questionnaire Reminder 1 (day before)">
          {formatServices(engagement.questionnaire_reminder_1)}
        </Field>
        <Field label="Questionnaire Reminder 2 (day after)">
          {formatServices(engagement.questionnaire_reminder_2)}
        </Field>
        <Field label="Blood Report Notification">
          {formatServices(engagement.blood_report_notification)}
        </Field>
        <Field label="BioAI Report Notification">
          {formatServices(engagement.bioai_report_notification)}
        </Field>
      </div>
    </div>
  );
}
