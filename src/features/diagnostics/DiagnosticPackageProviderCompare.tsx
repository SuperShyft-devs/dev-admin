import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ChevronDown, ChevronRight, Link, Loader2, RefreshCw, Search } from "lucide-react";
import { diagnosticPackagesApi, diagnosticTestGroupsApi, getApiError, type ProviderTestDiffResponse } from "../../lib/api";

interface DiagnosticPackageProviderCompareProps {
  packageId?: number;
  testGroupId?: number;
  externalPackageCode: string | null | undefined;
  editPackagePath?: string;
  onMapTest?: (testId: number, testName: string) => void;
  /** When set, diff is loaded by the parent (no duplicate fetch). */
  diff?: ProviderTestDiffResponse | null;
  diffLoading?: boolean;
  diffError?: string | null;
  onRefresh?: () => void;
  /** Self-fetch mode when parent does not pass onRefresh. */
  active?: boolean;
  refreshToken?: number;
  onlyInEntityLabel?: string;
}

function matchesSearch(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query);
}

function filterDiff(data: ProviderTestDiffResponse, query: string): ProviderTestDiffResponse {
  const q = query.trim().toLowerCase();
  if (!q) return data;

  const matched = data.matched.filter(
    (row) =>
      matchesSearch(row.test_name, q) ||
      matchesSearch(row.provider_name, q) ||
      matchesSearch(row.provider_id, q) ||
      row.group_names.some((g) => matchesSearch(g, q))
  );
  const onlyInPackage = data.only_in_package.filter(
    (row) =>
      matchesSearch(row.test_name, q) ||
      matchesSearch(row.provider_id, q) ||
      row.group_names.some((g) => matchesSearch(g, q))
  );
  const notLinked = data.not_linked.filter(
    (row) =>
      matchesSearch(row.test_name, q) || row.group_names.some((g) => matchesSearch(g, q))
  );
  const onlyAtProvider = data.only_at_provider.filter(
    (row) =>
      matchesSearch(row.provider_name, q) ||
      matchesSearch(row.provider_id, q) ||
      (row.catalog_test_name != null && matchesSearch(row.catalog_test_name, q))
  );

  return {
    ...data,
    matched,
    only_in_package: onlyInPackage,
    not_linked: notLinked,
    only_at_provider: onlyAtProvider,
    counts: {
      matched: matched.length,
      only_in_package: onlyInPackage.length,
      only_at_provider: onlyAtProvider.length,
      not_linked: notLinked.length,
    },
  };
}

function GroupList({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="text-xs text-zinc-500 mt-0.5">
      {names.join(", ")}
    </p>
  );
}

