import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Loader2, Search } from "lucide-react";
import {
  diagnosticPackagesApi,
  diagnosticTestGroupsApi,
  getApiError,
  healthiansApi,
  type HealthiansConstituent,
  type ProviderTestDiffResponse,
} from "../../lib/api";
import { Modal } from "../../shared/ui/Modal";
import { ProviderSyncPreviewPanel } from "./ProviderSyncPreviewPanel";

type ProviderChoice = "Healthians" | "orange_health";

function providerKey(provider: string | null | undefined): string | null {
  const text = (provider ?? "").trim().toLowerCase();
  return text || null;
}

type AssignedPackage = {
  diagnostic_package_id: number;
  package_name: string;
  diagnostic_provider?: string | null;
  status?: string | null;
};

interface TestGroupProviderMapModalProps {
  open: boolean;
  onClose: () => void;
  groupId: number;
  groupName: string;
  currentProvider: string | null | undefined;
  currentExternalCode: string | null | undefined;
  onComplete: () => void | Promise<void>;
}

export function TestGroupProviderMapModal({
  open,
  onClose,
  groupId,
  groupName,
  currentProvider,
  currentExternalCode,
  onComplete,
}: TestGroupProviderMapModalProps) {
  const [step, setStep] = useState<"provider" | "search" | "confirm">("provider");
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>("Healthians");
  const [profileSearch, setProfileSearch] = useState("");
  const [profiles, setProfiles] = useState<HealthiansConstituent[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<HealthiansConstituent | null>(null);
  const [diff, setDiff] = useState<ProviderTestDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [assignedPackages, setAssignedPackages] = useState<AssignedPackage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatchPackages, setMismatchPackages] = useState<AssignedPackage[]>([]);
  const [removingPackageId, setRemovingPackageId] = useState<number | null>(null);
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);

  const incomingKey = useMemo(
    () => (providerChoice === "Healthians" ? "healthians" : "orange_health"),
    [providerChoice]
  );

  const reset = useCallback(() => {
    setStep("provider");
    const key = (currentProvider ?? "").trim().toLowerCase();
    setProviderChoice(key === "orange_health" ? "orange_health" : "Healthians");
    setProfileSearch("");
    setProfiles([]);
    setSelectedProfile(null);
    setDiff(null);
    setError(null);
    setMismatchPackages([]);
    setSyncDetailsOpen(false);
  }, [currentProvider]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open || step !== "search" || providerChoice !== "Healthians") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setProfilesLoading(true);
        try {
          const res = await healthiansApi.searchProfiles(profileSearch.trim() || undefined);
          if (!cancelled) setProfiles(res.data.data.profiles ?? []);
        } catch (err) {
          if (!cancelled) setError(getApiError(err));
        } finally {
          if (!cancelled) setProfilesLoading(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, step, providerChoice, profileSearch]);

  const loadPackagesAndDiff = useCallback(
    async (profile: HealthiansConstituent | null) => {
      setError(null);
      setDiffLoading(true);
      try {
        const packagesRes = await diagnosticTestGroupsApi.listPackages(groupId);
        const packages = packagesRes.data.data ?? [];
        setAssignedPackages(packages);
        const mismatched = packages.filter((pkg) => {
          const pkgKey = providerKey(pkg.diagnostic_provider);
          return pkgKey != null && pkgKey !== incomingKey;
        });
        setMismatchPackages(mismatched);

        if (providerChoice === "Healthians" && profile) {
          const diffRes = await diagnosticTestGroupsApi.getProviderTestDiff(groupId, profile.id);
          setDiff(diffRes.data.data);
        } else {
          setDiff(null);
        }
        setStep("confirm");
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setDiffLoading(false);
      }
    },
    [groupId, incomingKey, providerChoice]
  );

  const handleProviderNext = () => {
    setError(null);
    if (providerChoice === "Healthians") {
      setStep("search");
      return;
    }
    void loadPackagesAndDiff(null);
  };

  const handleSelectProfile = (profile: HealthiansConstituent) => {
    setSelectedProfile(profile);
    void loadPackagesAndDiff(profile);
  };

  const handleRemoveFromPackage = async (packageId: number) => {
    setRemovingPackageId(packageId);
    setError(null);
    try {
      await diagnosticPackagesApi.removeTestGroup(packageId, groupId);
      const packagesRes = await diagnosticTestGroupsApi.listPackages(groupId);
      const packages = packagesRes.data.data ?? [];
      setAssignedPackages(packages);
      setMismatchPackages(
        packages.filter((pkg) => {
          const pkgKey = providerKey(pkg.diagnostic_provider);
          return pkgKey != null && pkgKey !== incomingKey;
        })
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setRemovingPackageId(null);
    }
  };

  const handleSave = async () => {
    if (mismatchPackages.length > 0) {
      setError("Remove this test group from mismatched packages before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await diagnosticTestGroupsApi.update(groupId, {
        diagnostic_provider: providerChoice,
        external_test_group_code:
          providerChoice === "Healthians" ? selectedProfile?.id ?? currentExternalCode ?? null : null,
      });
      await onComplete();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as {
          error_code?: string;
          message?: string;
          packages?: AssignedPackage[];
        };
        if (data.error_code === "DIAGNOSTIC_TEST_GROUP_PACKAGE_PROVIDER_MISMATCH" && data.packages) {
          setMismatchPackages(data.packages);
        }
        setError(data.message ?? getApiError(err));
      } else {
        setError(getApiError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Map lab provider · ${groupName}`}
      maxWidthClassName={syncDetailsOpen ? "max-w-2xl" : "max-w-xl"}
    >
      <div className="space-y-4 text-sm">
        {error ? (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">{error}</div>
        ) : null}

        {step === "provider" ? (
          <div className="space-y-3">
            <p className="text-zinc-600">Choose the lab provider for this test group.</p>
            <select
              value={providerChoice}
              onChange={(e) => setProviderChoice(e.target.value as ProviderChoice)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="Healthians">Healthians</option>
              <option value="orange_health">Orange Health</option>
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-zinc-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProviderNext}
                className="px-3 py-2 rounded-lg bg-zinc-900 text-white font-medium"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        {step === "search" ? (
          <div className="space-y-3">
            <p className="text-zinc-600">Search Healthians profiles and select one to map.</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="search"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Search by name or id…"
                className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg"
                autoFocus
              />
            </div>
            {profilesLoading ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading profiles…
              </div>
            ) : (
              <ul className="max-h-64 overflow-y-auto border border-zinc-200 rounded-lg divide-y divide-zinc-100">
                {profiles.length === 0 ? (
                  <li className="px-3 py-4 text-zinc-500">No profiles found.</li>
                ) : (
                  profiles.map((profile) => (
                    <li key={profile.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectProfile(profile)}
                        disabled={diffLoading}
                        className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        <span className="font-medium text-zinc-900">{profile.name}</span>
                        <span className="text-zinc-400 ml-2 font-mono text-xs">#{profile.id}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            <button type="button" onClick={() => setStep("provider")} className="text-zinc-600 underline">
              Back
            </button>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-3">
            {providerChoice === "Healthians" && selectedProfile ? (
              <p className="text-zinc-700">
                Mapping to <span className="font-medium">{selectedProfile.name}</span>{" "}
                <span className="font-mono text-xs text-zinc-500">#{selectedProfile.id}</span>
              </p>
            ) : (
              <p className="text-zinc-700">Set provider to Orange Health (no external profile code).</p>
            )}

            {diffLoading ? (
              <div className="flex items-center gap-2 text-zinc-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading sync preview…
              </div>
            ) : diff ? (
              <ProviderSyncPreviewPanel
                diff={diff}
                detailsOpen={syncDetailsOpen}
                onDetailsOpenChange={setSyncDetailsOpen}
              />
            ) : null}

            {mismatchPackages.length > 0 ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                <p className="font-medium mb-2">Remove this test group from these packages first:</p>
                <ul className="space-y-2">
                  {mismatchPackages.map((pkg) => (
                    <li key={pkg.diagnostic_package_id} className="flex items-center justify-between gap-2">
                      <span>
                        {pkg.package_name}{" "}
                        <span className="text-amber-800/80">({pkg.diagnostic_provider ?? "no provider"})</span>
                      </span>
                      <button
                        type="button"
                        disabled={removingPackageId === pkg.diagnostic_package_id}
                        onClick={() => void handleRemoveFromPackage(pkg.diagnostic_package_id)}
                        className="px-2 py-1 rounded border border-amber-300 bg-white text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
                      >
                        {removingPackageId === pkg.diagnostic_package_id ? "Removing…" : "Remove"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : assignedPackages.length > 0 ? (
              <p className="text-zinc-500 text-xs">
                Assigned to {assignedPackages.length} package{assignedPackages.length === 1 ? "" : "s"} — all match
                this provider.
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep(providerChoice === "Healthians" ? "search" : "provider")}
                className="px-3 py-2 rounded-lg border border-zinc-200"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving || (providerChoice === "Healthians" && !selectedProfile)}
                onClick={() => void handleSave()}
                className="px-3 py-2 rounded-lg bg-zinc-900 text-white font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save mapping"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
