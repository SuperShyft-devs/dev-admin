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
  ClipboardCheck,
  Users,
  UserCog,
  CalendarClock,
  CalendarDays,
  Send,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
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
  onQuestionsLabel?: string;
  onParticipants?: (row: T) => void;
  onAssistants?: (row: T) => void;
  onOccupiedSlots?: (row: T) => void;
  /** Engagement checklist manager (shown with ClipboardCheck icon). */
  onManageChecklists?: (row: T) => void;
  onManageChecklistsLabel?: string;
  onViewEngagements?: (row: T) => void;
  onSendMessage?: (row: T) => void;
  renderExtraMenuItems?: (row: T, closeMenu: () => void) => React.ReactNode;
  firstColumnClickableView?: boolean;
  onReorder?: (newOrderKeys: (string | number)[]) => void;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}


interface SortableRowProps<T> {
  row: T;
  rowKey: string | number;
  columns: Column<T>[];
  firstKey?: string;
  hasActions: boolean;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onQuestions?: (row: T) => void;
  onQuestionsLabel: string;
  onParticipants?: (row: T) => void;
  onAssistants?: (row: T) => void;
  onOccupiedSlots?: (row: T) => void;
  onManageChecklists?: (row: T) => void;
  onManageChecklistsLabel: string;
  onViewEngagements?: (row: T) => void;
  onSendMessage?: (row: T) => void;
  renderExtraMenuItems?: (row: T, closeMenu: () => void) => React.ReactNode;
  firstColumnClickableView: boolean;
  openActionsRow: string | number | null;
  setOpenActionsRow: (val: string | number | null | ((curr: string | number | null) => string | number | null)) => void;
  actionsMenuRef: React.RefObject<HTMLDivElement>;
  visibilityClass: (col: Column<T>) => string;
  onReorder?: boolean;
}

