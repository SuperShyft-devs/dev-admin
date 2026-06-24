import { useState } from "react";
import { ChevronRight, FileText, Loader2 } from "lucide-react";
import axios from "axios";
import {
  campReportsApi,
  organizationsApi,
  getApiError,
} from "../../lib/api";

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
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const notify = (message: string, isError = false) => {
    onFeedback?.(message, isError);
  };

  const runAction = async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
      notify("Camp report initialized successfully");
      onInitialized?.();
      onClose?.();
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        notify("Report already exists", true);
      } else {
        notify(getApiError(err), true);
      }
    } finally {
      setLoading(false);
      setSubmenuOpen(false);
    }
  };

  const handleInit = () =>
    runAction(async () => {
      await campReportsApi.initCamp(campNo);
    });

  const handleInitAllDepartments = () =>
    runAction(async () => {
      const slugs = await fetchDepartmentSlugs(organizationId);
      if (slugs.length === 0) {
        throw new Error("No departments configured for this organization");
      }
      const results = await Promise.allSettled(
        slugs.map((slug) => campReportsApi.initDepartment(campNo, slug))
      );
      const errorMessage = formatInitErrors(results);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
    });

  const handleInitAll = () =>
    runAction(async () => {
      const slugs = await fetchDepartmentSlugs(organizationId);
      const results = await Promise.allSettled([
        campReportsApi.initCamp(campNo),
        ...slugs.map((slug) => campReportsApi.initDepartment(campNo, slug)),
      ]);
      const errorMessage = formatInitErrors(results);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
    });

  const submenuItems = (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={handleInit}
        className="w-full px-6 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Init
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={handleInitAllDepartments}
        className="w-full px-6 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Init All Departments
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={handleInitAll}
        className="w-full px-6 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Init All
      </button>
    </>
  );

  if (variant === "menu") {
    return (
      <div className="border-t border-zinc-100">
        <button
          type="button"
          disabled={loading}
          onClick={(e) => {
            e.stopPropagation();
            setSubmenuOpen((open) => !open);
          }}
          className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center justify-between gap-2 disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Init Camp Report
          </span>
          <ChevronRight className={`w-4 h-4 transition-transform ${submenuOpen ? "rotate-90" : ""}`} />
        </button>
        {submenuOpen && <div className="bg-zinc-50 border-t border-zinc-100">{submenuItems}</div>}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={loading}
        onClick={() => setSubmenuOpen((open) => !open)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        Init Camp Report
        <ChevronRight className={`w-4 h-4 transition-transform ${submenuOpen ? "rotate-90" : ""}`} />
      </button>
      {submenuOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 w-52 rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden">
          {submenuItems}
        </div>
      )}
    </div>
  );
}
