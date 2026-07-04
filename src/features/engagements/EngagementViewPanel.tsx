import { useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  MapPin,
  Pencil,
  Users,
} from "lucide-react";
import type {
  AssessmentPackage,
  DiagnosticPackageListItem,
  Engagement,
} from "../../lib/api";
import { ConsoleUrlActions } from "./consoleUrlActions";

function formatEngagementStatusLabel(status?: string | null): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "running") return "Running";
  if (normalized === "completed") return "Completed";
  return status ?? "—";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-xs font-medium text-zinc-500 mb-0.5">{label}</div>
      <div className="text-zinc-900">{children ?? "—"}</div>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50 hover:bg-zinc-100 text-left"
      >
        <span className="text-sm font-semibold text-zinc-800">{title}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        )}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

type Props = {
  engagement: Engagement;
  orgName: string;
  assessmentPackages: AssessmentPackage[];
  diagnosticPackages: DiagnosticPackageListItem[];
  notificationServiceLabel: (serviceKey: string | null | undefined) => string;
  onEdit: () => void;
  onViewParticipants: () => void;
  onNotify: () => void;
  participantsActions?: ReactNode;
  operations?: ReactNode;
};

export function EngagementViewPanel({
  engagement,
  orgName,
  assessmentPackages,
  diagnosticPackages,
  notificationServiceLabel,
  onEdit,
  onViewParticipants,
  onNotify,
  participantsActions,
  operations,
}: Props) {
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

  const formatServices = (value: string | null | undefined) =>
    value
      ? value
          .split(",")
          .map((k) => notificationServiceLabel(k.trim()))
          .join(", ")
      : "—";

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-zinc-200 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-zinc-900 truncate">
              {engagement.engagement_name || engagement.engagement_code || "Engagement"}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-medium">
                {engagement.engagement_code ?? "—"}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-medium">
                {engagement.engagement_type ?? "—"}
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
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-500 mb-1">Console</div>
          <ConsoleUrlActions engagementId={engagement.engagement_id} />
        </div>
        {participantsActions}
      </div>

      <Section title="Location">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
          <div className="space-y-1 min-w-0">
            <div className="font-medium text-zinc-900">
              {engagement.address || "No address set"}
            </div>
            <div className="text-zinc-600">
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
        {hasCoords && (
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
        )}
      </Section>

      <Section title="Schedule & packages">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Organisation">{orgName}</Field>
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
      </Section>

      <Section title="Notifications">
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
      </Section>

      <Section title="Operations" defaultOpen={false}>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
          <ClipboardList className="w-3.5 h-3.5" />
          Questionnaire status, assessments, profiles, and push tools
        </div>
        {operations}
      </Section>
    </div>
  );
}
