import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  assessmentPackagesApi,
  diagnosticPackagesApi,
  platformSettingsApi,
  type AssessmentPackage,
  type DiagnosticPackageListItem,
  getApiError,
} from "../../lib/api";
import { fetchAllPages } from "../../lib/fetchAllPages";

function labelAssessment(p: AssessmentPackage) {
  const name = p.display_name?.trim() || p.package_code?.trim() || `Package ${p.package_id}`;
  return `${name} (#${p.package_id})`;
}

function labelDiagnostic(p: DiagnosticPackageListItem) {
  const name = p.package_name?.trim() || `Package ${p.diagnostic_package_id}`;
  return `${name} (#${p.diagnostic_package_id})`;
}

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const [assessmentPackages, setAssessmentPackages] = useState<AssessmentPackage[]>([]);
  const [diagnosticPackages, setDiagnosticPackages] = useState<DiagnosticPackageListItem[]>([]);

  const [assessmentId, setAssessmentId] = useState<number>(1);
  const [diagnosticId, setDiagnosticId] = useState<number>(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveOk(null);
    try {
      const [defaultsRes, aPkgs, dRes] = await Promise.all([
        platformSettingsApi.getB2cOnboarding(),
        fetchAllPages<AssessmentPackage>((page, limit) =>
          assessmentPackagesApi.list({ page, limit, status: "active" })
        ),
        diagnosticPackagesApi.list(),
      ]);

      const d = defaultsRes.data.data;
      setAssessmentId(d.b2c_default_assessment_package_id);
      setDiagnosticId(d.b2c_default_diagnostic_package_id);

      setAssessmentPackages(aPkgs);
      const dPkgs = (dRes.data.data ?? []).filter(
        (p) => (p.status ?? "active").toLowerCase() === "active"
      );
      setDiagnosticPackages(dPkgs);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveOk(null);
    try {
      await platformSettingsApi.patchB2cOnboarding({
        b2c_default_assessment_package_id: assessmentId,
        b2c_default_diagnostic_package_id: diagnosticId,
      });
      setSaveOk("Saved. New public B2C onboardings will use these packages.");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Platform defaults for public B2C onboarding (<code className="text-xs bg-zinc-100 px-1 rounded">POST /users/public/onboard</code>).
          Only new onboardings are affected.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div>
            <label htmlFor="b2c-assessment" className="block text-sm font-medium text-zinc-700 mb-1">
              Default assessment package
            </label>
            <select
              id="b2c-assessment"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={assessmentId}
              onChange={(ev) => setAssessmentId(Number(ev.target.value))}
            >
              {assessmentPackages.map((p) => (
                <option key={p.package_id} value={p.package_id}>
                  {labelAssessment(p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="b2c-diagnostic" className="block text-sm font-medium text-zinc-700 mb-1">
              Default diagnostic package
            </label>
            <select
              id="b2c-diagnostic"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={diagnosticId}
              onChange={(ev) => setDiagnosticId(Number(ev.target.value))}
            >
              {diagnosticPackages.map((p) => (
                <option key={p.diagnostic_package_id} value={p.diagnostic_package_id}>
                  {labelDiagnostic(p)}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {saveOk ? <p className="text-sm text-emerald-700">{saveOk}</p> : null}

          <button
            type="submit"
            disabled={saving || assessmentPackages.length === 0 || diagnosticPackages.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save defaults
          </button>
        </form>
      )}
    </div>
  );
}
