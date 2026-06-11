import type { QuestionnaireVisibilityCondition } from "../../../lib/api";

export type ConditionOperator = "equals" | "not_equals" | "contains" | "not_contains" | "in" | "not_in";

export const CONDITION_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "in", label: "In list" },
  { value: "not_in", label: "Not in list" },
] as const;

export type EditableVisibilityCondition = {
  type: "question_answer" | "user_preference";
  operator: ConditionOperator;
  question_key: string;
  preference_key: "diet_preference" | "allergies" | "";
  value: unknown;
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  in: "is in",
  not_in: "is not in",
};

export function normalizeVisibilityRule(condition: QuestionnaireVisibilityCondition): EditableVisibilityCondition {
  const normalizedType: EditableVisibilityCondition["type"] =
    condition.type === "user_preference" ? "user_preference" : "question_answer";
  const normalizedOperator = CONDITION_OPERATORS.some((item) => item.value === condition.operator)
    ? (condition.operator as ConditionOperator)
    : "equals";
  return {
    type: normalizedType,
    operator: normalizedOperator,
    question_key:
      normalizedType === "question_answer" && typeof condition.question_key === "string"
        ? condition.question_key
        : "",
    preference_key:
      normalizedType === "user_preference" &&
      (condition.preference_key === "diet_preference" || condition.preference_key === "allergies")
        ? (condition.preference_key as "diet_preference" | "allergies")
        : "",
    value: condition.value,
  };
}

export function stringifyRuleValue(rawValue: unknown): string {
  if (Array.isArray(rawValue)) return rawValue.join(", ");
  if (rawValue == null) return "";
  return String(rawValue);
}

export function formatVisibilityConditionSentence(condition: EditableVisibilityCondition): string {
  const op = OPERATOR_LABELS[condition.operator] ?? condition.operator;
  const value = stringifyRuleValue(condition.value);
  if (condition.type === "question_answer") {
    const key = condition.question_key || "(unset)";
    return `Answer to \`${key}\` ${op} \`${value}\``;
  }
  const pref = condition.preference_key || "(unset)";
  return `User preference \`${pref}\` ${op} \`${value}\``;
}
