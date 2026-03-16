import type { ReactNode } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableItemProps {
  id: UniqueIdentifier;
  className?: string;
  handleClassName?: string;
  handle: ReactNode;
  children: ReactNode;
}

export function SortableItem({
  id,
  className = "",
  handleClassName = "",
  handle,
  children,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className} ${isDragging ? "ring-2 ring-zinc-900/20" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={`mt-1 text-zinc-400 hover:text-zinc-700 cursor-grab active:cursor-grabbing ${handleClassName}`}
          aria-label="Reorder"
        >
          {handle}
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
