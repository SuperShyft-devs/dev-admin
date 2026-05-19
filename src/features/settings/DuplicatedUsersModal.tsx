import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { fetchAllPages } from "../../lib/fetchAllPages";
import { phoneDuplicateKey } from "../../lib/phoneDuplicateKey";
import { getApiError, usersApi, type UserListItem } from "../../lib/api";

export interface DuplicateUserGroup {
  key: string;
  users: UserListItem[];
}

export function findDuplicateUserGroups(users: UserListItem[]): DuplicateUserGroup[] {
  const byKey = new Map<string, UserListItem[]>();

  for (const user of users) {
    const key = phoneDuplicateKey(user.phone);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(user);
    byKey.set(key, list);
  }

  return [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, groupUsers]) => ({
      key,
      users: [...groupUsers].sort((a, b) => a.user_id - b.user_id),
    }))
    .sort((a, b) => b.users.length - a.users.length);
}

function displayName(user: UserListItem): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || "—";
}

interface DuplicatedUsersModalProps {
  open: boolean;
  onClose: () => void;
}

export function DuplicatedUsersModal({ open, onClose }: DuplicatedUsersModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<DuplicateUserGroup[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadDuplicates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const users = await fetchAllPages<UserListItem>((page, limit) =>
        usersApi.list({ page, limit })
      );
      setGroups(findDuplicateUserGroups(users));
    } catch (err) {
      setError(getApiError(err));
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadDuplicates();
    }
  }, [open, loadDuplicates]);

  const handleDelete = async (user: UserListItem) => {
    const name = displayName(user);
    const label = name !== "—" ? name : user.phone ?? `user #${user.user_id}`;
    if (
      !window.confirm(
        `Permanently delete ${label} (${user.phone ?? "no phone"})? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(user.user_id);
    setError(null);
    try {
      await usersApi.delete(user.user_id);
      await loadDuplicates();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const totalDuplicateUsers = groups.reduce((sum, g) => sum + g.users.length, 0);

  return (
    <Modal open={open} onClose={onClose} title="Duplicated users" maxWidthClassName="max-w-2xl">
      <p className="text-sm text-zinc-500 mb-4">
        Users grouped by the last 10 digits of their phone number (e.g.{" "}
        <span className="font-mono text-xs">+91…</span> and a number without country code).
      </p>

      {error ? (
        <p className="text-sm text-red-600 mb-4" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-zinc-600 py-6 text-center">No duplicate phone numbers found.</p>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-zinc-500">
            {groups.length} duplicate {groups.length === 1 ? "group" : "groups"} · {totalDuplicateUsers}{" "}
            users
          </p>
          <ul className="space-y-5">
            {groups.map((group) => (
              <li key={group.key} className="rounded-lg border border-zinc-200 overflow-hidden">
                <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-100 text-xs font-medium text-zinc-600">
                  Phone ending in{" "}
                  <span className="font-mono text-zinc-800">{group.key}</span>
                  <span className="text-zinc-400 font-normal"> · {group.users.length} users</span>
                </div>
                <ul className="divide-y divide-zinc-100">
                  {group.users.map((user) => (
                    <li
                      key={user.user_id}
                      className="flex items-center gap-3 px-3 py-3 hover:bg-zinc-50/80"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900 truncate">{displayName(user)}</p>
                        <p className="text-xs text-zinc-500 truncate">{user.phone ?? "—"}</p>
                        {user.email ? (
                          <p className="text-xs text-zinc-400 truncate">{user.email}</p>
                        ) : null}
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          ID {user.user_id}
                          {user.is_participant === true ? " · Participant" : ""}
                          {user.status ? ` · ${user.status}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDelete(user)}
                        disabled={deletingId === user.user_id}
                        className="shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                        aria-label={`Delete ${displayName(user)}`}
                      >
                        {deletingId === user.user_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
