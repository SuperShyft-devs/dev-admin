import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { NotificationServiceItem } from "../../lib/api";

function parseKeys(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function joinKeys(keys: string[]): string | null {
  return keys.length > 0 ? keys.join(",") : null;
}

export interface NotificationServiceChipInputProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  services: NotificationServiceItem[];
  excludeKeys?: string[];
  placeholder?: string;
}

export function NotificationServiceChipInput({
  label,
  value,
  onChange,
  services,
  excludeKeys = [],
  placeholder = "Type to search notification services…",
}: NotificationServiceChipInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedKeys = useMemo(() => parseKeys(value), [value]);
  const excludeSet = useMemo(() => new Set(excludeKeys), [excludeKeys]);

  const activeServices = useMemo(
    () => services.filter((s) => s.is_active !== false),
    [services]
  );

  const serviceByKey = useMemo(() => {
    const map = new Map<string, NotificationServiceItem>();
    for (const s of activeServices) {
      map.set(s.service_key, s);
    }
    return map;
  }, [activeServices]);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return activeServices
      .filter((s) => !selectedKeys.includes(s.service_key))
      .filter((s) => !excludeSet.has(s.service_key))
      .filter(
        (s) =>
          s.service_key.toLowerCase().includes(q) ||
          (s.display_name ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [activeServices, excludeSet, input, selectedKeys]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const addKey = (raw: string) => {
    const key = raw.trim();
    if (!key) return;

    if (excludeSet.has(key)) {
      setError(`"${key}" is already used in the other questionnaire reminder`);
      return;
    }

    const svc = serviceByKey.get(key);
    if (!svc) {
      setError(`"${key}" is not a valid active notification service`);
      return;
    }

    if (selectedKeys.includes(key)) {
      setInput("");
      setError(null);
      return;
    }

    onChange(joinKeys([...selectedKeys, key]));
    setInput("");
    setError(null);
    setDropdownOpen(false);
  };

  const removeKey = (key: string) => {
    onChange(joinKeys(selectedKeys.filter((k) => k !== key)));
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length === 1) {
        addKey(suggestions[0].service_key);
        return;
      }
      addKey(input);
    } else if (e.key === "Backspace" && !input && selectedKeys.length > 0) {
      removeKey(selectedKeys[selectedKeys.length - 1]);
    } else if (e.key === "ArrowDown" && suggestions.length > 0) {
      setDropdownOpen(true);
    }
  };

  return (
    <div ref={containerRef}>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-2 rounded-lg border border-zinc-300 text-sm focus-within:ring-2 focus-within:ring-zinc-900 min-h-[42px]">
          {selectedKeys.map((key) => {
            const svc = serviceByKey.get(key);
            const labelText = svc ? `${svc.display_name} (${key})` : key;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-xs max-w-full"
              >
                <span className="truncate">{labelText}</span>
                <button
                  type="button"
                  onClick={() => removeKey(key)}
                  className="text-zinc-500 hover:text-zinc-800 shrink-0"
                  aria-label={`Remove ${key}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
              setDropdownOpen(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => {
              window.setTimeout(() => {
                if (input.trim()) addKey(input);
              }, 120);
            }}
            placeholder={selectedKeys.length === 0 ? placeholder : "Add another…"}
            className="flex-1 min-w-[120px] border-0 p-0 focus:outline-none focus:ring-0 bg-transparent"
            autoComplete="off"
            aria-autocomplete="list"
          />
        </div>
        {dropdownOpen && suggestions.length > 0 && (
          <ul
            className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg py-1"
            role="listbox"
          >
            {suggestions.map((s) => (
              <li key={s.service_key}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addKey(s.service_key)}
                >
                  {s.display_name} ({s.service_key})
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
