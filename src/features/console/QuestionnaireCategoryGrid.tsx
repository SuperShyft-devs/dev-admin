import {
  CheckCircle2,
  Circle,
  ClipboardList,
  Droplet,
  FlaskConical,
  HeartPulse,
  Ruler,
  Salad,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ConsoleAssessmentCategoryStatus } from "../../lib/api";

type QuestionnaireCategoryGridProps = {
  categories: ConsoleAssessmentCategoryStatus[];
  onSelect: (category: ConsoleAssessmentCategoryStatus) => void;
  readOnly?: boolean;
};

function categoryIcon(categoryKey?: string | null): LucideIcon {
  const key = String(categoryKey ?? "").toLowerCase();
  if (key.includes("physical") || key.includes("anthropometry")) return Ruler;
  if (key.includes("vital")) return HeartPulse;
  if (key.includes("diet") || key.includes("lifestyle")) return UtensilsCrossed;
  if (key.includes("advanced") && key.includes("blood")) return FlaskConical;
  if (key.includes("blood")) return Droplet;
  if (key.includes("family")) return Users;
  if (key.includes("nutrition") || key.includes("diet")) return Salad;
  return ClipboardList;
}

export function QuestionnaireCategoryGrid({
  categories,
  onSelect,
  readOnly,
}: QuestionnaireCategoryGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {categories.map((category) => {
        const Icon = categoryIcon(category.category_key);
        const isComplete = String(category.status).toLowerCase() === "complete";
        return (
          <button
            key={category.category_id}
            type="button"
            disabled={readOnly}
            onClick={() => onSelect(category)}
            className="group text-left p-4 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-100 text-zinc-700 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                <Icon className="w-5 h-5" />
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  isComplete
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Circle className="w-3.5 h-3.5" />
                )}
                {isComplete ? "Complete" : "Incomplete"}
              </span>
            </div>
            <h3 className="mt-3 font-semibold text-zinc-900">
              {category.display_name || category.category_key || "Category"}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 font-mono truncate">
              {category.category_key}
            </p>
          </button>
        );
      })}
    </div>
  );
}