function SortableRow<T extends object>(props: SortableRowProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.rowKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    position: isDragging ? "relative" as const : undefined,
    backgroundColor: isDragging ? "var(--bg-zinc-50, #fafafa)" : undefined,
  };

  const { row, rowKey, columns, hasActions, openActionsRow, setOpenActionsRow, actionsMenuRef } = props;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-zinc-100 hover:bg-zinc-50 ${isDragging ? 'shadow-md' : ''}`}
    >
      {props.onReorder && (
        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-400">
          <div {...attributes} {...listeners} className="cursor-grab hover:text-zinc-600">
            <GripVertical className="w-5 h-5" />
          </div>
        </td>
      )}
      {columns.map((col, idx) => {
        const rowRecord = row as Record<string, unknown>;
        const cell = col.render ? col.render(row) : String(rowRecord[col.key] ?? "");
        const isFirst = idx === 0;
        const clickable = isFirst && props.firstColumnClickableView && props.onView && props.firstKey === col.key;

        return (
          <td
            key={col.key}
            className={
              "px-3 sm:px-4 py-2.5 sm:py-3 text-zinc-700 " +
              props.visibilityClass(col) + " " + (col.className || "") +
              (clickable ? " cursor-pointer hover:text-zinc-900 hover:underline" : "")
            }
            onClick={clickable && props.onView ? () => props.onView!(row) : undefined}
          >
            {cell}
          </td>
        );
      })}
      {hasActions && (
        <td className="px-2 sm:px-4 py-2.5 sm:py-3 relative">
          <div className="flex justify-end" ref={openActionsRow === rowKey ? actionsMenuRef : null}>
            <button
              type="button"
              onClick={() => setOpenActionsRow((curr) => (curr === rowKey ? null : rowKey))}
              className="p-1.5 sm:p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              title="Actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {openActionsRow === rowKey && (
              <div className="absolute right-0 top-full z-[999] mt-1 w-52 rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden">
                {props.onView && (
                  <button onClick={() => { props.onView!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <Eye className="w-4 h-4" /> View
                  </button>
                )}
                {props.onEdit && (
                  <button onClick={() => { props.onEdit!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                )}
                {props.onParticipants && (
                  <button onClick={() => { props.onParticipants!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <Users className="w-4 h-4" /> View Participants
                  </button>
                )}
                {props.onAssistants && (
                  <button onClick={() => { props.onAssistants!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <UserCog className="w-4 h-4" /> Manage Onboarding Assistants
                  </button>
                )}
                {props.onOccupiedSlots && (
                  <button onClick={() => { props.onOccupiedSlots!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <CalendarClock className="w-4 h-4" /> View Occupied Slots
                  </button>
                )}
                {props.onManageChecklists && (
                  <button onClick={() => { props.onManageChecklists!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4" /> {props.onManageChecklistsLabel}
                  </button>
                )}
                {props.onViewEngagements && (
                  <button onClick={() => { props.onViewEngagements!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" /> View Engagements
                  </button>
                )}
                {props.renderExtraMenuItems?.(row, () => setOpenActionsRow(null))}
                {props.onQuestions && (
                  <button onClick={() => { props.onQuestions!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <ListChecks className="w-4 h-4" /> {props.onQuestionsLabel}
                  </button>
                )}
                {props.onSendMessage && (
                  <button onClick={() => { props.onSendMessage!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2">
                    <Send className="w-4 h-4" /> Send Message
                  </button>
                )}
                {props.onDelete && (
                  <button onClick={() => { props.onDelete!(row); setOpenActionsRow(null); }} className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </td>
      )}
    </tr>
  );
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
    onQuestionsLabel = "Manage Questions",
    onParticipants,
    onAssistants,
    onOccupiedSlots,
    onManageChecklists,
    onManageChecklistsLabel = "Manage Checklists",
    onViewEngagements,
    onSendMessage,
    renderExtraMenuItems,
    firstColumnClickableView = true,
    onReorder,
    pagination,
  } = props;

  const firstKey = columns[0]?.key;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && onReorder) {
      const activeKey = String(active.id);
      const overKey = String(over.id);
      const oldIndex = data.findIndex((item) => String(keyExtractor(item)) === activeKey);
      const newIndex = data.findIndex((item) => String(keyExtractor(item)) === overKey);
      if (oldIndex < 0 || newIndex < 0) return;

      const newOrder = arrayMove(
        data.map((item) => keyExtractor(item)),
        oldIndex,
        newIndex
      );
      onReorder(newOrder);
    }
  };

  const hasActions =
    onView ||
    onEdit ||
    onDelete ||
    onQuestions ||
    onParticipants ||
    onAssistants ||
    onOccupiedSlots ||
    onManageChecklists ||
    onViewEngagements ||
    onSendMessage ||
    renderExtraMenuItems;
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
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200">
            {onReorder && <th className="w-10 px-3 sm:px-4 py-3"></th>}
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
                colSpan={columns.length + (hasActions ? 1 : 0) + (onReorder ? 1 : 0)}
                className="px-4 py-10 text-center text-zinc-500"
              >
                No records found
              </td>
            </tr>
          ) : (
            <SortableContext 
              items={data.map(d => keyExtractor(d))}
              strategy={verticalListSortingStrategy}
            >
              {data.map((row) => (
                <SortableRow
                  key={String(keyExtractor(row))}
                  row={row}
                  rowKey={keyExtractor(row)}
                  columns={columns}
                  firstKey={firstKey}
                  hasActions={!!hasActions}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onQuestions={onQuestions}
                  onQuestionsLabel={onQuestionsLabel}
                  onParticipants={onParticipants}
                  onAssistants={onAssistants}
                  onOccupiedSlots={onOccupiedSlots}
                  onManageChecklists={onManageChecklists}
                  onManageChecklistsLabel={onManageChecklistsLabel}
                  onViewEngagements={onViewEngagements}
                  onSendMessage={onSendMessage}
                  renderExtraMenuItems={renderExtraMenuItems}
                  firstColumnClickableView={firstColumnClickableView}
                  openActionsRow={openActionsRow}
                  setOpenActionsRow={setOpenActionsRow}
                  actionsMenuRef={actionsMenuRef as any}
                  visibilityClass={visibilityClass}
                  onReorder={!!onReorder}
                />
              ))}
            </SortableContext>
          )}
        </tbody>
      </table>
      </DndContext>

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
