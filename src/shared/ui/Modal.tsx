import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
  /** Extra controls rendered to the left of the close button. */
  headerActions?: React.ReactNode;
  /** Overlay stacking class. Nested modals should use a higher z-index, e.g. z-[60]. */
  zIndexClassName?: string;
}

let openModalCount = 0;
const modalStack: number[] = [];
let nextModalInstanceId = 1;

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClassName,
  headerActions,
  zIndexClassName,
}: ModalProps) {
  const titleId = useId();
  const instanceIdRef = useRef<number | null>(null);
  if (instanceIdRef.current == null) {
    instanceIdRef.current = nextModalInstanceId++;
  }

  useEffect(() => {
    if (!open) return;
    const id = instanceIdRef.current!;
    modalStack.push(id);
    openModalCount += 1;
    document.body.style.overflow = "hidden";

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modalStack[modalStack.length - 1] !== id) return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      const idx = modalStack.lastIndexOf(id);
      if (idx >= 0) modalStack.splice(idx, 1);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = "";
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClassName ?? "z-50"} flex items-end sm:items-center justify-center p-0 sm:p-4`}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`relative w-full ${maxWidthClassName ?? "max-w-lg"} max-h-[92dvh] sm:max-h-[90vh] bg-white rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-zinc-200">
          <h2 id={titleId} className="text-lg font-semibold text-zinc-900">
            {title}
          </h2>
          <div className="flex items-center gap-1">
            {headerActions}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body
  );
}
