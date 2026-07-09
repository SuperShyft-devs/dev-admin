import type { ConsoleQuestionnaireQuestion } from "../../lib/api";

type QuestionInputProps = {
  question: ConsoleQuestionnaireQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
};

function normalizeType(type?: string | null): string {
  return String(type ?? "").trim().toLowerCase();
}

function optionLabel(opt: { display_name?: string | null; option_value?: string | null }) {
  return String(opt.display_name || opt.option_value || "").trim() || "—";
}

export function QuestionInput({ question, value, onChange, disabled }: QuestionInputProps) {
  const questionType = normalizeType(question.question_type);

  if (
    questionType === "single_choice" ||
    questionType === "choice" ||
    questionType === "radio" ||
    questionType === "single_select" ||
    questionType === "select_one" ||
    questionType === "dropdown"
  ) {
    const selected = String(value ?? "");
    return (
      <div className="space-y-2">
        {(question.options ?? []).map((opt) => {
          const optValue = String(opt.option_value ?? "").trim();
          const isSelected = selected === optValue;
          return (
            <button
              key={optValue || optionLabel(opt)}
              type="button"
              disabled={disabled}
              onClick={() => onChange(optValue)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                isSelected
                  ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                  : "border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50"
              } disabled:opacity-50`}
            >
              {optionLabel(opt)}
            </button>
          );
        })}
      </div>
    );
  }

  if (
    questionType === "multiple_choice" ||
    questionType === "multi_choice" ||
    questionType === "checkbox" ||
    questionType === "multi_select"
  ) {
    const selected = new Set(
      (Array.isArray(value) ? value : []).map((v) => String(v ?? "").trim())
    );
    return (
      <div className="space-y-2">
        {(question.options ?? []).map((opt) => {
          const optValue = String(opt.option_value ?? "").trim();
          const isSelected = selected.has(optValue);
          return (
            <button
              key={optValue || optionLabel(opt)}
              type="button"
              disabled={disabled}
              onClick={() => {
                const next = new Set(selected);
                if (next.has(optValue)) next.delete(optValue);
                else next.add(optValue);
                onChange(Array.from(next));
              }}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                isSelected
                  ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                  : "border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50"
              } disabled:opacity-50`}
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    isSelected ? "bg-zinc-900 border-zinc-900 text-white" : "border-zinc-300"
                  }`}
                >
                  {isSelected ? "✓" : ""}
                </span>
                {optionLabel(opt)}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (questionType === "scale") {
    const scaleValue =
      value != null && typeof value === "object" && !Array.isArray(value)
        ? (value as { value?: unknown; unit?: unknown })
        : { value: value, unit: question.options?.[0]?.option_value };
    const num = scaleValue.value ?? "";
    const unit = String(scaleValue.unit ?? question.options?.[0]?.option_value ?? "");
    return (
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="number"
          value={num === null || num === undefined ? "" : String(num)}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              value: e.target.value === "" ? null : Number(e.target.value),
              unit,
            })
          }
          className="flex-1 border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        {(question.options ?? []).length > 0 && (
          <select
            value={unit}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                value: num === "" || num === null ? null : Number(num),
                unit: e.target.value,
              })
            }
            className="sm:w-40 border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            {(question.options ?? []).map((opt) => (
              <option key={String(opt.option_value)} value={String(opt.option_value ?? "")}>
                {optionLabel(opt)}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  if (questionType === "number" || questionType === "numeric" || questionType === "integer") {
    return (
      <input
        type="number"
        value={value === null || value === undefined ? "" : String(value)}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
      />
    );
  }

  return (
    <textarea
      value={value === null || value === undefined ? "" : String(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
    />
  );
}
