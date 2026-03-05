import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  ListChecks,
  Users,
  UserCog,
  CalendarClock,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
  /** Hide this column on mobile (< sm, i.e. < 640px) */
  hideOnMobile?: boolean;
  /** Hide this column on mobile + tablet (< md, i.e. < 768px) */
  hideOnTablet?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onQuestions?: (row: T) => void;
  onParticipants?: (row: T) => void;
  onAssistants?: (row: T) => void;
  onOccupiedSlots?: (row: T) => void;
  firstColumnClickableView?: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T extends object>(
  props: DataTableProps<T>
) {
  const {
    columns,
    data,
    keyExtractor,
    sortKey,
    sortDir,
    onSort,
    onView,
    onEdit,
    onDelete,
    onQuestions,
    onParticipants,
    onAssistants,
    onOccupiedSlots,
    firstColumnClickableView = true,
    pagination,
  } = props;

  const firstKey = columns[0]?.key;
  const hasActions = onView || onEdit || onDelete || onQuestions || onParticipants || onAssistants || onOccupiedSlots;
  const [openActionsRow, setOpenActionsRow] = useState<string | number | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!actionsMenuRef.current) return;
      if (!actionsMenuRef.current.contains(event.target as Node)) {
        setOpenActionsRow(null);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenActionsRow(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  // Build a helper that returns the visibility class for a column
  const visibilityClass = (col: Column<T>) => {
    if (col.hideOnTablet) return "hidden md:table-cell";
    if (col.hideOnMobile) return "hidden sm:table-cell";
    return "";
  };

  return (
    <div className="overflow-x-auto -mx-px">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={
                  "px-3 sm:px-4 py-3 text-left font-medium text-zinc-600 " +
                  visibilityClass(col) +
                  " " + (col.className || "") +
                  (col.sortable ? " cursor-pointer select-none hover:text-zinc-900" : "")
                }
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key &&
                    (sortDir === "asc" ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    ))}
                </span>
              </th>
            ))}
            {hasActions && (
              <th className="px-3 sm:px-4 py-3 text-right font-medium text-zinc-600 w-14 sm:w-16">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (hasActions ? 1 : 0)}
                className="px-4 py-10 text-center text-zinc-500"
              >
                No records found
              </td>
            </tr>
          ) : (
            data.map((row) => {
              const rowKey = keyExtractor(row);
              return (
              <tr
                key={String(rowKey)}
                className="border-b border-zinc-100 hover:bg-zinc-50"
              >
                {columns.map((col, idx) => {
                  const rowRecord = row as Record<string, unknown>;
                  const cell = col.render
                    ? col.render(row)
                    : String(rowRecord[col.key] ?? "");
                  const isFirst = idx === 0;
                  const clickable =
                    isFirst &&
                    firstColumnClickableView &&
                    onView &&
                    firstKey === col.key;

                  return (
                    <td
                      key={col.key}
                      className={
                        "px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-700 " +
                        visibilityClass(col) +
                        " " + (col.className || "") +
                        (clickable
                          ? " cursor-pointer hover:text-zinc-900 hover:underline"
                          : "")
                      }
                      onClick={clickable ? () => onView(row) : undefined}
                    >
                      {cell}
                    </td>
                  );
                })}
                {hasActions && (
                  <td className="px-2 sm:px-4 py-2.5 sm:py-3">
                    <div className="relative flex justify-end" ref={openActionsRow === rowKey ? actionsMenuRef : null}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenActionsRow((curr) =>
                            curr === rowKey ? null : rowKey
                          )
                        }
                        className="p-1.5 sm:p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                        title="Actions"
                        aria-label="Actions"
                        aria-expanded={openActionsRow === rowKey}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openActionsRow === rowKey && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden">
                          {onView && (
                            <button
                              onClick={() => {
                                onView(row);
                                setOpenActionsRow(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                          )}
                          {onEdit && (
                            <button
                              onClick={() => {
                                onEdit(row);
                                setOpenActionsRow(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                          {onParticipants && (
                            <button
                              onClick={() => {
                                onParticipants(row);
                                setOpenActionsRow(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                            >
                              <Users className="w-4 h-4" />
                              View Participants
                            </button>
                          )}
                          {onAssistants && (
                            <button
                              onClick={() => {
                                onAssistants(row);
                                setOpenActionsRow(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                            >
                              <UserCog className="w-4 h-4" />
                              Manage Onboarding Assistants
                            </button>
                          )}
                          {onOccupiedSlots && (
                            <button
                              onClick={() => {
                                onOccupiedSlots(row);
                                setOpenActionsRow(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                            >
                              <CalendarClock className="w-4 h-4" />
                              View Occupied Slots
                            </button>
                          )}
                          {onQuestions && (
                            <button
                              onClick={() => {
                                onQuestions(row);
                                setOpenActionsRow(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                            >
                              <ListChecks className="w-4 h-4" />
                              Manage Questions
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => {
                                onDelete(row);
                                setOpenActionsRow(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                )}
              </tr>
              );
            })
          )}
        </tbody>
      </table>

      {pagination && pagination.total > pagination.limit && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-t border-zinc-200">
          <span className="text-xs sm:text-sm text-zinc-600 order-2 sm:order-1 text-center sm:text-left">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total}
          </span>
          <div className="flex items-center justify-center gap-2 order-1 sm:order-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 sm:p-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs sm:text-sm text-zinc-600">
              Page {pagination.page} of{" "}
              {Math.ceil(pagination.total / pagination.limit)}
            </span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={
                pagination.page >= Math.ceil(pagination.total / pagination.limit)
              }
              className="p-1.5 sm:p-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
