import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import axios from "axios";
import {
  campReportsApi,
  engagementsApi,
  organizationsApi,
  getApiError,
} from "../../lib/api";
import { Modal } from "./Modal";

interface CampReportInitMenuProps {
  campNo: number;
  organizationId: number;
  variant?: "standalone" | "menu";
  onClose?: () => void;
  onFeedback?: (message: string, isError?: boolean) => void;
  onInitialized?: () => void;
}

function isAlreadyExistsError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const code = err.response?.data?.error_code;
  return err.response?.status === 409 || code === "CAMP_REPORT_EXISTS";
}

async function fetchDepartmentSlugs(organizationId: number): Promise<string[]> {
  const res = await organizationsApi.get(organizationId);
  const departments = res.data.data.departments ?? [];
  return departments.map((d) => d.slug);
}

async function fetchCampCities(campNo: number): Promise<string[]> {
  const res = await engagementsApi.list({ camp_no: campNo, page: 1, limit: 200 });
  const cities = new Map<string, string>();
  for (const row of res.data.data) {
    const raw = (row.city ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!cities.has(key)) cities.set(key, raw);
  }
  return Array.from(cities.values());
}

function formatInitErrors(results: PromiseSettledResult<unknown>[]): string | null {
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length === 0) return null;
  const alreadyExists = failures.filter(
    (r) => r.status === "rejected" && isAlreadyExistsError(r.reason)
  ).length;
  const other = failures.length - alreadyExists;
  const parts: string[] = [];
  if (alreadyExists > 0) {
    parts.push(`${alreadyExists} report(s) already exist`);
  }
  if (other > 0) {
    const firstOther = failures.find(
      (r) => r.status === "rejected" && !isAlreadyExistsError(r.reason)
    );
    parts.push(
      other === 1 && firstOther?.status === "rejected"
        ? getApiError(firstOther.reason)
        : `${other} report(s) failed to initialize`
    );
  }
  return parts.join("; ");
}

export function CampReportInitMenu({
  campNo,
  organizationId,
  variant = "standalone",
  onClose,
  onFeedback,
  onInitialized,
}: CampReportInitMenuProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const notify = (message: string, isError = false) => {
    onFeedback?.(message, isError);
  };

  const closeAll = () => {
    setModalOpen(false);
    onClose?.();
  };

  const runAction = async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
      notify("Camp report initialized successfully");
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
      const [slugs, cities] = await Promise.all([
        fetchDepartmentSlugs(organizationId),
        fetchCampCities(campNo),
      ]);
      const tasks: Array<Promise<unknown>> = [campReportsApi.initCamp(campNo)];
      for (const slug of slugs) {
        tasks.push(campReportsApi.initDepartment(campNo, slug));
      }
      for (const city of cities) {
        tasks.push(campReportsApi.initCity(campNo, city));
        for (const slug of slugs) {
          tasks.push(campReportsApi.initCityDepartment(campNo, city, slug));
        }
      }
      const results = await Promise.allSettled(tasks);
      const errorMessage = formatInitErrors(results);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
    });

  const openButton =
    variant === "menu" ? (
      <div className="border-t border-zinc-100">
        <button
          type="button"
          disabled={loading}
          onClick={(e) => {
            e.stopPropagation();
            setModalOpen(true);
          }}
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
