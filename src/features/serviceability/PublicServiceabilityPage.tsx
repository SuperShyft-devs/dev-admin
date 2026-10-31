import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AddressAutocomplete } from "../engagements/AddressAutocomplete";
import { useAuth } from "../../contexts/AuthContext";
import {
  getApiError,
  publicDiagnosticsApi,
  publicGeocodeApi,
  redcliffePublicApi,
  type GeocodeSuggestion,
  type PublicServiceabilityProviderResult,
  type RedcliffeAreaSearchResult,
} from "../../lib/api";

type Mode = "address" | "pincode" | "redcliffe";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";

function providerLabel(provider: string): string {
  if (provider === "healthians") return "Healthians";
  if (provider === "orange_health") return "Orange Health";
  if (provider === "redcliffe") return "Redcliffe";
  return provider;
}

function placeDisplayName(place: RedcliffeAreaSearchResult): string {
  const name = (place.placeName ?? "").trim();
  const addr = (place.placeAddress ?? "").trim();
  if (name && addr) return `${name} — ${addr}`;
  return name || addr || place.eloc || "Unknown place";
}

function ProviderResultCard({ item }: { item: PublicServiceabilityProviderResult }) {
  const serviceable = item.serviceable;
  return (
    <div
      className={`rounded-lg border p-3 ${
        serviceable ? "border-emerald-200 bg-emerald-50/50" : "border-zinc-200 bg-zinc-50"
      }`}
    >
      <div className="flex items-start gap-2">
        {serviceable ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
        ) : (
          <XCircle className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{providerLabel(item.provider)}</p>
          <p className="text-sm text-zinc-600 mt-0.5">
            {serviceable ? "Serviceable" : "Not serviceable"}
          </p>
          {item.message ? (
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{item.message}</p>
          ) : null}
          {item.zone_id ? (
            <p className="text-xs text-zinc-500 mt-1">Zone: {item.zone_id}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PublicServiceabilityPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("address");

  const [addressLine, setAddressLine] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [pincodeOnly, setPincodeOnly] = useState("");

  const [redcliffeQuery, setRedcliffeQuery] = useState("");
  const [redcliffePlaces, setRedcliffePlaces] = useState<RedcliffeAreaSearchResult[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PublicServiceabilityProviderResult[] | null>(null);

  const applySuggestion = (suggestion: GeocodeSuggestion) => {
    setAddressLine(suggestion.address || suggestion.display_name || "");
    setLandmark(suggestion.landmark || "");
    setCity(suggestion.city || "");
    setPincode(suggestion.pincode || "");
    setLatitude(suggestion.latitude ?? null);
    setLongitude(suggestion.longitude ?? null);
  };

  const resetModeState = () => {
    setError(null);
    setResults(null);
    setRedcliffePlaces([]);
  };

  const runRedcliffePlaceCheck = async (place: RedcliffeAreaSearchResult) => {
    const eloc = (place.eloc ?? "").trim();
    if (eloc.length !== 6) {
      setError("Selected place has an invalid eloc");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const coordRes = await redcliffePublicApi.getCoordinates(eloc);
      const lat = Number(coordRes.data.data.latitude);
      const lng = Number(coordRes.data.data.longitude);
      const svcRes = await redcliffePublicApi.checkServiceability(lat, lng);
      setResults([svcRes.data.data]);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults(null);
    setLoading(true);
    try {
      if (mode === "pincode") {
        const normalized = pincodeOnly.replace(/\D/g, "").slice(0, 6);
        if (normalized.length !== 6) {
          setError("Enter a valid 6-digit pincode");
          return;
        }
        const res = await publicDiagnosticsApi.checkPincodeServiceability({ pincode: normalized });
        setResults(res.data.data.providers ?? []);
      } else if (mode === "redcliffe") {
        const query = redcliffeQuery.trim();
        if (query.length < 3) {
          setError("Enter at least 3 characters to search an area");
          return;
        }
        const searchRes = await redcliffePublicApi.searchArea(query);
        const places = searchRes.data.data.results ?? [];
        setRedcliffePlaces(places);
        if (places.length === 0) {
          setError("No places found for this area");
        }
      } else {
        const line = addressLine.trim();
        const cityVal = city.trim();
        const pin = pincode.replace(/\D/g, "").slice(0, 6);
        if (!line) {
          setError("Address is required");
          return;
        }
        if (!cityVal) {
          setError("City is required");
          return;
        }
        if (pin.length !== 6) {
          setError("A valid 6-digit pincode is required");
          return;
        }
        const res = await publicDiagnosticsApi.checkServiceability({
          address_line: line,
          city: cityVal,
          pincode: pin,
          landmark: landmark.trim() || undefined,
          latitude,
          longitude,
        });
        setResults(res.data.data.providers ?? []);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4 sm:p-6">
      <div className="w-full max-w-xl p-6 sm:p-8 bg-white rounded-xl shadow-sm border border-zinc-200">
        <div className="text-center mb-6">
          <img src="/super-shyft.png" alt="Supershyft" className="mx-auto h-12 w-auto" />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-900 tracking-tight">
            Home collection serviceability
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Check whether we can collect blood samples at your address or pincode.
          </p>
        </div>

        {!authLoading && isAuthenticated ? (
          <p className="mb-4 text-center">
            <Link to="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Back to dashboard
            </Link>
          </p>
        ) : null}

        <div className="flex rounded-lg border border-zinc-200 p-0.5 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode("address");
              resetModeState();
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === "address"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Address
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("pincode");
              resetModeState();
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === "pincode"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Pincode only
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("redcliffe");
              resetModeState();
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === "redcliffe"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Redcliffe area
          </button>
        </div>

        {error ? (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleCheck} className="space-y-4">
          {mode === "address" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
                <AddressAutocomplete
                  value={addressLine}
                  onChange={setAddressLine}
                  onSelect={applySuggestion}
                  inputClassName={inputClass}
                  search={(q, limit) => publicGeocodeApi.search(q, limit)}
                  searchLimit={5}
                />
              </div>
              <div>
                <label htmlFor="svc-landmark" className="block text-sm font-medium text-zinc-700 mb-1">
                  Landmark (optional)
                </label>
                <input
                  id="svc-landmark"
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className={inputClass}
                  disabled={loading}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="svc-city" className="block text-sm font-medium text-zinc-700 mb-1">
                    City
                  </label>
                  <input
                    id="svc-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={inputClass}
                    disabled={loading}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="svc-pincode" className="block text-sm font-medium text-zinc-700 mb-1">
                    Pincode
                  </label>
                  <input
                    id="svc-pincode"
                    type="text"
                    inputMode="numeric"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className={inputClass}
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            </>
          ) : mode === "redcliffe" ? (
            <div>
              <label htmlFor="svc-redcliffe-area" className="block text-sm font-medium text-zinc-700 mb-1">
                Search area (Redcliffe)
              </label>
              <input
                id="svc-redcliffe-area"
                type="text"
                value={redcliffeQuery}
                onChange={(e) => setRedcliffeQuery(e.target.value)}
                placeholder="e.g. Sector 62 Noida"
                className={inputClass}
                disabled={loading}
                autoFocus
              />
              <p className="mt-1 text-xs text-zinc-500">
                Search uses Redcliffe&apos;s location index. Pick a result to check coverage.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="svc-pincode-only" className="block text-sm font-medium text-zinc-700 mb-1">
                Pincode
              </label>
              <input
                id="svc-pincode-only"
                type="text"
                inputMode="numeric"
                value={pincodeOnly}
                onChange={(e) => setPincodeOnly(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="e.g. 560048"
                className={inputClass}
                disabled={loading}
                autoFocus
              />
              <p className="mt-1 text-xs text-zinc-500">Healthians and Orange Health only.</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking…
              </>
            ) : mode === "redcliffe" ? (
              "Search area"
            ) : (
              "Check serviceability"
            )}
          </button>
        </form>

        {mode === "redcliffe" && redcliffePlaces.length > 0 ? (
          <div className="mt-4 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">Select a place</h2>
            <ul className="space-y-2">
              {redcliffePlaces.map((place) => {
                const key = `${place.eloc ?? ""}-${placeDisplayName(place)}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => runRedcliffePlaceCheck(place)}
                      className="w-full text-left rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      <span className="font-medium text-zinc-900 block">{placeDisplayName(place)}</span>
                      {place.eloc ? (
                        <span className="text-xs text-zinc-500 mt-0.5 block">eloc: {place.eloc}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {results && results.length > 0 ? (
          <div className="mt-6 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">Results</h2>
            {results.map((item) => (
              <ProviderResultCard key={item.provider} item={item} />
            ))}
          </div>
        ) : null}
      </div>

      {!authLoading && !isAuthenticated ? (
        <p className="mt-4 text-sm text-zinc-500">
          <Link to="/login" className="font-medium text-zinc-700 hover:text-zinc-900">
            Staff login
          </Link>
        </p>
      ) : null}
    </div>
  );
}
