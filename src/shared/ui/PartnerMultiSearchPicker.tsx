import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  getApiError,
  partnersApi,
  type PartnerListItem,
} from "../../lib/api";

export function formatPartnerLabel(
  p: Pick<PartnerListItem, "partner_id" | "name" | "email" | "phone">
): string {
  const name = (p.name ?? "").trim();
  const base = name || p.email || p.phone || `Partner #${p.partner_id}`;
  return `${base} (#${p.partner_id})`;
}

function formatPartnerSecondary(p: PartnerListItem): string | null {
  const parts = [p.phone, p.email, p.role].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type PartnerMultiSearchPickerProps = {
  value: number[];
  onChange: (partnerIds: number[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  /** Defaults to organization_manager for org contact pickers. */
  role?: string;
};

export function PartnerMultiSearchPicker({
  value,
  onChange,
  disabled = false,
  label,
  placeholder = "Search by name, phone, or email…",
  className = "",
  role = "organization_manager",
}: PartnerMultiSearchPickerProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [options, setOptions] = useState<PartnerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedPartners, setSelectedPartners] = useState<Record<number, PartnerListItem>>({});

  const fetchPartners = useCallback(
    async (searchQuery: string) => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await partnersApi.list({
          page: 1,
          limit: 50,
          status: "active",
          role,
          search: searchQuery.trim() || undefined,
          sort_by: "name",
          sort_dir: "asc",
        });
        setOptions(res.data.data.filter((p) => !value.includes(p.partner_id)));
      } catch (err) {
        setFetchError(getApiError(err));
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [value, role]
  );

  useEffect(() => {
    let cancelled = false;
    const loadSelected = async () => {
      const missing = value.filter((id) => !selectedPartners[id]);
      if (missing.length === 0) return;
      try {
        const res = await partnersApi.list({
          page: 1,
          limit: 100,
          status: "active",
          role,
        });
        if (cancelled) return;
        setSelectedPartners((prev) => {
          const next = { ...prev };
          for (const p of res.data.data) {
            if (missing.includes(p.partner_id)) next[p.partner_id] = p;
          }
          return next;
        });
      } catch {
        // Labels fall back to Partner #id
      }
    };
    void loadSelected();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when value/role change
  }, [value, role]);

  useEffect(() => {
    if (!dropdownOpen || disabled) return;
    const t = window.setTimeout(() => void fetchPartners(query), 250);
    return () => window.clearTimeout(t);
  }, [query, dropdownOpen, disabled, fetchPartners]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const addPartner = (p: PartnerListItem) => {
    if (value.includes(p.partner_id)) return;
    setSelectedPartners((prev) => ({ ...prev, [p.partner_id]: p }));
    onChange([...value, p.partner_id]);
    setQuery("");
    setDropdownOpen(false);
  };

  const removePartner = (id: number) => {
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div ref={rootRef} className={`space-y-2 ${className}`}>
      {label ? <label className="block text-sm font-medium text-zinc-700">{label}</label> : null}
      <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
        {value.map((id) => {
          const p = selectedPartners[id];
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-800"
            >
              {p ? formatPartnerLabel(p) : `Partner #${id}`}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removePartner(id)}
                  className="text-zinc-400 hover:text-zinc-700"
                  aria-label={`Remove partner ${id}`}
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
        {dropdownOpen && !disabled ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
          >
            {loading ? (
              <li className="px-3 py-2 text-sm text-zinc-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching…
              </li>
            ) : fetchError ? (
              <li className="px-3 py-2 text-sm text-red-600">{fetchError}</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-500">No partners found</li>
            ) : (
              options.map((p) => (
                <li key={p.partner_id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-zinc-50"
                    onClick={() => addPartner(p)}
                  >
                    <span className="block text-sm font-medium text-zinc-900">
                      {formatPartnerLabel(p)}
                    </span>
                    {formatPartnerSecondary(p) ? (
                      <span className="block text-xs text-zinc-500">{formatPartnerSecondary(p)}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
