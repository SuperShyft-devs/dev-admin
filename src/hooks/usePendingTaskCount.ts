import { useCallback, useEffect, useState } from "react";
import { checklistTasksApi } from "../lib/api";

/**
 * Pending checklist task count for the current employee (`status=pending`).
 * Refetches when `refetchKey` changes (e.g. after navigation away from My tasks).
 * Returns `null` if the request fails.
 */
export function usePendingTaskCount(refetchKey: string): number | null {
  const [count, setCount] = useState<number | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await checklistTasksApi.myTasks({ status: "pending" });
      setCount(res.data.data.length);
    } catch {
      setCount(null);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch, refetchKey]);

  return count;
}
