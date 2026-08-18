import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { NotificationServiceConfigItem, NotificationServiceItem } from "../../lib/api";

function parseServiceKeys(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function joinServiceKeys(keys: string[]): string | null {
  return keys.length > 0 ? keys.join(",") : null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeNotificationServiceConfigs(raw: unknown): NotificationServiceConfigItem[] {
  if (!Array.isArray(raw)) return [];
  const result: NotificationServiceConfigItem[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item === "string") {
      const service_key = item.trim();
      if (!service_key || seen.has(service_key)) continue;
      seen.add(service_key);
      result.push({ service_key, external_link: null });
      continue;
    }
    if (item && typeof item === "object" && "service_key" in item) {
      const service_key = String((item as NotificationServiceConfigItem).service_key ?? "").trim();
      if (!service_key || seen.has(service_key)) continue;
      seen.add(service_key);
      const externalLinkRaw = (item as NotificationServiceConfigItem).external_link;
      result.push({
        service_key,
        external_link: externalLinkRaw ? String(externalLinkRaw).trim() : null,
      });
    }
  }

  return result;
}

export interface NotificationEventServicesInputProps {
  label: string;
  value: NotificationServiceConfigItem[];
  onChange: (value: NotificationServiceConfigItem[]) => void;
  services: NotificationServiceItem[];
  excludeKeys?: string[];
  placeholder?: string;
}

export function NotificationEventServicesInput({
  label,
  value,
  onChange,
  services,
  excludeKeys = [],
  placeholder = "Type to search notification services…",
}: NotificationEventServicesInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedKeys = useMemo(() => value.map((item) => item.service_key), [value]);
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

  const updateExternalLink = (serviceKey: string, externalLink: string) => {
    onChange(
      value.map((item) =>
        item.service_key === serviceKey
          ? { ...item, external_link: externalLink.trim() || null }
          : item
      )
    );
  };

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

    onChange([...value, { service_key: key, external_link: null }]);
    setInput("");
    setError(null);
    setDropdownOpen(false);
  };

  const removeKey = (key: string) => {
    onChange(value.filter((item) => item.service_key !== key));
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

  const servicesRequiringExternalLink = value.filter(
    (item) => serviceByKey.get(item.service_key)?.require_external_link
  );

  return (
    <div ref={containerRef} className="space-y-3">
      <div>
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

      {servicesRequiringExternalLink.length > 0 && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-medium text-zinc-600">External links</p>
          {servicesRequiringExternalLink.map((item) => {
            const svc = serviceByKey.get(item.service_key);
            const linkValue = item.external_link ?? "";
            const linkInvalid = linkValue.trim().length > 0 && !isValidHttpUrl(linkValue.trim());
            return (
              <div key={item.service_key}>
                <label className="block text-xs text-zinc-600 mb-1">
                  {svc?.display_name ?? item.service_key} URL <span className="text-red-600">*</span>
                </label>
                <input
                  type="url"
                  value={linkValue}
                  onChange={(e) => updateExternalLink(item.service_key, e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
                {linkInvalid && (
                  <p className="mt-1 text-xs text-red-600">Enter a valid http(s) URL.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function validateNotificationServiceConfigs(
  configs: NotificationServiceConfigItem[],
  services: NotificationServiceItem[]
): string | null {
  const serviceByKey = new Map(services.map((s) => [s.service_key, s]));
  for (const item of configs) {
    const svc = serviceByKey.get(item.service_key);
    if (svc?.require_external_link) {
      const link = (item.external_link ?? "").trim();
      if (!link) {
        return `External link is required for ${svc.display_name}.`;
      }
      if (!isValidHttpUrl(link)) {
        return `External link for ${svc.display_name} must be a valid http(s) URL.`;
      }
    }
  }
  return null;
}

export function notificationServiceKeysFromConfigs(
  configs: NotificationServiceConfigItem[]
): string {
  return joinServiceKeys(configs.map((item) => item.service_key)) ?? "";
}

export function notificationConfigsFromLegacyValue(
  raw: unknown,
  legacyValue: string | null | undefined
): NotificationServiceConfigItem[] {
  const normalized = normalizeNotificationServiceConfigs(raw);
  if (normalized.length > 0) return normalized;
  return parseServiceKeys(legacyValue).map((service_key) => ({
    service_key,
    external_link: null,
  }));
}
