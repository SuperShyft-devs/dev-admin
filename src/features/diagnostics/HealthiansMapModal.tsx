import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Link, Check } from "lucide-react";
import {
  diagnosticTestsApi,
  getApiError,
  healthiansApi,
  type HealthiansConstituent,
} from "../../lib/api";
import { Modal } from "../../shared/ui/Modal";

interface HealthiansMapModalProps {
  open: boolean;
  onClose: () => void;
  testId: number;
  testName: string;
  currentHealthiansParameterId?: number | null;
  diagnosticProvider: string | null | undefined;
  healthiansCampId: number | null | undefined;
  onMapped: () => void;
}

export function HealthiansMapModal({
  open,
  onClose,
  testId,
  testName,
  currentHealthiansParameterId,
  diagnosticProvider,
  healthiansCampId,
  onMapped,
}: HealthiansMapModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [constituents, setConstituents] = useState<HealthiansConstituent[]>([]);
  const [packageName, setPackageName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmConstituent, setConfirmConstituent] =
    useState<HealthiansConstituent | null>(null);
  const [mapping, setMapping] = useState(false);

  const providerValid =
    diagnosticProvider?.toLowerCase() === "healthians";
  const campIdValid = healthiansCampId != null && healthiansCampId > 0;

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setConfirmConstituent(null);
    setError(null);
    setConstituents([]);
    setPackageName(null);

    if (!providerValid || !campIdValid) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await healthiansApi.getConstituents(healthiansCampId!);
        if (cancelled) return;
        const data = res.data.data;
        setConstituents(data.constituents ?? []);
        setPackageName(data.package_name ?? null);
      } catch (err) {
        if (!cancelled) setError(getApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, providerValid, campIdValid, healthiansCampId]);

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

  const handleMap = async (constituent: HealthiansConstituent) => {
    setMapping(true);
    setError(null);
    try {
      await diagnosticTestsApi.update(testId, {
        healthians_parameter_id: parseInt(constituent.id, 10),
      });
      onMapped();
      onClose();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setMapping(false);
      setConfirmConstituent(null);
    }
  };

  const renderContent = () => {
    if (!providerValid) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-600">
            This package's diagnostic provider is not Healthians.
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Mapping is only available for packages with Healthians as the
            diagnostic provider.
          </p>
        </div>
      );
    }

    if (!campIdValid) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-600">
            This package does not have a Healthians Camp ID configured.
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Please set the Healthians Camp ID on the package first.
          </p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="py-10 flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">
            Fetching constituents from Healthians...
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {packageName && (
          <p className="text-xs text-zinc-500">
            Healthians package:{" "}
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
              <p className="text-sm text-zinc-900">Healthians Parameter ID: {currentHealthiansParameterId}</p>
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
        title="Map to Healthians Parameter"
        maxWidthClassName="max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Map <span className="font-semibold text-zinc-900">{testName}</span>{" "}
            to a Healthians constituent parameter.
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

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={mapping}
              onClick={() =>
                confirmConstituent && void handleMap(confirmConstituent)
              }
              className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {mapping ? "Mapping..." : "Yes, Map"}
            </button>
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
