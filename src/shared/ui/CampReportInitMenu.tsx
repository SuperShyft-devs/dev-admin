import { useState, type MouseEvent } from "react";
import { FileText, Loader2 } from "lucide-react";
import axios from "axios";
import { campReportsApi, getApiError } from "../../lib/api";
import { Modal } from "./Modal";

interface CampReportInitMenuProps {
  campNo: number;
  variant?: "standalone" | "menu";
  /** When set, the modal is controlled by the parent (survives dropdown unmount). */
  open?: boolean;
  hideTrigger?: boolean;
  onClose?: () => void;
  onFeedback?: (message: string, isError?: boolean) => void;
  onInitialized?: () => void;
  zIndexClassName?: string;
}

function isAlreadyExistsError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const code = err.response?.data?.error_code;
  return err.response?.status === 409 || code === "CAMP_REPORT_EXISTS";
}

function formatInitAllMessage(data: {
  created: { overall: number; departments: number; cities: number; city_departments: number };
  cities: string[];
  departments: string[];
}): string {
  const createdCount =
    data.created.overall +
    data.created.departments +
    data.created.cities +
    data.created.city_departments;
  if (createdCount === 0) {
    return "All camp reports already exist";
  }
  if (data.cities.length === 0 && data.departments.length === 0) {
    return "Main camp report initialized. No cities or departments found for this camp.";
  }
  const parts = [
    `${data.created.overall} overall`,
    `${data.created.departments} department${data.created.departments === 1 ? "" : "s"}`,
    `${data.created.cities} ${data.created.cities === 1 ? "city" : "cities"}`,
    `${data.created.city_departments} city × department`,
  ];
  return `Initialized ${createdCount} report(s) (${parts.join(", ")}).`;
}

export function CampReportInitMenu({
  campNo,
  variant = "standalone",
  open,
  hideTrigger = false,
  onClose,
  onFeedback,
  onInitialized,
  zIndexClassName,
}: CampReportInitMenuProps) {
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const modalOpen = controlled ? open : internalOpen;

  const notify = (message: string, isError = false) => {
    onFeedback?.(message, isError);
  };

  const setModalOpen = (next: boolean) => {
    if (controlled) {
      if (!next) onClose?.();
      return;
    }
    setInternalOpen(next);
  };

  const closeAll = () => {
    setModalOpen(false);
    if (!controlled) onClose?.();
  };

  const runAction = async (action: () => Promise<string | void>) => {
    setLoading(true);
    try {
      const message = await action();
      notify(message || "Camp report initialized successfully");
      onInitialized?.();
      closeAll();
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        notify("Report already exists", true);
      } else {
        notify(getApiError(err), true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInitMain = () =>
    runAction(async () => {
      await campReportsApi.initCamp(campNo);
    });

  const handleInitAllCitiesAndDepartments = () =>
    runAction(async () => {
      const res = await campReportsApi.initAll(campNo);
      return formatInitAllMessage(res.data.data);
    });

  const openModal = (e?: MouseEvent) => {
    e?.stopPropagation();
    setModalOpen(true);
  };

  const openButton = hideTrigger ? null : variant === "menu" ? (
    <div className="border-t border-zinc-100">
      <button
        type="button"
        disabled={loading}
        onClick={openModal}
        className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        Init Camp Report
      </button>
    </div>
  ) : (
    <button
      type="button"
      disabled={loading}
      onClick={() => setModalOpen(true)}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
      Init Camp Report
    </button>
  );

  return (
    <>
      {openButton}
      <Modal
        open={modalOpen}
        onClose={() => {
          if (!loading) setModalOpen(false);
        }}
        title="Init Camp Report"
        maxWidthClassName="max-w-md"
        zIndexClassName={zIndexClassName}
      >
        <p className="text-sm text-zinc-600 mb-4">
          Choose how to initialize camp reports for camp {campNo}.
        </p>
        <div className="space-y-2">
          <button
            type="button"
            disabled={loading}
            onClick={handleInitMain}
            className="w-full rounded-lg border border-zinc-200 px-3 py-3 text-left text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            <div className="font-medium text-zinc-900">Init Main Camp</div>
            <div className="text-zinc-500 mt-0.5">Create only the overall camp report.</div>
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleInitAllCitiesAndDepartments}
            className="w-full rounded-lg border border-zinc-200 px-3 py-3 text-left text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            <div className="font-medium text-zinc-900">Init with all Cities and Departments</div>
            <div className="text-zinc-500 mt-0.5">
              Create the main report, all departments, all cities, and every city × department
              combination.
            </div>
          </button>
        </div>
        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Initializing…
          </div>
        )}
      </Modal>
    </>
  );
}