export function DiagnosticPackageProviderCompare({
  packageId,
  testGroupId,
  externalPackageCode,
  editPackagePath,
  onMapTest,
  diff: controlledDiff,
  diffLoading: controlledLoading,
  diffError: controlledError,
  onRefresh,
  active = true,
  refreshToken = 0,
  onlyInEntityLabel = "only in package",
}: DiagnosticPackageProviderCompareProps) {
  const controlled = onRefresh != null;
  const entityId = testGroupId ?? packageId ?? 0;

  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [internalData, setInternalData] = useState<ProviderTestDiffResponse | null>(null);
  const [search, setSearch] = useState("");
  const [matchedOpen, setMatchedOpen] = useState(false);

  const load = useCallback(async () => {
    setInternalLoading(true);
    setInternalError(null);
    try {
      const res = testGroupId
        ? await diagnosticTestGroupsApi.getProviderTestDiff(testGroupId)
        : await diagnosticPackagesApi.getProviderTestDiff(packageId!);
      setInternalData(res.data.data);
    } catch (err) {
      setInternalError(getApiError(err));
      setInternalData(null);
    } finally {
      setInternalLoading(false);
    }
  }, [packageId, testGroupId]);

  useEffect(() => {
    if (controlled || !active || !entityId) return;
    void load();
  }, [controlled, active, entityId, refreshToken, load]);

  const data = controlled ? controlledDiff ?? null : internalData;
  const loading = controlled ? (controlledLoading ?? false) : internalLoading;
  const error = controlled ? controlledError ?? null : internalError;

  const handleRefresh = () => {
    if (controlled && onRefresh) {
      onRefresh();
      return;
    }
    void load();
  };

  const filtered = useMemo(() => (data ? filterDiff(data, search) : null), [data, search]);

  const code = (externalPackageCode ?? "").trim();
  if (!code) {
    return (
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
        {testGroupId
          ? "Add a Healthians test group code before comparing tests."
          : "Add a Healthians package code before comparing tests."}{" "}
        {editPackagePath ? (
          <RouterLink to={editPackagePath} className="font-medium text-zinc-900 underline underline-offset-2">
            Edit package
          </RouterLink>
        ) : (
          <span>Set the lab code on this package first.</span>
        )}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Fetching Healthians product details…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {data && (
            <span
              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                data.status === "in_sync"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {data.status === "in_sync" ? "In sync" : "Out of sync"}
            </span>
          )}
          {filtered && (
            <span className="text-xs text-zinc-500">
              {filtered.counts.matched} matched · {filtered.counts.only_at_provider} only at Healthians ·{" "}
              {filtered.counts.only_in_package} {onlyInEntityLabel} · {filtered.counts.not_linked} not linked
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {data && (
        <div className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-900">{data.healthians_package_name ?? "Healthians product"}</span>
          <span className="text-zinc-400 mx-1">·</span>
          <span>Code {data.external_package_code}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-100 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {filtered && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by test name or Healthians ID…"
            className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900"
          />
        </div>
      )}

      {filtered && (filtered.only_at_provider.length > 0 || filtered.only_in_package.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.only_at_provider.length > 0 && (
            <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-medium text-zinc-900">
                Only at Healthians
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800">
                  {filtered.only_at_provider.length}
                </span>
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filtered.only_at_provider.map((row) => (
                  <div key={row.provider_id} className="border border-zinc-200 rounded-lg px-3 py-2">
                    <p className="text-sm text-zinc-900">{row.provider_name}</p>
                    <p className="text-xs text-zinc-500">ID {row.provider_id}</p>
                    <p className="text-xs text-amber-700 mt-1">
                      {row.catalog_test_name
                        ? `In catalog as ${row.catalog_test_name}, not in this package.`
                        : "Not in our test catalog."}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {filtered.only_in_package.length > 0 && (
            <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-medium text-zinc-900">
                Only in this package
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
                  {filtered.only_in_package.length}
                </span>
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filtered.only_in_package.map((row) => (
                  <div key={row.test_id} className="border border-zinc-200 rounded-lg px-3 py-2">
                    <p className="text-sm text-zinc-900">{row.test_name}</p>
                    <GroupList names={row.group_names} />
                    <p className="text-xs text-zinc-500 mt-1">Mapped ID {row.provider_id}</p>
                    <p className="text-xs text-amber-700">Healthians does not include this id in the product.</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {filtered && filtered.not_linked.length > 0 && (
        <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-zinc-900">
            Not linked to Healthians
            <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
              {filtered.not_linked.length}
            </span>
          </h3>
          <div className="space-y-2">
            {filtered.not_linked.map((row) => (
              <div key={row.test_id} className="border border-zinc-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-zinc-900">{row.test_name}</p>
                  <GroupList names={row.group_names} />
                </div>
                {onMapTest ? (
                  <button
                    type="button"
                    onClick={() => onMapTest(row.test_id, row.test_name)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-xs font-medium shrink-0"
                  >
                    <Link className="w-3.5 h-3.5" />
                    Map
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {filtered && filtered.matched.length > 0 && (
        <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
          <button
            type="button"
            onClick={() => setMatchedOpen((open) => !open)}
            className="w-full flex items-center justify-between text-sm font-medium text-zinc-900"
          >
            <span className="inline-flex items-center gap-2">
              {matchedOpen ? (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              )}
              Matched
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                {filtered.matched.length}
              </span>
            </span>
          </button>
          {matchedOpen && (
            <div className="space-y-2 pt-1">
              {filtered.matched.map((row) => (
                <div key={`${row.test_id}-${row.provider_id}`} className="border border-zinc-200 rounded-lg px-3 py-2">
                  <p className="text-sm text-zinc-900">{row.test_name}</p>
                  <p className="text-xs text-zinc-500">{row.provider_name}</p>
                  <GroupList names={row.group_names} />
                  <p className="text-xs text-zinc-500 mt-1">ID {row.provider_id}</p>
                  {row.shared_provider_id && (
                    <p className="text-xs text-amber-700 mt-0.5">Shares this Healthians id with another test in this package.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {filtered &&
        filtered.matched.length === 0 &&
        filtered.only_in_package.length === 0 &&
        filtered.only_at_provider.length === 0 &&
        filtered.not_linked.length === 0 &&
        !loading && (
          <p className="text-sm text-zinc-500">No tests to compare. Assign test groups on the Tests tab.</p>
        )}
    </div>
  );
}
