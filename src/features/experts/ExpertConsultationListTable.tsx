import { useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, MoreVertical, Search, Users } from "lucide-react";
import { PortalMenu } from "../../shared/ui/PortalMenu";
import type { ConsultationRequestItem } from "../../lib/api";
import {
  consultationRowKey,
  formatExpertType,
  fullConsultationName,
} from "./expertConsultationListUtils";

type ExpertConsultationListTableProps = {
  items: ConsultationRequestItem[];
  filtered: ConsultationRequestItem[];
  search: string;
  onSearchChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  dateOptions: string[];
  countLabel: string;
  emptyIcon: ReactNode;
  emptyMessage: string;
  primaryActionLabel: string;
  onPrimaryAction: (item: ConsultationRequestItem) => void;
  primaryActionDisabled?: (item: ConsultationRequestItem) => boolean;
  primaryActionLoading?: (item: ConsultationRequestItem) => boolean;
  onRowClick?: (item: ConsultationRequestItem) => void;
  renderStatus?: (item: ConsultationRequestItem) => ReactNode;
};

export function ExpertConsultationListTable({
  items,
  filtered,
  search,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  dateOptions,
  countLabel,
  emptyIcon,
  emptyMessage,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled,
  primaryActionLoading,
  onRowClick,
  renderStatus,
}: ExpertConsultationListTableProps) {
  const [actionMenuRow, setActionMenuRow] = useState<string | null>(null);
  const actionMenuAnchorRef = useRef<HTMLButtonElement | null>(null);

  const actionMenuItem = useMemo(
    () => items.find((item) => consultationRowKey(item) === actionMenuRow) ?? null,
    [items, actionMenuRow]
  );

  const closeActionMenu = () => {
    setActionMenuRow(null);
    actionMenuAnchorRef.current = null;
  };

  const rowId = (item: ConsultationRequestItem) => consultationRowKey(item);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Users className="w-4 h-4" />
          <span>
            {filtered.length}
            {filtered.length !== items.length && ` / ${items.length}`} {countLabel}
            {items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search name, phone, email..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
            />
          </div>
          {dateOptions.length > 1 && (
            <select
              value={dateFilter}
              onChange={(e) => onDateFilterChange(e.target.value)}
              className="px-3 py-2 rounded-lg border border-zinc-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="">All dates</option>
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 bg-white border border-zinc-200 rounded-xl">
          {emptyIcon}
          <p className="text-sm mt-3">{emptyMessage}</p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600">Name</th>
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600">Phone</th>
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-zinc-600 hidden sm:table-cell">
                  Email
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden lg:table-cell">
                  Consultation Date
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden lg:table-cell">
                  Slot Time
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden md:table-cell">
                  Expert Type
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden xl:table-cell">
                  Engagement
                </th>
                {renderStatus ? (
                  <th className="text-left px-4 py-3 font-medium text-zinc-600 hidden xl:table-cell">
                    Status
                  </th>
                ) : null}
                <th className="px-2 sm:px-4 py-3 font-medium text-zinc-600 w-10 sm:w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={renderStatus ? 9 : 8}
                    className="px-4 py-12 text-center text-zinc-400"
                  >
                    No {countLabel}s found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const key = rowId(item);
                  const disabled = primaryActionDisabled?.(item) ?? false;
                  const loading = primaryActionLoading?.(item) ?? false;
                  return (
                    <tr
                      key={key}
                      onClick={() => {
                        if (!disabled && onRowClick) onRowClick(item);
                      }}
                      className={`transition-colors ${
                        onRowClick && !disabled
                          ? "hover:bg-zinc-50 cursor-pointer"
                          : "hover:bg-zinc-50"
                      }`}
                    >
                      <td className="px-3 sm:px-4 py-3 font-medium text-zinc-900 truncate">
                        {fullConsultationName(item)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-zinc-600 truncate">
                        {item.phone ?? "—"}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-zinc-600 truncate hidden sm:table-cell">
                        {item.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                        {item.date ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                        {item.slot ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 truncate hidden md:table-cell">
                        {formatExpertType(item.expert_type)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 truncate hidden xl:table-cell">
                        {item.engagement_code ?? `#${item.engagement_id}`}
                      </td>
                      {renderStatus ? (
                        <td className="px-4 py-3 hidden xl:table-cell">{renderStatus(item)}</td>
                      ) : null}
                      <td className="px-2 sm:px-4 py-3 text-center">
                        <button
                          ref={actionMenuRow === key ? actionMenuAnchorRef : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (actionMenuRow === key) {
                              closeActionMenu();
                            } else {
                              actionMenuAnchorRef.current = e.currentTarget;
                              setActionMenuRow(key);
                            }
                          }}
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                          aria-label="Actions"
                          aria-haspopup="menu"
                          aria-expanded={actionMenuRow === key}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <PortalMenu
        open={actionMenuRow !== null}
        anchorRef={actionMenuAnchorRef}
        onClose={closeActionMenu}
        width={180}
      >
        <button
          type="button"
          disabled={
            !actionMenuItem ||
            (primaryActionDisabled?.(actionMenuItem) ?? false) ||
            (actionMenuItem && (primaryActionLoading?.(actionMenuItem) ?? false))
          }
          onClick={(e) => {
            e.stopPropagation();
            if (actionMenuItem) onPrimaryAction(actionMenuItem);
            closeActionMenu();
          }}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {actionMenuItem && primaryActionLoading?.(actionMenuItem) ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          {primaryActionLabel}
        </button>
      </PortalMenu>
    </div>
  );
}
