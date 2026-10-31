import type { IntegrationSyncLog } from "../../lib/api";

export type TimePreset = "" | "1h" | "24h" | "7d" | "30d";
export type PayloadTab = "request" | "response" | "error";

export const STATUS_OPTIONS = ["pending", "success", "failed", "skipped"] as const;

export const PROVIDER_OPTIONS = [
  { value: "", label: "All providers" },
  { value: "metsights", label: "Metsights" },
  { value: "healthians", label: "Healthians" },
  { value: "orange_health", label: "Orange Health" },
  { value: "redcliffe", label: "Redcliffe" },
  { value: "n8n", label: "n8n" },
  { value: "nutrition_api", label: "Nutrition API" },
  { value: "aurae", label: "Aurae" },
  { value: "bio_ai_reports", label: "Bio AI Reports" },
  { value: "internal", label: "Internal" },
  { value: "google_maps", label: "Google Maps" },
  { value: "nominatim", label: "Nominatim" },
] as const;

export const TIME_PRESETS: { key: TimePreset; label: string }[] = [
  { key: "1h", label: "Last 1h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "", label: "All time" },
];

export function providerLabel(provider: string): string {
  const match = PROVIDER_OPTIONS.find((p) => p.value === provider);
  return match?.label ?? provider;
}

export function formatDateTime(val?: string | null) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString();
  } catch {
    return val;
  }
}

export function formatRelativeTime(val?: string | null): string {
  if (!val) return "—";
  const date = new Date(val);
  if (Number.isNaN(date.getTime())) return val;
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function StatusBadge({ status }: { status?: string | null }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border";
  if (status === "success") return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>success</span>;
  if (status === "failed") return <span className={`${base} bg-red-50 text-red-700 border-red-200`}>failed</span>;
  if (status === "pending") return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>pending</span>;
  if (status === "skipped") return <span className={`${base} bg-zinc-100 text-zinc-600 border-zinc-300`}>skipped</span>;
  return <span className={`${base} bg-zinc-50 text-zinc-600 border-zinc-200`}>{status ?? "—"}</span>;
}

export function ProviderBadge({ provider }: { provider: string }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border";
  if (provider === "metsights") return <span className={`${base} bg-blue-50 text-blue-700 border-blue-200`}>metsights</span>;
  if (provider === "healthians") return <span className={`${base} bg-orange-50 text-orange-700 border-orange-200`}>healthians</span>;
  if (provider === "orange_health") return <span className={`${base} bg-orange-50 text-orange-800 border-orange-300`}>orange_health</span>;
  if (provider === "redcliffe") return <span className={`${base} bg-rose-50 text-rose-800 border-rose-200`}>redcliffe</span>;
  if (provider === "n8n") return <span className={`${base} bg-violet-50 text-violet-700 border-violet-200`}>n8n</span>;
  if (provider === "nutrition_api") return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>nutrition_api</span>;
  if (provider === "aurae") return <span className={`${base} bg-cyan-50 text-cyan-700 border-cyan-200`}>aurae</span>;
  if (provider === "bio_ai_reports") return <span className={`${base} bg-teal-50 text-teal-700 border-teal-200`}>bio_ai_reports</span>;
  if (provider === "internal") return <span className={`${base} bg-zinc-100 text-zinc-700 border-zinc-300`}>internal</span>;
  if (provider === "google_maps") return <span className={`${base} bg-yellow-50 text-yellow-800 border-yellow-200`}>google_maps</span>;
  if (provider === "nominatim") return <span className={`${base} bg-sky-50 text-sky-700 border-sky-200`}>nominatim</span>;
  return <span className={`${base} bg-zinc-50 text-zinc-600 border-zinc-200`}>{provider}</span>;
}

function parseWebhookFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    const segments = pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "—";
  } catch {
    const trimmed = url.replace(/\/+$/g, "");
    const segments = trimmed.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "—";
  }
}

function parseCategoryFromUrl(url: string): string {
  const match = url.match(/\/records\/[^/]+\/([^/]+)\/?$/);
  return match?.[1] ?? "—";
}

