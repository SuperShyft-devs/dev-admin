import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ProviderTestDiffResponse } from "../../lib/api";
import {
  buildOurTestRows,
  buildProviderConstituentRows,
  ourTestCount,
  providerConstituentCount,
} from "./providerSyncPreviewUtils";

interface ProviderSyncPreviewPanelProps {
  diff: ProviderTestDiffResponse;
  ourEntityLabel?: string;
  providerLabel?: string;
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
}

function OurStatusPill({ status }: { status: "matched" | "not_linked" | "only_in_ours" }) {
  if (status === "matched") {
    return (
      <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-800 border border-green-200">
        Matched
      </span>
    );
  }
  if (status === "not_linked") {
    return (
      <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
        Not linked
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
      Key mismatch
    </span>
  );
}

export function ProviderSyncPreviewPanel({
  diff,
  ourEntityLabel = "this test group",
  providerLabel = "Healthians profile",
  detailsOpen: controlledOpen,
  onDetailsOpenChange,
}: ProviderSyncPreviewPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const detailsOpen = controlledOpen ?? internalOpen;
  const setDetailsOpen = onDetailsOpenChange ?? setInternalOpen;

  const ourRows = buildOurTestRows(diff);
  const providerRows = buildProviderConstituentRows(diff);
  const ourCount = ourTestCount(diff);
  const providerCount = providerConstituentCount(diff);

  return (
    <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-800">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium">Test sync preview</p>
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          aria-expanded={detailsOpen}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 shrink-0"
        >
          Details
          {detailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      <ul className="list-disc list-inside space-y-0.5 text-zinc-700 text-sm">
        <li>{diff.counts.matched} parameters correctly mapped</li>
        <li>{diff.counts.only_at_provider} extra in Healthians</li>
        <li>{diff.counts.only_in_package} only in {ourEntityLabel}</li>
        <li>{diff.counts.not_linked} of our tests not linked yet</li>
      </ul>

      {detailsOpen ? (
        <div className="mt-3 pt-3 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-900 mb-1.5 capitalize">
              {ourEntityLabel} ({ourCount})
            </p>
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
              {ourRows.length === 0 ? (
                <li className="px-2.5 py-3 text-xs text-zinc-500">No tests in this group.</li>
              ) : (
                ourRows.map((row) => (
                  <li key={row.test_id} className="px-2.5 py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-900 truncate">{row.test_name}</p>
                      {row.detail ? <p className="text-[10px] text-zinc-500 truncate mt-0.5">{row.detail}</p> : null}
                    </div>
                    <OurStatusPill status={row.status} />
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-900 mb-1.5">{providerLabel} ({providerCount})</p>
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
              {providerRows.length === 0 ? (
                <li className="px-2.5 py-3 text-xs text-zinc-500">No constituents returned.</li>
              ) : (
                providerRows.map((row) => (
                  <li key={row.provider_id} className="px-2.5 py-2">
                    <p className="text-xs text-zinc-900">{row.provider_name}</p>
                    <p className="text-[10px] font-mono text-zinc-500 mt-0.5">#{row.provider_id}</p>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
