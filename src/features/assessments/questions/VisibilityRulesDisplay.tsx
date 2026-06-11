import type { QuestionnaireQuestion } from "../../../lib/api";
import { formatVisibilityConditionSentence, normalizeVisibilityRule } from "./visibilityRules";

interface VisibilityRulesDisplayProps {
  question: QuestionnaireQuestion;
}

export function VisibilityRulesDisplay({ question }: VisibilityRulesDisplayProps) {
  const conditions = question.visibility_rules?.conditions ?? [];
  const matchMode = question.visibility_rules?.match === "any" ? "any" : "all";
  const hasVisibility = conditions.length > 0;
  const hasPrefill = Boolean(question.prefill_from?.preference_key);

  if (!hasVisibility && !hasPrefill) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-4 text-sm text-zinc-500">
        Always shown — no visibility conditions or auto-fill.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasVisibility && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3 text-sm">
          <div>
            <p className="font-medium text-zinc-900">Show when</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {conditions.length > 1
                ? matchMode === "any"
                  ? "Any condition matches"
                  : "All conditions match"
                : "Single condition"}
            </p>
          </div>
          <ul className="space-y-2">
            {conditions.map((raw, index) => {
              const condition = normalizeVisibilityRule(raw);
              return (
                <li
                  key={index}
                  className="px-3 py-2 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700"
                >
                  {formatVisibilityConditionSentence(condition)}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasPrefill && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4 text-sm">
          <p className="text-zinc-500">Auto-fill source</p>
          <p className="text-zinc-900 font-medium mt-1">
            User preference: <span className="font-mono text-xs">{question.prefill_from?.preference_key}</span>
          </p>
        </div>
      )}
    </div>
  );
}
