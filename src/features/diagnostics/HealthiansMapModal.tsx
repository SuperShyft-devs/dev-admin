import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Link, Check, ChevronRight } from "lucide-react";
import {
  diagnosticTestsApi,
  getApiError,
  healthiansApi,
  orangeHealthApi,
  type HealthiansConstituent,
} from "../../lib/api";
import { Modal } from "../../shared/ui/Modal";
import {
  isHealthiansProvider,
  isOrangeHealthProvider,
  isProviderParameterMapped,
} from "./providerParameterKeys";

export interface MapModalTest {
  test_id: number;
  test_name: string;
  healthians_parameter_key?: string | null;
  orangehealth_parameter_key?: string | null;
}

function findNextUnmappedTest(
  tests: MapModalTest[],
  currentTestId: number,
  diagnosticProvider: string | null | undefined
): MapModalTest | null {
  const currentIdx = tests.findIndex((t) => t.test_id === currentTestId);
  if (currentIdx === -1) return null;
  for (let i = currentIdx + 1; i < tests.length; i++) {
    if (!isProviderParameterMapped(tests[i], diagnosticProvider)) return tests[i];
  }
  for (let i = 0; i < currentIdx; i++) {
    if (!isProviderParameterMapped(tests[i], diagnosticProvider)) return tests[i];
  }
  return null;
}

interface HealthiansMapModalProps {
  open: boolean;
  onClose: () => void;
  testId: number;
  testName: string;
  currentHealthiansParameterId?: string | null;
  diagnosticProvider: string | null | undefined;
  externalPackageCode: string | null | undefined;
  /** Healthians product deal type when loading constituents (default package). */
  healthiansDealType?: "package" | "profile";
  allTests: MapModalTest[];
  onMapped: () => void | Promise<void>;
  onSwitchTest: (test: MapModalTest) => void;
}

