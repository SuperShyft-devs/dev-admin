import { useEffect, useMemo, useRef, useState } from "react";

export type MultiSelectOption = {
  id: string;
  label: string;
};

type Props = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
};

export function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  loading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    );
  }, [options, query]);

  const selectedLabels = options.filter((o) => value.includes(o.id)).map((o) => o.label);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[2.5rem] rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-900 disabled:opacity-50"
      >
        {loading
          ? "Loading…"
          : selectedLabels.length
            ? selectedLabels.slice(0, 3).join(", ") +
              (selectedLabels.length > 3 ? ` +${selectedLabels.length - 3}` : "")
            : placeholder}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          <div className="sticky top-0 border-b border-zinc-100 bg-white p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">No options</p>
          ) : (
            filtered.map((opt) => {
              const checked = value.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50"
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(opt.id)} />
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
