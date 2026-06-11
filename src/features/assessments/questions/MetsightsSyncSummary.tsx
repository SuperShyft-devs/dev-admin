import { Link } from "react-router-dom";
import type { QuestionnaireQuestion } from "../../../lib/api";
import { StatusBadge } from "./questionUi";

interface MetsightsSyncSummaryProps {
  question: QuestionnaireQuestion;
  onConfigure: () => void;
}

export function MetsightsSyncSummary({ question, onConfigure }: MetsightsSyncSummaryProps) {
  const sync = question.metsights_sync;
  const hasConfig = Boolean(sync?.pull || sync?.push);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3 text-sm">
        <div>
          <p className="font-medium text-zinc-900">Metsights sync</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure how answers are pulled from and pushed to Metsights for questions in Metsights categories.
          </p>
        </div>

        {!hasConfig ? (
          <p className="text-zinc-500">
            No sync configuration yet. Assign this question to a Metsights category from{" "}
            <Link to="/assessments/categories" className="font-medium text-zinc-700 underline hover:text-zinc-900">
              Categories → Manage Questions
            </Link>
            , then configure pull/push strategies here.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-zinc-200 bg-zinc-50">
              <p className="text-xs text-zinc-500">Pull</p>
              <p className="text-zinc-900 font-medium mt-1">
                {sync?.pull?.enabled ? "Enabled" : "Disabled"}
              </p>
              {sync?.pull?.strategy && (
                <p className="text-xs font-mono text-zinc-600 mt-0.5">{sync.pull.strategy}</p>
              )}
              <div className="mt-2">
                <StatusBadge status={sync?.pull?.enabled ? "active" : "inactive"} />
              </div>
            </div>
            <div className="p-3 rounded-lg border border-zinc-200 bg-zinc-50">
              <p className="text-xs text-zinc-500">Push</p>
              <p className="text-zinc-900 font-medium mt-1">
                {sync?.push?.enabled ? "Enabled" : "Disabled"}
              </p>
              {sync?.push?.strategy && (
                <p className="text-xs font-mono text-zinc-600 mt-0.5">{sync.push.strategy}</p>
              )}
              <div className="mt-2">
                <StatusBadge status={sync?.push?.enabled ? "active" : "inactive"} />
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onConfigure}
          className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
        >
          Configure sync
        </button>
      </div>
    </div>
  );
}
