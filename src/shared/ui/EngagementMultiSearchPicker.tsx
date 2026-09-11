import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import {
  engagementsApi,
  getApiError,
  type EngagementListItem,
} from "../../lib/api";

export function formatEngagementLabel(e: EngagementListItem): string {
  const name = (e.engagement_name ?? "").trim();
  const code = (e.engagement_code ?? "").trim();
  const base = name || code || `Engagement #${e.engagement_id}`;
  return `${base} (#${e.engagement_id})`;
}

function formatEngagementSecondary(e: EngagementListItem): string | null {
  const parts = [
    e.engagement_code && e.engagement_name ? e.engagement_code : null,
    e.city,
    e.status,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type EngagementMultiSearchPickerProps = {
  value: number[];
  onChange: (engagementIds: number[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
};

type DropdownRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

const DROPDOWN_MAX = 224; // max-h-56
const DROPDOWN_GAP = 4;

export function EngagementMultiSearchPicker({
  value,
  onChange,
  disabled = false,
  label,
  placeholder = "Search engagements…",
  className = "",
}: EngagementMultiSearchPickerProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [options, setOptions] = useState<EngagementListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedById, setSelectedById] = useState<Record<number, EngagementListItem>>({});
  const [menuRect, setMenuRect] = useState<DropdownRect | null>(null);

  const updateMenuRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP;
    const spaceAbove = rect.top - DROPDOWN_GAP;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(DROPDOWN_MAX, available));
    setMenuRect({
      top: openUp ? rect.top - DROPDOWN_GAP : rect.bottom + DROPDOWN_GAP,
      left: rect.left,
      width: rect.width,
      maxHeight,
      openUp,
    });
  }, []);

  const fetchEngagements = useCallback(
    async (searchQuery: string) => {
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
        setOptions(res.data.data.filter((e) => !value.includes(e.engagement_id)));
      } catch (err) {
        setFetchError(getApiError(err));
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [value]
  );

  useEffect(() => {
    let cancelled = false;
    const loadSelected = async () => {
      const missing = value.filter((id) => !selectedById[id]);
      if (missing.length === 0) return;
      await Promise.all(
        missing.map(async (id) => {
          try {
            const res = await engagementsApi.get(id);
            if (cancelled) return;
            const eng = res.data.data as EngagementListItem;
            setSelectedById((prev) => ({ ...prev, [id]: eng }));
          } catch {
            // Label falls back to Engagement #id
          }
        })
      );
    };
    void loadSelected();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when value changes
  }, [value]);

  useEffect(() => {
    if (!dropdownOpen || disabled) return;
    const t = window.setTimeout(() => void fetchEngagements(query), 250);
    return () => window.clearTimeout(t);
  }, [query, dropdownOpen, disabled, fetchEngagements]);

  useLayoutEffect(() => {
    if (!dropdownOpen || disabled) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
  }, [dropdownOpen, disabled, options.length, loading, updateMenuRect]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onReposition = () => updateMenuRect();
    window.addEventListener("resize", onReposition);
    // Capture scroll on any scrollable ancestor (modal body)
    document.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      document.removeEventListener("scroll", onReposition, true);
    };
  }, [dropdownOpen, updateMenuRect]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const addEngagement = (e: EngagementListItem) => {
    if (value.includes(e.engagement_id)) return;
    setSelectedById((prev) => ({ ...prev, [e.engagement_id]: e }));
    onChange([...value, e.engagement_id]);
    setQuery("");
    setDropdownOpen(false);
  };

  const removeEngagement = (id: number) => {
    onChange(value.filter((v) => v !== id));
  };

  const dropdown =
    dropdownOpen && !disabled && menuRect
      ? createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="fixed z-[70] overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
            style={{
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: menuRect.maxHeight,
              ...(menuRect.openUp
                ? { bottom: window.innerHeight - menuRect.top, top: "auto" }
                : { top: menuRect.top }),
            }}
          >
            {loading ? (
              <li className="px-3 py-2 text-sm text-zinc-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching…
              </li>
            ) : fetchError ? (
              <li className="px-3 py-2 text-sm text-red-600">{fetchError}</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-500">No engagements found</li>
            ) : (
              options.map((eng) => (
                <li key={eng.engagement_id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-zinc-50"
                    onClick={() => addEngagement(eng)}
                  >
                    <span className="block text-sm font-medium text-zinc-900">
                      {formatEngagementLabel(eng)}
                    </span>
                    {formatEngagementSecondary(eng) ? (
                      <span className="block text-xs text-zinc-500">
                        {formatEngagementSecondary(eng)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={`space-y-2 ${className}`}>
      {label ? <label className="block text-sm font-medium text-zinc-700">{label}</label> : null}
      <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
        {value.map((id) => {
          const eng = selectedById[id];
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-800"
            >
              {eng ? formatEngagementLabel(eng) : `Engagement #${id}`}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removeEngagement(id)}
                  className="text-zinc-400 hover:text-zinc-700"
                  aria-label={`Remove engagement ${id}`}
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent disabled:bg-zinc-50"
          aria-controls={listboxId}
          aria-expanded={dropdownOpen}
        />
      </div>
      {dropdown}
    </div>
  );
}
