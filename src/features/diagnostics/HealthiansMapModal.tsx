import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Link, Check, ChevronRight } from "lucide-react";
import {
  diagnosticTestsApi,
  getApiError,
  healthiansApi,
  type HealthiansConstituent,
} from "../../lib/api";
import { Modal } from "../../shared/ui/Modal";

export interface MapModalTest {
  test_id: number;
  test_name: string;
  external_parameter_id?: number | null;
}

interface HealthiansMapModalProps {
  open: boolean;
  onClose: () => void;
  testId: number;
  testName: string;
  currentHealthiansParameterId?: number | null;
  diagnosticProvider: string | null | undefined;
  externalPackageId: number | null | undefined;
  allTests: MapModalTest[];
  onMapped: () => void;
  onSwitchTest: (test: MapModalTest) => void;
}

export function HealthiansMapModal({
  open,
  onClose,
  testId,
  testName,
  currentHealthiansParameterId,
  diagnosticProvider,
  externalPackageId,
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

  const providerLabel = diagnosticProvider ?? "provider";
  const providerValid =
    diagnosticProvider?.toLowerCase() === "healthians";
  const packageIdValid = externalPackageId != null && externalPackageId > 0;

  useEffect(() => {
    if (!open) {
      setDataLoaded(false);
      return;
    }
    setSearch("");
    setConfirmConstituent(null);
    setError(null);

    if (!providerValid || !packageIdValid) return;
    if (dataLoaded) return;

    setConstituents([]);
    setPackageName(null);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await healthiansApi.getConstituents(externalPackageId!);
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
  }, [open, providerValid, packageIdValid, externalPackageId, dataLoaded]);

  const nextUnmappedTest = useMemo(() => {
    const currentIdx = allTests.findIndex((t) => t.test_id === testId);
    if (currentIdx === -1) return null;
    for (let i = currentIdx + 1; i < allTests.length; i++) {
      if (allTests[i].external_parameter_id == null) return allTests[i];
    }
    for (let i = 0; i < currentIdx; i++) {
      if (allTests[i].external_parameter_id == null) return allTests[i];
    }
    return null;
  }, [allTests, testId]);

  const mappedConstituent = useMemo(() => {
    if (currentHealthiansParameterId == null) return null;
    return (
      constituents.find(
        (c) => parseInt(c.id, 10) === currentHealthiansParameterId
      ) ?? null
    );
  }, [constituents, currentHealthiansParameterId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return constituents;
    return constituents.filter((c) => c.name.toLowerCase().includes(q));
  }, [constituents, search]);

  const handleMapAndNext = useCallback(
    async (constituent: HealthiansConstituent) => {
      setMapping(true);
      setError(null);
      try {
        await diagnosticTestsApi.update(testId, {
          external_parameter_id: parseInt(constituent.id, 10),
        });
        onMapped();
        setConfirmConstituent(null);
        setSearch("");

        if (nextUnmappedTest) {
          onSwitchTest(nextUnmappedTest);
        } else {
          onClose();
        }
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setMapping(false);
      }
    },
    [testId, nextUnmappedTest, onMapped, onSwitchTest, onClose]
  );

  const handleMapAndClose = useCallback(
    async (constituent: HealthiansConstituent) => {
      setMapping(true);
      setError(null);
      try {
        await diagnosticTestsApi.update(testId, {
          external_parameter_id: parseInt(constituent.id, 10),
        });
        onMapped();
        onClose();
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setMapping(false);
        setConfirmConstituent(null);
      }
    },
    [testId, onMapped, onClose]
  );

  const renderContent = () => {
    if (!providerValid) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-600">
            This package&apos;s diagnostic provider is not {providerLabel}.
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Mapping is only available for packages with {providerLabel} as the
            diagnostic provider.
          </p>
        </div>
      );
    }

    if (!packageIdValid) {
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
            Fetching constituents from {providerLabel}...
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
                currentHealthiansParameterId === parseInt(c.id, 10);
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
