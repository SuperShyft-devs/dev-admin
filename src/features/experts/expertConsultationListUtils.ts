import { useMemo, useState } from "react";
import type { ConsultationRequestItem } from "../../lib/api";

export function consultationRowKey(item: ConsultationRequestItem): string {
  return `${item.engagement_id}:${item.user_id}:${item.expert_type}`;
}

export function fullConsultationName(item: ConsultationRequestItem): string {
  return [item.first_name, item.last_name].filter(Boolean).join(" ") || "—";
}

export function formatExpertType(typeKey: string): string {
  if (!typeKey) return "—";
  return typeKey.charAt(0).toUpperCase() + typeKey.slice(1).replace(/_/g, " ");
}

export function matchesConsultationSearch(item: ConsultationRequestItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.first_name,
    item.last_name,
    item.phone,
    item.email,
    item.date,
    item.slot,
    item.engagement_code,
    item.expert_type,
    String(item.user_id),
    String(item.engagement_id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function useConsultationListFilter(items: ConsultationRequestItem[]) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const dateOptions = useMemo(() => {
    const dates = new Set<string>();
    items.forEach((item) => {
      if (item.date) dates.add(item.date);
    });
    return Array.from(dates).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let rows = items;
    if (dateFilter) {
      rows = rows.filter((item) => item.date === dateFilter);
    }
    if (search.trim()) {
      rows = rows.filter((item) => matchesConsultationSearch(item, search));
    }
    return rows;
  }, [items, search, dateFilter]);

  return {
    search,
    setSearch,
    dateFilter,
    setDateFilter,
    dateOptions,
    filtered,
  };
}
