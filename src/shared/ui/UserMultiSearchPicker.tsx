import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getApiError, usersApi, type UserDetail, type UserListItem } from "../../lib/api";

function userDetailToListItem(u: UserDetail): UserListItem {
  return {
    user_id: u.user_id,
    first_name: u.first_name,
    last_name: u.last_name,
    age: u.age,
    phone: u.phone,
    email: u.email,
    profile_photo: u.profile_photo,
    is_participant: u.is_participant,
    status: u.status,
  };
}

export function formatUserLabel(u: Pick<UserListItem, "user_id" | "first_name" | "last_name" | "email" | "phone">): string {
  const first = (u.first_name ?? "").trim();
  const last = (u.last_name ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim();
  const base = name || u.email || u.phone || `User #${u.user_id}`;
  return `${base} (#${u.user_id})`;
}

function formatUserSecondary(u: UserListItem): string | null {
  const parts = [u.phone, u.email].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type UserMultiSearchPickerProps = {
  value: number[];
  onChange: (userIds: number[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
};

export function UserMultiSearchPicker({
  value,
  onChange,
  disabled = false,
  label,
  placeholder = "Search by name, phone, or email…",
  className = "",
}: UserMultiSearchPickerProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [options, setOptions] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Record<number, UserListItem>>({});

  const fetchUsers = useCallback(async (searchQuery: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await usersApi.list({
        page: 1,
        limit: 50,
        status: "active",
        search: searchQuery.trim() || undefined,
        sort_by: "name",
        sort_dir: "asc",
      });
      setOptions(res.data.data.filter((user) => !value.includes(user.user_id)));
    } catch (err) {
      setFetchError(getApiError(err));
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const missing = value.filter((id) => !selectedUsers[id]);
    if (missing.length === 0) return;

    (async () => {
      const entries = await Promise.all(
        missing.map(async (userId) => {
          try {
            const res = await usersApi.get(userId);
            return [userId, userDetailToListItem(res.data.data)] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setSelectedUsers((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [value, selectedUsers]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const timer = window.setTimeout(() => {
      void fetchUsers(query);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, dropdownOpen, fetchUsers]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const addUser = (user: UserListItem) => {
    if (value.includes(user.user_id)) return;
    onChange([...value, user.user_id]);
    setSelectedUsers((prev) => ({ ...prev, [user.user_id]: user }));
    setQuery("");
    setDropdownOpen(false);
  };

  const removeUser = (userId: number) => {
    onChange(value.filter((id) => id !== userId));
  };

  return (
    <div ref={rootRef} className={className}>
      {label ? <div className="text-zinc-600 text-xs mb-1">{label}</div> : null}
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((userId) => {
          const user = selectedUsers[userId];
          return (
            <span
              key={userId}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-800"
            >
              {user ? formatUserLabel(user) : `User #${userId}`}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removeUser(userId)}
                  className="text-zinc-500 hover:text-zinc-800"
                  aria-label="Remove user"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>
      {!disabled ? (
        <div className="relative">
          <input
            type="text"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => {
              setDropdownOpen(true);
              if (!query) void fetchUsers("");
            }}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          {loading ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-400 pointer-events-none" />
          ) : null}
          {dropdownOpen ? (
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
                <li className="px-3 py-2 text-sm text-zinc-500">No users found</li>
              ) : (
                options.map((user) => (
                  <li key={user.user_id} role="option">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addUser(user)}
                      className="w-full px-3 py-2 text-left hover:bg-zinc-50"
                    >
                      <div className="text-sm text-zinc-900">{formatUserLabel(user)}</div>
                      {formatUserSecondary(user) ? (
                        <div className="text-xs text-zinc-500 truncate">{formatUserSecondary(user)}</div>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
