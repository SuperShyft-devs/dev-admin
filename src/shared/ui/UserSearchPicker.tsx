import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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

function formatUserLabel(u: UserListItem): string {
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

type UserSearchPickerProps = {
  value: number;
  onChange: (userId: number) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
};

export function UserSearchPicker({
  value,
  onChange,
  disabled = false,
  required = false,
  label = "User",
  placeholder = "Search by name, phone, or email…",
  className = "",
}: UserSearchPickerProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [options, setOptions] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);

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
      setSelectedUser(null);
      return;
    }
    if (selectedUser?.user_id === value) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await usersApi.get(value);
        if (!cancelled) {
          setSelectedUser(userDetailToListItem(res.data.data));
        }
      } catch {
        if (!cancelled) setSelectedUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, selectedUser?.user_id]);

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

  const displayValue =
    dropdownOpen || !selectedUser || value <= 0 ? query : formatUserLabel(selectedUser);

  const handleInputChange = (next: string) => {
    setQuery(next);
    setDropdownOpen(true);
    if (value > 0) {
      onChange(0);
      setSelectedUser(null);
    }
  };

  const handleSelect = (user: UserListItem) => {
    onChange(user.user_id);
    setSelectedUser(user);
    setQuery(formatUserLabel(user));
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
              if (selectedUser && value > 0) {
                setQuery(formatUserLabel(selectedUser));
              } else if (!query) {
                void fetchUsers("");
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
                <li className="px-3 py-2 text-sm text-zinc-500">No users found</li>
              ) : (
                options.map((user) => {
                  const secondary = formatUserSecondary(user);
                  const isSelected = value === user.user_id;
                  return (
                    <li key={user.user_id} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelect(user)}
                        className={`w-full px-3 py-2 text-left hover:bg-zinc-50 ${
                          isSelected ? "bg-zinc-50" : ""
                        }`}
                      >
                        <div className="text-sm text-zinc-900">{formatUserLabel(user)}</div>
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
      {value > 0 && selectedUser ? (
        <p className="mt-1 text-xs text-zinc-500">Selected user id: {value}</p>
      ) : null}
    </div>
  );
}