export function HealthiansMapModal({
  open,
  onClose,
  testId,
  testName,
  currentHealthiansParameterId,
  diagnosticProvider,
  externalPackageCode,
  healthiansDealType = "package",
  allTests,
  onMapped,
  onSwitchTest,
}: HealthiansMapModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [constituents, setConstituents] = useState<HealthiansConstituent[]>([]);
  const [packageName, setPackageName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmConstituent, setConfirmConstituent] =
    useState<HealthiansConstituent | null>(null);
  const [mapping, setMapping] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [localTests, setLocalTests] = useState<MapModalTest[]>(allTests);

  const providerLabel =
    isOrangeHealthProvider(diagnosticProvider)
      ? "Orange Health"
      : isHealthiansProvider(diagnosticProvider)
        ? "Healthians"
        : (diagnosticProvider ?? "provider");
  const healthiansProvider = isHealthiansProvider(diagnosticProvider);
  const orangeHealthProvider = isOrangeHealthProvider(diagnosticProvider);
  const mappingSupported = healthiansProvider || orangeHealthProvider;
  const packageIdValid = Boolean((externalPackageCode ?? "").trim());
  const canLoadConstituents =
    orangeHealthProvider || (healthiansProvider && packageIdValid);

  useEffect(() => {
    if (open) {
      setLocalTests(allTests);
    }
  }, [open, allTests]);

  useEffect(() => {
    if (!open) {
      setDataLoaded(false);
      return;
    }
    setSearch("");
    setConfirmConstituent(null);
    setError(null);

    if (!canLoadConstituents) return;
    if (dataLoaded) return;

    setConstituents([]);
    setPackageName(null);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = orangeHealthProvider
          ? await orangeHealthApi.getConstituents()
          : await healthiansApi.getConstituents(externalPackageCode!.trim(), healthiansDealType);
        if (cancelled) return;
        const data = res.data.data;
        setConstituents(data.constituents ?? []);
        setPackageName(data.package_name ?? null);
        setDataLoaded(true);
      } catch (err) {
        if (!cancelled) setError(getApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, canLoadConstituents, orangeHealthProvider, externalPackageCode, healthiansDealType, dataLoaded]);

  const nextUnmappedTest = useMemo(
    () => findNextUnmappedTest(localTests, testId, diagnosticProvider),
    [localTests, testId, diagnosticProvider]
  );

  const mappedConstituent = useMemo(() => {
    if (currentHealthiansParameterId == null) return null;
    return (
      constituents.find((c) => c.id === String(currentHealthiansParameterId)) ?? null
    );
  }, [constituents, currentHealthiansParameterId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return constituents;
    return constituents.filter((c) => c.name.toLowerCase().includes(q));
  }, [constituents, search]);

  const applyLocalMapping = useCallback(
    (constituentId: string): MapModalTest[] =>
      localTests.map((t) => {
        if (t.test_id !== testId) return t;
        if (orangeHealthProvider) {
          return { ...t, orangehealth_parameter_key: constituentId };
        }
        return { ...t, healthians_parameter_key: constituentId };
      }),
    [localTests, testId, orangeHealthProvider]
  );

  const handleMapAndNext = useCallback(
    async (constituent: HealthiansConstituent) => {
      setMapping(true);
      setError(null);
      try {
        await diagnosticTestsApi.update(
          testId,
          orangeHealthProvider
            ? { orangehealth_parameter_key: constituent.id }
            : { healthians_parameter_key: constituent.id }
        );
        const updatedTests = applyLocalMapping(constituent.id);
        setLocalTests(updatedTests);
        await onMapped();
        setConfirmConstituent(null);
        setSearch("");

        const next = findNextUnmappedTest(updatedTests, testId, diagnosticProvider);
        if (next) {
          onSwitchTest(next);
        } else {
          onClose();
        }
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setMapping(false);
      }
    },
    [
      testId,
      orangeHealthProvider,
      diagnosticProvider,
      applyLocalMapping,
      onMapped,
      onSwitchTest,
      onClose,
    ]
  );

  const handleMapAndClose = useCallback(
    async (constituent: HealthiansConstituent) => {
      setMapping(true);
      setError(null);
      try {
        await diagnosticTestsApi.update(
          testId,
          orangeHealthProvider
            ? { orangehealth_parameter_key: constituent.id }
            : { healthians_parameter_key: constituent.id }
        );
        const updatedTests = applyLocalMapping(constituent.id);
        setLocalTests(updatedTests);
        await onMapped();
        onClose();
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setMapping(false);
        setConfirmConstituent(null);
      }
    },
    [testId, orangeHealthProvider, applyLocalMapping, onMapped, onClose]
  );

  const renderContent = () => {
    if (!mappingSupported) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-600">
            Parameter mapping is not available for this diagnostic provider.
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Only Healthians and Orange Health packages support parameter mapping.
          </p>
        </div>
      );
    }

    if (healthiansProvider && !packageIdValid) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-600">
            This package does not have a {providerLabel} Package ID configured.
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Please set the {providerLabel} Package ID on the package first.
          </p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="py-10 flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">
            {orangeHealthProvider
              ? "Loading Orange Health test catalog..."
              : `Fetching constituents from ${providerLabel}...`}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {packageName && (
          <p className="text-xs text-zinc-500">
            {providerLabel} package:{" "}
            <span className="font-medium text-zinc-700">{packageName}</span>
          </p>
        )}

        {mappedConstituent && (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 min-w-0">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-green-600 font-medium">Currently mapped to</p>
                <p className="text-sm text-zinc-900 truncate">{mappedConstituent.name}</p>
                <p className="text-xs text-zinc-500">ID: {mappedConstituent.id}</p>
              </div>
            </div>
            <span className="text-xs font-medium text-green-700 shrink-0">Mapped</span>
          </div>
        )}

        {currentHealthiansParameterId != null && !mappedConstituent && constituents.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <div className="min-w-0">
              <p className="text-xs text-amber-700 font-medium">Currently mapped</p>
              <p className="text-sm text-zinc-900">External Parameter ID: {currentHealthiansParameterId}</p>
              <p className="text-xs text-amber-600">This ID was not found in the current constituents list.</p>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 text-sm"
            placeholder="Search constituents..."
          />
        </div>

        <div className="max-h-72 overflow-y-auto border border-zinc-200 rounded-lg bg-white">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-zinc-500">
              No constituents found.
            </div>
          ) : (
            filtered.map((c) => {
              const isMapped =
                String(currentHealthiansParameterId ?? "") === String(c.id);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 border-b last:border-b-0 border-zinc-200"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-900 truncate">
                      {c.name}
                    </p>
                    <p className="text-xs text-zinc-500">ID: {c.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmConstituent(c)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs font-medium shrink-0"
                  >
                    <Link className="w-3.5 h-3.5" />
                    {isMapped ? "Re-map" : "Map"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Map to ${providerLabel} Parameter`}
        maxWidthClassName="max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Map <span className="font-semibold text-zinc-900">{testName}</span>{" "}
            to a {providerLabel} constituent parameter.
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {renderContent()}
        </div>
      </Modal>

      <Modal
        open={confirmConstituent !== null}
        onClose={() => setConfirmConstituent(null)}
        title="Confirm Mapping"
        maxWidthClassName="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            Map{" "}
            <span className="font-semibold text-zinc-900">{testName}</span> to{" "}
            <span className="font-semibold text-zinc-900">
              {confirmConstituent?.name}
            </span>
            ?
          </p>

          {nextUnmappedTest && (
            <p className="text-xs text-zinc-500">
              Next unmapped test:{" "}
              <span className="font-medium text-zinc-700">
                {nextUnmappedTest.test_name}
              </span>
            </p>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {nextUnmappedTest ? (
              <>
                <button
                  type="button"
                  disabled={mapping}
                  onClick={() =>
                    confirmConstituent &&
                    void handleMapAndNext(confirmConstituent)
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
                >
                  {mapping ? "Mapping..." : "Yes, Next"}
                  {!mapping && <ChevronRight className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  disabled={mapping}
                  onClick={() =>
                    confirmConstituent &&
                    void handleMapAndClose(confirmConstituent)
                  }
                  className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium disabled:opacity-50"
                >
                  Map & Close
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={mapping}
                onClick={() =>
                  confirmConstituent &&
                  void handleMapAndClose(confirmConstituent)
                }
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {mapping ? "Mapping..." : "Yes, Map"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmConstituent(null)}
              disabled={mapping}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
