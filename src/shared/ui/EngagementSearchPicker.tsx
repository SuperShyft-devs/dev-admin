import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  engagementsApi,
  getApiError,
  type Engagement,
  type EngagementListItem,
} from "../../lib/api";

function engagementDetailToListItem(e: Engagement): EngagementListItem {
  return {
    engagement_id: e.engagement_id,
    engagement_name: e.engagement_name,
    organization_id: e.organization_id,
    engagement_code: e.engagement_code,
    engagement_type: e.engagement_type,
    assessment_package_id: e.assessment_package_id,
    diagnostic_package_id: e.diagnostic_package_id,
    city: e.city,
    address: e.address,
    pincode: e.pincode,
    slot_duration: e.slot_duration,
    start_date: e.start_date,
    end_date: e.end_date,
    status: e.status,
    participant_count: e.participant_count,
  };
}

function formatEngagementLabel(e: EngagementListItem): string {
  const name = (e.engagement_name ?? e.engagement_code ?? "").trim();
  const base = name || `Engagement #${e.engagement_id}`;
  return `${base} (#${e.engagement_id})`;
}

function formatEngagementSecondary(e: EngagementListItem): string | null {
  const parts = [e.engagement_code, e.city].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

type EngagementSearchPickerProps = {
  value: number;
  onChange: (engagementId: number) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
};

export function EngagementSearchPicker({
  value,
  onChange,
  disabled = false,
  required = false,
  label = "Engagement",
  placeholder = "Search by name or code…",
  className = "",
}: EngagementSearchPickerProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [options, setOptions] = useState<EngagementListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<EngagementListItem | null>(null);

  const fetchEngagements = useCallback(async (searchQuery: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await engagementsApi.list({
        page: 1,
        limit: 50,
        search: searchQuery.trim() || undefined,
        sort_by: "engagement_id",
        sort_dir: "desc",
      });
      setOptions(res.data.data);
    } catch (err) {
      setFetchError(getApiError(err));
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!value || value <= 0) {
      setSelectedEngagement(null);
      return;
    }
    if (selectedEngagement?.engagement_id === value) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await engagementsApi.get(value);
        if (!cancelled) {
          setSelectedEngagement(engagementDetailToListItem(res.data.data));
        }
      } catch {
        if (!cancelled) setSelectedEngagement(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, selectedEngagement?.engagement_id]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const timer = window.setTimeout(() => {
      void fetchEngagements(query);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, dropdownOpen, fetchEngagements]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const displayValue =
    dropdownOpen || !selectedEngagement || value <= 0
      ? query
      : formatEngagementLabel(selectedEngagement);

  const handleInputChange = (next: string) => {
    setQuery(next);
    setDropdownOpen(true);
    if (value > 0) {
      onChange(0);
      setSelectedEngagement(null);
    }
  };

  const handleSelect = (engagement: EngagementListItem) => {
    onChange(engagement.engagement_id);
    setSelectedEngagement(engagement);
    setQuery(formatEngagementLabel(engagement));
    setDropdownOpen(false);
  };

  const showDropdown = dropdownOpen && !disabled;

  return (
    <div ref={rootRef} className={className}>
      <label className="block">
        <span className="text-zinc-600 text-xs">
          {label}
          {required ? " *" : ""}
        </span>
        <div className="relative mt-1">
          <input
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            disabled={disabled}
            value={displayValue}
            placeholder={placeholder}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              setDropdownOpen(true);
              if (selectedEngagement && value > 0) {
                setQuery(formatEngagementLabel(selectedEngagement));
              } else if (!query) {
                void fetchEngagements("");
              }
            }}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-500"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-400 pointer-events-none" />
          )}
          {showDropdown && (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
            >
              {fetchError ? (
                <li className="px-3 py-2 text-sm text-red-600">{fetchError}</li>
              ) : loading && options.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-500">Searching…</li>
              ) : options.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-500">No engagements found</li>
              ) : (
                options.map((engagement) => {
                  const secondary = formatEngagementSecondary(engagement);
                  const isSelected = value === engagement.engagement_id;
                  return (
                    <li key={engagement.engagement_id} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelect(engagement)}
                        className={`w-full px-3 py-2 text-left hover:bg-zinc-50 ${
                          isSelected ? "bg-zinc-50" : ""
                        }`}
                      >
                        <div className="text-sm text-zinc-900">{formatEngagementLabel(engagement)}</div>
                        {secondary ? (
                          <div className="text-xs text-zinc-500 truncate">{secondary}</div>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      </label>
    </div>
  );
}
