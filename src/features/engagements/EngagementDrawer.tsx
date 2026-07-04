import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type {
  AssessmentPackage,
  DiagnosticPackageListItem,
  Engagement,
} from "../../lib/api";
import { engagementsApi, getApiError, participantsApi, type ChecklistReadiness } from "../../lib/api";
import { EngagementNotificationModal } from "./EngagementNotificationModal";
import { EngagementOperationsPanel } from "./EngagementOperationsPanel";
import {
  EngagementDetailsTab,
  EngagementNotificationsTab,
  EngagementOverviewTab,
} from "./EngagementViewTabs";
import { formatEngagementStatusLabel } from "./engagementViewShared";
import { IntegrationSyncLogsModal } from "../assessments/IntegrationSyncLogsModal";

type DrawerTab = "overview" | "details" | "notifications" | "operations";

type Props = {
  open: boolean;
  engagementId: number | null;
  readiness?: ChecklistReadiness | null;
  onClose: () => void;
  getOrgName: (organizationId?: number | null) => string;
  assessmentPackages: AssessmentPackage[];
  diagnosticPackages: DiagnosticPackageListItem[];
  notificationServiceLabel: (serviceKey: string | null | undefined) => string;
  onEdit: (engagement: Engagement) => void;
  onViewParticipants: (engagement: Engagement) => void;
};

export function EngagementDrawer({
  open,
  engagementId,
  readiness,
  onClose,
  getOrgName,
  assessmentPackages,
  diagnosticPackages,
  notificationServiceLabel,
  onEdit,
  onViewParticipants,
}: Props) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [syncLogsOpen, setSyncLogsOpen] = useState(false);

  const refreshEngagement = useCallback(async () => {
    if (!engagementId) return;
    try {
      const [engRes, partRes] = await Promise.all([
        engagementsApi.get(engagementId),
        participantsApi.byEngagementId(engagementId, { page: 1, limit: 1 }),
      ]);
      const detail = engRes.data.data;
      setEngagement({
        ...detail,
        participant_count: Number(partRes.data.meta?.total ?? detail.participant_count ?? 0),
        readiness: readiness ?? undefined,
      } as Engagement & { readiness?: ChecklistReadiness | null });
    } catch (err) {
      setError(getApiError(err));
    }
  }, [engagementId, readiness]);

  useEffect(() => {
    if (!open || !engagementId) {
      setEngagement(null);
      setError(null);
      setActiveTab("overview");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      engagementsApi.get(engagementId),
      participantsApi.byEngagementId(engagementId, { page: 1, limit: 1 }),
    ])
      .then(([engRes, partRes]) => {
        if (cancelled) return;
        const detail = engRes.data.data;
        setEngagement({
          ...detail,
          participant_count: Number(partRes.data.meta?.total ?? detail.participant_count ?? 0),
          readiness: readiness ?? undefined,
        } as Engagement & { readiness?: ChecklistReadiness | null });
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
  }, [open, engagementId, readiness]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const tabs: { key: DrawerTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "details", label: "Details" },
    { key: "notifications", label: "Notifications" },
    { key: "operations", label: "Operations" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
        <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white shadow-xl border-l border-zinc-200 flex flex-col transition-transform duration-200">
          <div className="px-4 sm:px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
            <div className="min-w-0 pr-4">
              <h2 className="text-lg font-semibold text-zinc-900 truncate">
                {engagement?.engagement_name || engagement?.engagement_code || "Engagement details"}
              </h2>
              {engagement ? (
                <p className="text-sm text-zinc-500">
                  {formatEngagementStatusLabel(engagement.status)}
                  {engagement.engagement_code ? ` · ${engagement.engagement_code}` : ""}
                </p>
              ) : null}
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

          <div className="px-4 sm:px-6 border-b border-zinc-200 shrink-0">
            <div
              className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {tabs.map((tab) => (
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
            className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-50 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {error ? (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : engagement ? (
              <>
                {activeTab === "overview" ? (
                  <EngagementOverviewTab
                    engagement={engagement}
                    orgName={getOrgName(engagement.organization_id)}
                    assessmentPackages={assessmentPackages}
                    diagnosticPackages={diagnosticPackages}
                    notificationServiceLabel={notificationServiceLabel}
                    onEdit={() => onEdit(engagement)}
                    onViewParticipants={() => onViewParticipants(engagement)}
                    onNotify={() => setNotifyOpen(true)}
                    onSyncLogs={() => setSyncLogsOpen(true)}
                  />
                ) : null}
                {activeTab === "details" ? (
                  <EngagementDetailsTab
                    engagement={engagement}
                    orgName={getOrgName(engagement.organization_id)}
                    assessmentPackages={assessmentPackages}
                    diagnosticPackages={diagnosticPackages}
                    notificationServiceLabel={notificationServiceLabel}
                  />
                ) : null}
                {activeTab === "notifications" ? (
                  <EngagementNotificationsTab
                    engagement={engagement}
                    notificationServiceLabel={notificationServiceLabel}
                  />
                ) : null}
                {activeTab === "operations" ? (
                  <EngagementOperationsPanel
                    engagement={engagement}
                    active={activeTab === "operations"}
                    onEngagementUpdated={() => void refreshEngagement()}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {engagement ? (
        <>
          <EngagementNotificationModal
            open={notifyOpen}
            onClose={() => setNotifyOpen(false)}
            engagement={engagement}
          />
          <IntegrationSyncLogsModal
            open={syncLogsOpen}
            onClose={() => setSyncLogsOpen(false)}
            variant="healthians"
            initialEngagementId={engagement.engagement_id}
          />
        </>
      ) : null}
    </>
  );
}
