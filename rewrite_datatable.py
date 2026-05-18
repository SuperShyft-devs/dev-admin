import re
import sys

def main():
    file_path = "src/shared/ui/DataTable.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    imports = """import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
"""
    content = content.replace("import { useEffect, useRef, useState } from \"react\";", imports + "import { useEffect, useRef, useState } from \"react\";")

    content = content.replace("  firstColumnClickableView?: boolean;", "  firstColumnClickableView?: boolean;\n  onReorder?: (newOrderKeys: (string | number)[]) => void;")
    content = content.replace("    firstColumnClickableView = true,", "    firstColumnClickableView = true,\n    onReorder,")

    sensors_code = """
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && onReorder) {
      const oldIndex = data.findIndex((item) => keyExtractor(item) === active.id);
      const newIndex = data.findIndex((item) => keyExtractor(item) === over.id);
      
      const newOrder = arrayMove(data.map(d => keyExtractor(d)), oldIndex, newIndex);
      onReorder(newOrder);
    }
  };
"""
    content = content.replace("  const hasActions =", sensors_code + "\n  const hasActions =")

    # Add empty th for drag handle
    content = content.replace("{columns.map((col) => (", "{onReorder && <th className=\"w-10 px-3 sm:px-4 py-3\"></th>}\n            {columns.map((col) => (")

    # Add SortableRow component at the top of the file (after imports)
    sortable_row_code = """
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
  onSendMessage?: (row: T) => void;
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
"""

    content = content.replace("export function DataTable<T extends object>(", sortable_row_code + "\nexport function DataTable<T extends object>(")

    # Replace tbody content
    start_tbody = content.find("<tbody>")
    end_tbody = content.find("</tbody>", start_tbody)
    
    new_tbody = """<tbody>
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
                  hasActions={hasActions}
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
                  onSendMessage={onSendMessage}
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
        </tbody>"""

    content = content[:start_tbody] + new_tbody + content[end_tbody + 8:]

    # Wrap the table in DndContext
    start_table = content.find("<table")
    end_table = content.find("</table>", start_table) + 8
    
    new_table_wrapper = f"""<DndContext 
        sensors={{sensors}}
        collisionDetection={{closestCenter}}
        onDragEnd={{handleDragEnd}}
      >
        {content[start_table:end_table]}
      </DndContext>"""
      
    content = content[:start_table] + new_table_wrapper + content[end_table:]

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