function parseNutritionScore(log: IntegrationSyncLog): string {
  const payload = log.response_payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "nutrition_score" in payload) {
    const score = payload.nutrition_score;
    return score == null ? "—" : String(score);
  }
  return "—";
}

export function summarizeEndpoint(log: IntegrationSyncLog): string {
  const url = log.api_endpoint_url;
  if (log.provider === "n8n") return parseWebhookFromUrl(url);
  if (log.provider === "nutrition_api") {
    const score = parseNutritionScore(log);
    return score !== "—" ? `score ${score}` : "nutrition API";
  }
  if (log.provider === "healthians" || log.provider === "orange_health") {
    try {
      const pathname = new URL(url).pathname;
      const tail = pathname.split("/").filter(Boolean).pop();
      return tail ?? url;
    } catch {
      return parseWebhookFromUrl(url);
    }
  }
  if (log.provider === "bio_ai_reports") {
    if (url.includes("internal://bioai-report/")) return "generate BioReport (full JSON)";
    if (url.includes("/api/reports/regenerate")) return "regenerate PDF";
    if (url.includes("/api/reports")) return "register PDF";
    return "bio-ai-reports";
  }
  if (log.provider === "google_maps" || log.provider === "nominatim") return "geocode";
  if (log.provider === "internal" && url.includes("camp_report_intelligence")) return "camp report intelligence";
  const category = parseCategoryFromUrl(url);
  if (category !== "—") return category;
  if (url.includes("/reports/fitness-reports/")) return "fitness report";
  if (url.includes("/reports/")) return "report";
  if (url.includes("/profiles/")) return "profile";
  return parseWebhookFromUrl(url);
}

export function getTimeRange(preset: TimePreset): { from?: string; to?: string } {
  if (!preset) return {};
  const now = new Date();
  const from = new Date(now);
  if (preset === "1h") from.setHours(from.getHours() - 1);
  if (preset === "24h") from.setDate(from.getDate() - 1);
  if (preset === "7d") from.setDate(from.getDate() - 7);
  if (preset === "30d") from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: now.toISOString() };
}

export function defaultPayloadTab(log: IntegrationSyncLog): PayloadTab {
  if (log.status === "failed" && log.error_message) {
    return "error";
  }
  if (log.provider === "bio_ai_reports" && log.api_endpoint_url.includes("internal://bioai-report/")) {
    return log.status === "success" ? "response" : "error";
  }
  return "request";
}

export function formatWho(log: IntegrationSyncLog): { primary: string; secondary?: string } {
  const userLabel =
    log.user_display_name ?? (log.user_id != null ? `User #${log.user_id}` : null);
  const engagementLabel =
    log.engagement_display_name ?? (log.engagement_id != null ? `Engagement #${log.engagement_id}` : null);

  const parts = [userLabel, engagementLabel].filter(Boolean) as string[];
  if (parts.length === 0) return { primary: "—" };

  const secondaryParts: string[] = [];
  if (log.user_id != null && log.user_display_name) secondaryParts.push(`user #${log.user_id}`);
  if (log.engagement_id != null && log.engagement_display_name) {
    secondaryParts.push(`engagement #${log.engagement_id}`);
  }

  return {
    primary: parts.join(" · "),
    secondary: secondaryParts.length ? secondaryParts.join(" · ") : undefined,
  };
}

export type IntegrationLogsSearchParams = {
  provider?: string;
  status?: string;
  time?: string;
  q?: string;
  user?: string;
  engagement?: string;
  payload?: string;
  page?: string;
  log?: string;
};

export function buildIntegrationLogsPath(params: IntegrationLogsSearchParams = {}): string {
  const search = new URLSearchParams();
  if (params.provider) search.set("provider", params.provider);
  if (params.status) search.set("status", params.status);
  if (params.time) search.set("time", params.time);
  if (params.q) search.set("q", params.q);
  if (params.user) search.set("user", params.user);
  if (params.engagement) search.set("engagement", params.engagement);
  if (params.payload) search.set("payload", params.payload);
  if (params.page && params.page !== "1") search.set("page", params.page);
  if (params.log) search.set("log", params.log);
  const qs = search.toString();
  return qs ? `/integration-logs?${qs}` : "/integration-logs";
}
