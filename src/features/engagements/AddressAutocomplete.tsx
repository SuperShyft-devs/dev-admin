import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { geocodeApi, getApiError, type GeocodeSuggestion } from "../../lib/api";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: GeocodeSuggestion) => void;
  inputClassName?: string;
};

export function AddressAutocomplete({ value, onChange, onSelect, inputClassName }: Props) {
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNextSearch = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      geocodeApi
        .search(query, 3)
        .then((res) => {
          if (cancelled) return;
          setSuggestions(res.data.data ?? []);
          setOpen(true);
        })
        .catch((err) => {
          if (cancelled) return;
          setSuggestions([]);
          setError(getApiError(err));
          setOpen(false);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          className={inputClassName}
          placeholder="Start typing an address…"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-400" />
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {suggestions.map((item, index) => (
            <li key={`${item.display_name ?? item.address ?? "s"}-${index}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                onClick={() => {
                  skipNextSearch.current = true;
                  onSelect(item);
                  setOpen(false);
                  setSuggestions([]);
                }}
              >
                {item.display_name || item.address || "Unknown place"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && suggestions.length === 0 && value.trim().length >= 3 && !error && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg px-3 py-2 text-xs text-zinc-500">
          No addresses found
        </div>
      )}
    </div>
  );
}
