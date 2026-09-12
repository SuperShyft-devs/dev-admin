import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { integrationsApi, type MetsightsBloodMappingPayload, getApiError } from "../../lib/api";

export function MetsightsBloodMappingSection() {
  const [data, setData] = useState<MetsightsBloodMappingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    integrationsApi
      .getMetsightsBloodMapping()
      .then((res) => {
        if (!cancelled) {
          setData(res.data.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading Metsights blood mapping…
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Healthians ↔ Metsights blood mapping</h2>
        <p className="text-sm text-red-600 mt-2">{error ?? "Unable to load mapping reference."}</p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-zinc-200 rounded-xl p-5 space-y-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Healthians ↔ Metsights blood mapping</h2>
        <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
          Read-only reference for how lab keys and units flow from Healthians into Metsights. Use this
          when choosing Pro vs Basic or debugging draft/push.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Data flow</h3>
        <ol className="text-sm text-zinc-700 list-decimal list-inside space-y-1">
          {data.flow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
          Pro vs Basic
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-zinc-200 rounded-lg overflow-hidden">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Blood categories</th>
                <th className="px-3 py-2 font-medium">Hormones required</th>
              </tr>
            </thead>
            <tbody>
              {data.package_matrix.map((row) => (
                <tr key={row.package_code} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-mono text-xs">{row.package_code}</td>
                  <td className="px-3 py-2">{row.assessment_type_code}</td>
                  <td className="px-3 py-2">{row.blood_categories.join(", ")}</td>
                  <td className="px-3 py-2">{row.hormones_required ? "Yes (Pro female)" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
          Key aliases ({data.counts.key_aliases})
        </h3>
        <div className="max-h-64 overflow-y-auto border border-zinc-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 sticky top-0 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Healthians key</th>
                <th className="px-3 py-2 font-medium">Metsights key</th>
              </tr>
            </thead>
            <tbody>
              {data.key_aliases.map((row) => (
                <tr key={row.healthians_key} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-mono text-xs">{row.healthians_key}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.metsights_key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
          Unit synonyms
        </h3>
        <div className="overflow-x-auto border border-zinc-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Healthians / IHR</th>
                <th className="px-3 py-2 font-medium">Maps to</th>
                <th className="px-3 py-2 font-medium">Metsights code</th>
              </tr>
            </thead>
            <tbody>
              {data.unit_synonyms.map((row) => (
                <tr key={`${row.healthians}-${row.metsights_code}`} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-mono text-xs">{row.healthians}</td>
                  <td className="px-3 py-2">{row.maps_to}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.metsights_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
          Pro hormone placeholders (female, when labs missing)
        </h3>
        <ul className="text-sm text-zinc-700 space-y-1">
          {data.hormone_placeholders.map((row) => (
            <li key={row.question_key} className="font-mono text-xs">
              {row.question_key}: {row.value} (unit code {row.unit_code}) — {row.when}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
